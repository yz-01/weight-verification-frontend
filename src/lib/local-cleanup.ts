/**
 * 「清理本地记录」 - what this phone holds, what may be cleared, and what never
 * may (client 2026-10-09 四.3, 四.5, 四.6, 五.6, 五.7; Lucas's decision 4).
 *
 * The cleanup clears **only** the photos the phone keeps as a cache: the list
 * thumbnails the service worker holds (`public/sw.js`, every Cache Storage
 * entry named `mse-trace-photos-*`). Each of them is a copy of a picture the
 * server already has, so the next look downloads it again and nothing is lost.
 *
 * It never touches, and only counts so the worker can see they are safe:
 *
 * - the offline queue (IndexedDB `mse-trace-offline` / `jobs`) - work the
 *   server has not accepted yet;
 * - saved form drafts (`mse-trace-form-drafts` and their text journal);
 * - kept photo originals not yet backed up (`mse-trace-offline` /
 *   `originals`, the originals package, WP1).
 *
 * The rule is one pure function, `protectedOnPhone`, so the screen's sentence
 * and the cleanup cannot disagree. It counts through the originals package's
 * own rule, `protectedLocalItems` (the one every clearing shares): an
 * original that rule protects is exactly one this screen must say is kept.
 *
 * The queue and the originals are read through `lib/offline-db.ts`, so this
 * file never opens `mse-trace-offline` itself - only that module knows its
 * version (4) and upgrades it.
 */

import { draftFileNames } from "@/lib/form-draft-store";
import { getLocalOriginals, getOfflineJobs, type LocalOriginalInfo } from "@/lib/offline-db";
import { protectedLocalItems } from "@/lib/original-photos";

/** Every Cache Storage name that holds only copies of server photos. */
export const PHOTO_CACHE_PREFIX = "mse-trace-photos-";

/** The size header `public/sw.js` writes on each picture it keeps. */
export const PHOTO_BYTES_HEADER = "x-mse-bytes";

export function isPhotoCacheName(name: string): boolean {
  return name.startsWith(PHOTO_CACHE_PREFIX);
}

// ---------------------------------------------------------------------------
// The protection rule (pure)
// ---------------------------------------------------------------------------

/** What this phone holds that is not on the server yet (or not backed up). */
export interface PhoneHoldings {
  /** Queued jobs: submitted on the phone, not accepted by the server yet. */
  jobs: { id: string; payload: unknown }[];
  /** Saved form drafts, as `{ id, values }` (the id names their owner). */
  drafts: { id: string; values: unknown }[];
  /**
   * Names of the photo files saved drafts hold, or `null` when they could not
   * be read - then no original may be taken for an abandoned one.
   */
  draftFileNames: string[] | null;
  /** Kept originals still on the phone (none of them backed up yet). */
  originals: Pick<LocalOriginalInfo, "id" | "ownerId" | "size" | "state" | "capturedAt">[];
}

export interface ProtectedOnPhone {
  /** A: records not sent yet. */
  unsent: number;
  /** B: form drafts with something filled in. */
  drafts: number;
  /** C: photo originals not backed up yet, and their bytes. */
  originals: number;
  originalBytes: number;
}

/** The user a draft belongs to: its key is `[company, user, scope]`. */
function draftOwner(id: string): string | null {
  try {
    const parts = JSON.parse(id) as unknown;
    return Array.isArray(parts) && typeof parts[1] === "string" ? parts[1] : null;
  } catch {
    return null;
  }
}

function hasContent(values: unknown): boolean {
  return Boolean(values) && typeof values === "object" && Object.keys(values as object).length > 0;
}

/**
 * What no cleanup may remove, counted for one worker (四.6, 五.7).
 *
 * A draft whose key cannot be read is counted as theirs: overstating what is
 * kept is harmless, understating it is the mistake this screen exists to
 * prevent. For the same reason, when the drafts' photo names could not be
 * read every original counts as kept.
 */
export function protectedOnPhone(
  holdings: PhoneHoldings,
  userId: string,
  now: number = Date.now(),
): ProtectedOnPhone {
  const drafts = holdings.drafts.filter((draft) => {
    const owner = draftOwner(draft.id);
    return (owner === null || owner === userId) && hasContent(draft.values);
  });
  const mine = holdings.originals.filter((row) => !row.ownerId || row.ownerId === userId);
  const kept = protectedLocalItems(
    { jobs: holdings.jobs, originals: mine, draftFileNames: holdings.draftFileNames ?? [] },
    now,
  );
  const originals =
    holdings.draftFileNames === null ? mine : mine.filter((row) => kept.originalIds.has(row.id));
  return {
    unsent: kept.jobIds.size,
    drafts: drafts.length,
    originals: originals.length,
    originalBytes: originals.reduce((sum, row) => sum + (row.size ?? 0), 0),
  };
}

// ---------------------------------------------------------------------------
// The photo cache: count and clear
// ---------------------------------------------------------------------------

export interface PhotoCacheSummary {
  count: number;
  bytes: number;
}

/** The slice of Cache Storage used here, so tests can pass their own. */
export type CacheStore = Pick<CacheStorage, "keys" | "open" | "delete">;

function browserCaches(): CacheStore | null {
  return typeof caches === "undefined" ? null : caches;
}

/** How many pictures the phone keeps as a cache, and roughly how many bytes. */
export async function photoCacheSummary(
  store: CacheStore | null = browserCaches(),
): Promise<PhotoCacheSummary> {
  if (!store) return { count: 0, bytes: 0 };
  let count = 0;
  let bytes = 0;
  for (const name of (await store.keys()).filter(isPhotoCacheName)) {
    const cache = await store.open(name);
    const keys = await cache.keys();
    count += keys.length;
    for (const key of keys) {
      const entry = await cache.match(key);
      const size = Number(
        entry?.headers.get(PHOTO_BYTES_HEADER) || entry?.headers.get("content-length") || 0,
      );
      if (Number.isFinite(size)) bytes += size;
    }
  }
  return { count, bytes };
}

/**
 * Clear the cached photos - and nothing else.
 *
 * Deletes whole caches by name, only those named `mse-trace-photos-*`. The
 * app shell cache stays (the app must still open offline); IndexedDB and
 * localStorage are not opened at all, so the queue, the drafts and the
 * originals cannot be reached from here.
 */
export async function clearPhotoCaches(
  store: CacheStore | null = browserCaches(),
): Promise<PhotoCacheSummary> {
  if (!store) return { count: 0, bytes: 0 };
  const cleared = await photoCacheSummary(store);
  for (const name of (await store.keys()).filter(isPhotoCacheName)) {
    await store.delete(name);
  }
  return cleared;
}

// ---------------------------------------------------------------------------
// Reading what the phone holds (defensive: any failure reads as "none here")
// ---------------------------------------------------------------------------

/**
 * Open an IndexedDB database only if it already exists, at whatever version
 * it is. Opening without a version never upgrades it; a database that is not
 * there is not created (the upgrade is aborted). The connection steps aside
 * if the app itself needs to upgrade while it is open.
 */
function openExisting(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function readAll<T>(database: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve) => {
    if (!database.objectStoreNames.contains(storeName)) {
      resolve([]);
      return;
    }
    try {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve((request.result ?? []) as T[]);
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

const DRAFT_JOURNAL_PREFIX = "mse-form-draft:v1:";

/** Saved drafts: the IndexedDB rows, with a newer text journal winning. */
async function readDrafts(): Promise<PhoneHoldings["drafts"]> {
  const byId = new Map<string, unknown>();
  const database = await openExisting("mse-trace-form-drafts");
  if (database) {
    try {
      for (const row of await readAll<{ id: string; values: unknown }>(database, "drafts")) {
        byId.set(row.id, row.values);
      }
    } finally {
      database.close();
    }
  }
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(DRAFT_JOURNAL_PREFIX)) continue;
      try {
        byId.set(key.slice(DRAFT_JOURNAL_PREFIX.length), JSON.parse(localStorage.getItem(key) ?? "{}"));
      } catch {
        // An unreadable journal is still a draft somebody typed.
        byId.set(key.slice(DRAFT_JOURNAL_PREFIX.length), { unreadable: true });
      }
    }
  } catch {
    // No localStorage (private window): the IndexedDB rows are what there is.
  }
  return [...byId].map(([id, values]) => ({ id, values }));
}

/**
 * Everything the protection rule needs, read from this phone.
 *
 * The queue and the kept originals come through `lib/offline-db.ts` (the
 * originals package's `getLocalOriginals`), the drafts' photo names through
 * the draft store - the same reads `pruneAbandonedOriginals` makes.
 */
export async function readPhoneHoldings(ownerId: string): Promise<PhoneHoldings> {
  const [jobs, drafts, fileNames, originals] = await Promise.all([
    getOfflineJobs(ownerId).catch(() => []),
    readDrafts().catch(() => []),
    draftFileNames().catch(() => null),
    getLocalOriginals(ownerId).catch(() => []),
  ]);
  return { jobs, drafts, draftFileNames: fileNames, originals };
}

/** The browser's own figure for everything this app stores on the phone. */
export async function storageUsage(): Promise<{ usage: number; quota: number } | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate) return null;
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
  } catch {
    return null;
  }
}

/** Bytes as the phone shows them: one decimal of a megabyte. */
export function megabytes(bytes: number): string {
  return (Math.max(0, bytes) / (1024 * 1024)).toFixed(1);
}
