/**
 * The full original of every photo the phone takes (H5 三, WP1).
 *
 * What the client asked for (2026-10-09, section 三) and what Lucas decided the
 * same day:
 *
 * - every photo taken with the in-app camera keeps an original, apart from the
 *   compressed application photo, which does not change (三.1, 三.2);
 * - the original is the frame the camera captured, saved at high quality and
 *   full captured resolution (about 1-2 MB at 1080p). It is not the phone
 *   camera's own 3-5 MB file: the way photos are taken does not change;
 * - the application photo goes first; the original follows on a second,
 *   lower-priority queue, started by hand or - with 「连原图一起上传」 on -
 *   right after (三.3, 三.4);
 * - four states; 「原图已备份」 comes only from the server (三.5, 三.6);
 * - an original that is not backed up is never cleared by the system (三.8).
 *
 * This module holds what does not talk to the API: naming, hashing, keeping,
 * the manifest an upload carries, and the pure rules (protection, status,
 * storage warning). `services/original-sync.service.ts` does the uploading.
 * The API client imports this file, so it must never import the API client.
 */

import type { OriginalBackupSummary, OriginalStatus } from "@/interfaces/evidence";
import {
  getLocalOriginal,
  getLocalOriginals,
  putLocalOriginal,
  updateLocalOriginal,
  type LocalOriginal,
  type LocalOriginalInfo,
  type LocalOriginalState,
} from "@/lib/offline-db";

/** Said whenever the kept originals change, so every count on screen follows. */
export const ORIGINALS_CHANGED = "mse:originals-changed";
/** Asks the running app to start 「同步原图」 (the 「连原图一起上传」 switch). */
export const ORIGINALS_SYNC_REQUESTED = "mse:originals-sync-requested";

/** JPEG quality of the kept original: near-lossless, about 1-2 MB at 1080p. */
export const ORIGINAL_QUALITY = 0.95;

/** The form field an upload carries its declarations in (the server reads it). */
export const MANIFEST_FIELD = "original_manifest";

/**
 * A taken photo whose record never reached the server (retaken, or the form
 * was abandoned) and that no queued job or saved draft still holds is not
 * the original of anything. Kept this long, then it may go.
 */
export const ABANDONED_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Waiting originals above this warn on screen (三.重要: 明确提示). */
export const WAITING_WARN_BYTES = 200 * 1024 * 1024;

const TOKEN = /-o([0-9a-f]{32})(?:\.[A-Za-z0-9]+)?$/;

/** A fresh id for one shot: 32 hex characters. */
export function newOriginalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replaceAll("-", "");
  }
  let id = "";
  for (let index = 0; index < 32; index += 1) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

/** `mse-site-…jpg` -> `mse-site-…-o<id>.jpg`: the application photo names its original. */
export function nameWithOriginal(name: string, id: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)}-o${id}${name.slice(dot)}` : `${name}-o${id}`;
}

/** The original id an application photo's file name carries, or null. */
export function originalIdOf(name: string): string | null {
  return TOKEN.exec(name)?.[1] ?? null;
}

/** Whether this browser can hash files (needs a secure context). */
export function canHash(): boolean {
  return typeof crypto !== "undefined" && Boolean(crypto.subtle?.digest);
}

/** Lower-case hex SHA-256 of a blob. */
export async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The signed-in person's id, read from the session token.
 *
 * The camera is a shared component that also renders where there is no
 * signed-in worker (an external collector's link), so it cannot rely on the
 * auth provider; no id means no original is kept.
 */
export function sessionUserId(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(
      atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    ) as { user_id?: unknown };
    return typeof decoded.user_id === "string" && decoded.user_id ? decoded.user_id : null;
  } catch {
    return null;
  }
}

export function announceOriginalsChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ORIGINALS_CHANGED));
}

/**
 * Keep the original of one shot. Never throws: a phone that cannot store it
 * (no IndexedDB, storage full) still has its application photo, which is the
 * record; the worker sees 「应用照片已上传」 and no original for it.
 */
export async function keepOriginal(input: {
  id: string;
  ownerId: string;
  blob: Blob;
  width: number;
  height: number;
  photo: Blob;
  photoName: string;
}): Promise<boolean> {
  try {
    if (!canHash()) return false;
    const [sha256, photoSha256] = await Promise.all([sha256Hex(input.blob), sha256Hex(input.photo)]);
    await putLocalOriginal({
      id: input.id,
      ownerId: input.ownerId,
      blob: input.blob,
      sha256,
      size: input.blob.size,
      width: input.width,
      height: input.height,
      capturedAt: new Date().toISOString(),
      photoName: input.photoName,
      photoSha256,
      state: "captured",
      attempts: 0,
    });
    announceOriginalsChanged();
    void requestPersistentStorage();
    return true;
  } catch {
    return false;
  }
}

/** Originals being written right now, by id (see `trackOriginal`). */
const keeping = new Map<string, Promise<boolean>>();

/** The longest an upload waits for its manifest before it goes without one. */
export const MANIFEST_WAIT_MS = 8_000;

/** How long an upload waits for an original still being written. */
const KEEP_WAIT_MS = 5_000;

/**
 * Note that the original of shot `id` is being written.
 *
 * The camera hands the application photo over at once and keeps the original
 * a moment later; an upload sent in that moment waits for it (bounded), so
 * its declaration is not lost to a race.
 */
export function trackOriginal(id: string, keep: Promise<boolean>): void {
  keeping.set(id, keep);
  void keep.finally(() => {
    if (keeping.get(id) === keep) keeping.delete(id);
  });
}

async function settled(id: string): Promise<void> {
  const keep = keeping.get(id);
  if (!keep) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    keep.catch(() => false),
    new Promise((resolve) => {
      timer = setTimeout(resolve, KEEP_WAIT_MS);
    }),
  ]);
  clearTimeout(timer);
}

export interface ManifestEntry {
  photo_sha256: string;
  photo_name: string;
  sha256: string;
  size: number;
  captured_at: string;
}

/** What an upload declared: the originals to mark 「原图待同步」 once it lands. */
export interface Declared {
  id: string;
  photoSha256: string;
}

/**
 * Whether an upload carries photos named for a kept original and has not
 * declared them yet. Synchronous, so every other upload is sent exactly as
 * before, without waiting a tick.
 */
export function carriesOriginals(body: FormData): boolean {
  if (body.has(MANIFEST_FIELD)) return false;
  let found = false;
  body.forEach((value) => {
    if (!found && typeof File !== "undefined" && value instanceof File && originalIdOf(value.name)) {
      found = true;
    }
  });
  return found;
}

/**
 * Add `original_manifest` to an upload that carries photos with kept originals.
 *
 * For each such photo: the SHA-256 of the bytes being sent (the server finds
 * the photo's ledger row by it), and the SHA-256 and size of the original
 * this phone keeps. That declaration is what lets the server say 「原图待同步」
 * now and 「原图已备份」 only when exactly these bytes arrive (三.6, 三.7).
 *
 * Never throws and never blocks the upload: a photo whose original cannot be
 * found or hashed simply goes without a declaration, and the whole step gives
 * up after `waitMs` (the upload then goes without any manifest).
 */
export async function attachOriginalManifest(
  body: FormData,
  waitMs: number = MANIFEST_WAIT_MS,
): Promise<Declared[]> {
  if (body.has(MANIFEST_FIELD)) return [];
  // IndexedDB can stall (iOS Safari after the tab is resumed, a version change
  // blocked by another tab). The application photo must never wait on that:
  // past the bound the upload goes without the manifest, the original stays
  // `captured`, and 「同步原图」 sends it with `photo_sha256` so the server
  // declares it on arrival.
  let abandoned = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = buildManifest(body).then(({ entries, declared }) => {
    if (abandoned || entries.length === 0 || body.has(MANIFEST_FIELD)) return [];
    body.append(MANIFEST_FIELD, JSON.stringify(entries));
    return declared;
  });
  const giveUp = new Promise<Declared[]>((resolve) => {
    timer = setTimeout(() => {
      abandoned = true;
      resolve([]);
    }, waitMs);
  });
  try {
    return await Promise.race([work, giveUp]);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function buildManifest(
  body: FormData,
): Promise<{ entries: ManifestEntry[]; declared: Declared[] }> {
  const none = { entries: [], declared: [] };
  try {
    if (!canHash()) return none;
    const photos: File[] = [];
    body.forEach((value) => {
      if (typeof File !== "undefined" && value instanceof File && originalIdOf(value.name)) {
        photos.push(value);
      }
    });
    if (photos.length === 0) return none;
    const entries: ManifestEntry[] = [];
    const declared: Declared[] = [];
    for (const photo of photos) {
      const id = originalIdOf(photo.name) as string;
      await settled(id);
      const original = await getLocalOriginal(id);
      if (!original) continue;
      const photoSha256 = await sha256Hex(photo);
      entries.push({
        photo_sha256: photoSha256,
        photo_name: photo.name,
        sha256: original.sha256,
        size: original.size,
        captured_at: original.capturedAt,
      });
      declared.push({ id, photoSha256 });
    }
    return { entries, declared };
  } catch {
    return none;
  }
}

/**
 * The upload landed: its originals now wait for 「同步原图」.
 *
 * A failed original keeps its failure (the worker still has to send it); only
 * a `captured` one moves on.
 */
export async function markOriginalsDeclared(declared: Declared[]): Promise<void> {
  if (declared.length === 0) return;
  try {
    const now = new Date().toISOString();
    for (const entry of declared) {
      const current = await getLocalOriginal(entry.id);
      if (!current) continue;
      await updateLocalOriginal(entry.id, {
        photoSha256: entry.photoSha256,
        declaredAt: current.declaredAt ?? now,
        state: current.state === "captured" ? "pending" : current.state,
      });
    }
    announceOriginalsChanged();
    if (typeof window !== "undefined") window.dispatchEvent(new Event(ORIGINALS_SYNC_REQUESTED));
  } catch {
    // The server has the declaration; the next sync's status check catches up.
  }
}

// ---------------------------------------------------------------------------
// The switch, storage, and the pure rules
// ---------------------------------------------------------------------------

const AUTO_KEY = "mse-originals-auto:";

/** 「连原图一起上传」 for this person on this phone. Off unless they turn it on. */
export function readAutoSync(ownerId: string): boolean {
  try {
    return window.localStorage.getItem(AUTO_KEY + ownerId) === "1";
  } catch {
    return false;
  }
}

export function writeAutoSync(ownerId: string, on: boolean): void {
  try {
    if (on) window.localStorage.setItem(AUTO_KEY + ownerId, "1");
    else window.localStorage.removeItem(AUTO_KEY + ownerId);
  } catch {
    // A browser that refuses storage keeps the switch off.
  }
}

export interface StorageInfo {
  /** `navigator.storage.persist()`'s answer; null where the browser has none. */
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
}

/**
 * Ask the browser not to clear this site's storage under pressure.
 *
 * Android Chrome usually grants it to an installed app; iOS may grant it and
 * still clear storage (三.重要). The screen shows the answer and the design
 * assumes it can fail - which is why 「同步原图」 exists at all.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return null;
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function readStorageInfo(): Promise<StorageInfo> {
  const info: StorageInfo = { persisted: null, usage: null, quota: null };
  try {
    if (typeof navigator === "undefined" || !navigator.storage) return info;
    if (navigator.storage.persisted) info.persisted = await navigator.storage.persisted();
    if (navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      info.usage = estimate.usage ?? null;
      info.quota = estimate.quota ?? null;
    }
  } catch {
    // Unknown is shown as unknown.
  }
  return info;
}

export type StorageWarning = "none" | "high" | "full";

/**
 * Whether to warn about space: the browser near its allowance, or a lot of
 * originals still only on this phone.
 */
export function storageWarning(info: StorageInfo, waitingBytes: number): StorageWarning {
  if (info.usage != null && info.quota) {
    const share = info.usage / info.quota;
    if (share >= 0.9) return "full";
    if (share >= 0.7) return "high";
  }
  return waitingBytes >= WAITING_WARN_BYTES ? "high" : "none";
}

/** Whole megabytes, at least 0.1, for 「约 N MB」. */
export function megabytes(bytes: number): string {
  if (bytes <= 0) return "0";
  const value = bytes / (1024 * 1024);
  return value < 0.1 ? "0.1" : value < 10 ? value.toFixed(1) : String(Math.round(value));
}

/** What 「同步原图」 will send: the kept originals whose record has reached the server. */
export function waitingOriginals<T extends Pick<LocalOriginalInfo, "state">>(rows: T[]): T[] {
  return rows.filter((row) => row.state === "pending" || row.state === "failed");
}

export interface LocalSummary {
  /** Kept originals waiting to be sent (record uploaded). */
  waiting: number;
  waitingBytes: number;
  failed: number;
  /** Taken, record not uploaded yet. */
  captured: number;
  /** Every byte of original this phone holds. */
  heldBytes: number;
}

export function summariseLocal(rows: Pick<LocalOriginalInfo, "state" | "size">[]): LocalSummary {
  const waiting = waitingOriginals(rows);
  return {
    waiting: waiting.length,
    waitingBytes: waiting.reduce((sum, row) => sum + row.size, 0),
    failed: rows.filter((row) => row.state === "failed").length,
    captured: rows.filter((row) => row.state === "captured").length,
    heldBytes: rows.reduce((sum, row) => sum + row.size, 0),
  };
}

/** Every file name a queued job holds (photos inside its payload, at any depth). */
export function fileNamesIn(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) fileNamesIn(entry, into);
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.name === "string" && "blob" in record) into.add(record.name);
    else for (const entry of Object.values(record)) fileNamesIn(entry, into);
  }
  return into;
}

export interface LocalInventory {
  /** Every queued job: an upload not yet accepted by the server. */
  jobs: { id: string; payload: unknown }[];
  originals: Pick<LocalOriginalInfo, "id" | "state" | "capturedAt">[];
  /** Names of photo files held by saved form drafts. */
  draftFileNames?: Iterable<string>;
}

export interface ProtectedItems {
  /** Queued jobs: never cleared by the system (四.6, 五.7). */
  jobIds: Set<string>;
  /** Kept originals that are not backed up and still belong to work (三.8). */
  originalIds: Set<string>;
}

/**
 * What no automatic or one-press cleanup may remove from this phone.
 *
 * Shared with the six-month history cleanup (WP2): every clearing goes
 * through this one function, so a new clearing cannot forget a rule.
 *
 * - Every queued job - it is work the server has not accepted yet.
 * - Every kept original whose record reached the server and is not yet
 *   backed up (`pending`, `failed`) - backed-up ones are not on the phone
 *   any more, the server's verified copy replaced them.
 * - Every `captured` original a queued job or a saved draft still holds, and
 *   every one younger than `ABANDONED_AFTER_MS`.
 *
 * What is left is a shot whose record was never sent (retaken, or the form
 * abandoned) for a week: not the original of anything on the server.
 */
export function protectedLocalItems(inventory: LocalInventory, now: number = Date.now()): ProtectedItems {
  const jobIds = new Set(inventory.jobs.map((job) => job.id));
  const held = new Set<string>();
  for (const job of inventory.jobs) {
    for (const name of fileNamesIn(job.payload)) {
      const id = originalIdOf(name);
      if (id) held.add(id);
    }
  }
  for (const name of inventory.draftFileNames ?? []) {
    const id = originalIdOf(name);
    if (id) held.add(id);
  }
  const originalIds = new Set<string>();
  for (const original of inventory.originals) {
    const taken = Date.parse(original.capturedAt);
    const young = !Number.isFinite(taken) || now - taken < ABANDONED_AFTER_MS;
    if (original.state !== "captured" || held.has(original.id) || young) {
      originalIds.add(original.id);
    }
  }
  return { jobIds, originalIds };
}

// ---------------------------------------------------------------------------
// The four states (三.5)
// ---------------------------------------------------------------------------

export interface ShownStatus {
  status: OriginalStatus;
  /** Originals the server waits for that this phone still holds. */
  heldHere: LocalOriginalInfo[];
  /** …and how many it waits for that this phone no longer has. */
  missingHere: number;
}

/**
 * One record's status as the phone shows it.
 *
 * The server's word is the base and the only source of 「原图已备份」 (三.6).
 * The phone may only make it worse: a waiting original whose last attempt here
 * failed reads 「同步失败」.
 */
export function shownStatus(
  summary: OriginalBackupSummary | null | undefined,
  local: LocalOriginalInfo[],
): ShownStatus {
  if (!summary) return { status: "APPLICATION_UPLOADED", heldHere: [], missingHere: 0 };
  const bySha = new Map(local.map((row) => [row.sha256, row]));
  const heldHere = summary.waiting_sha256
    .map((sha) => bySha.get(sha))
    .filter((row): row is LocalOriginalInfo => Boolean(row));
  const missingHere = summary.waiting_sha256.length - heldHere.length;
  let status = summary.status;
  if (status === "ORIGINAL_PENDING" && heldHere.some((row) => row.state === "failed")) {
    status = "ORIGINAL_FAILED";
  }
  return { status, heldHere, missingHere };
}

export type { LocalOriginal, LocalOriginalInfo, LocalOriginalState, OriginalBackupSummary, OriginalStatus };
export { getLocalOriginals };
