/**
 * 「同步原图」: the second, low-priority upload queue (H5 三.3, 三.4, WP1).
 *
 * The application photos' queue (`offline-sync.service`) always goes first.
 * This one sends one original at a time and, before each, waits for any pass
 * of that queue in progress - so a record's photos are never stuck behind a
 * megabyte of original. It never runs in the background on its own: the
 * worker presses 「同步原图」, or has turned on 「连原图一起上传」, and either
 * way it only runs while the app is open (iOS has no background sync).
 *
 * Each original is first checked with the server: one already backed up (from
 * an earlier attempt whose answer was lost) is dropped here without being sent
 * again (五.4). One the server verifies is then deleted from the phone (五.5);
 * the phone never decides on its own that an original is backed up (三.6).
 */

import { ApiError } from "@/interfaces/api";
import { draftFileNames } from "@/lib/form-draft-store";
import {
  deleteLocalOriginal,
  getLocalOriginal,
  getLocalOriginals,
  getOfflineJobs,
  updateLocalOriginal,
  type LocalOriginalInfo,
} from "@/lib/offline-db";
import { announceOriginalsChanged, protectedLocalItems } from "@/lib/original-photos";
import { api } from "@/services/api-client";
import { offlineFlushInFlight } from "@/services/offline-sync.service";

// Module level on purpose: this is the second queue's engine, reached by every
// screen that imports it, not by one exported call.
const STATUS_PATH = "/api/evidence-originals/get_original_status/";
const UPLOAD_PATH = "/api/evidence-originals/upload_original/";

export interface ServerOriginalStatus {
  status: "NOT_EXPECTED" | "ORIGINAL_PENDING" | "ORIGINAL_BACKED_UP" | "ORIGINAL_FAILED";
  verified_at?: string | null;
  last_error?: string | null;
}

export interface OriginalStatusAnswer {
  results: Record<string, ServerOriginalStatus>;
  /** Which of the asked application photos the server holds from this person. */
  photos?: Record<string, boolean>;
}

export function getOriginalStatuses(
  sha256: string[],
  photoSha256: string[] = [],
): Promise<OriginalStatusAnswer> {
  return api.post(STATUS_PATH, { sha256, photo_sha256: photoSha256 }, { silent: true });
}

function uploadOriginal(original: { blob: Blob; sha256: string; photoSha256: string; id: string }) {
  const data = new FormData();
  data.append("file", new File([original.blob], `original-${original.id}.jpg`, { type: original.blob.type || "image/jpeg" }));
  data.append("sha256", original.sha256);
  if (original.photoSha256) data.append("photo_sha256", original.photoSha256);
  return api.post<{ status: string }>(UPLOAD_PATH, data, { silent: true });
}

export interface OriginalSyncProgress {
  running: boolean;
  done: number;
  total: number;
  /** Bytes still to send in this run. */
  remainingBytes: number;
}

export interface OriginalSyncResult {
  backedUp: number;
  failed: number;
  /** Waiting for their record to reach the server first. */
  notYet: number;
}

let progress: OriginalSyncProgress = { running: false, done: 0, total: 0, remainingBytes: 0 };
const listeners = new Set<() => void>();

function setProgress(next: OriginalSyncProgress) {
  progress = next;
  listeners.forEach((listener) => listener());
}

/** For `useSyncExternalStore`: where the run in progress is. */
export function subscribeOriginalSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function originalSyncProgress(): OriginalSyncProgress {
  return progress;
}

let inFlight: Promise<OriginalSyncResult> | null = null;

/**
 * Send this person's waiting originals - all of them, or only `ids` (one
 * record's 「同步原图」). A second press while a run is going joins it.
 */
export function syncOriginals(ownerId: string, ids?: string[]): Promise<OriginalSyncResult> {
  if (inFlight) return inFlight;
  inFlight = run(ownerId, ids).finally(() => {
    inFlight = null;
    setProgress({ running: false, done: 0, total: 0, remainingBytes: 0 });
    announceOriginalsChanged();
  });
  return inFlight;
}

function offline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function run(ownerId: string, ids?: string[]): Promise<OriginalSyncResult> {
  const result: OriginalSyncResult = { backedUp: 0, failed: 0, notYet: 0 };
  const wanted = ids ? new Set(ids) : null;
  const rows = (await getLocalOriginals(ownerId)).filter((row) => !wanted || wanted.has(row.id));
  if (rows.length === 0 || offline()) return result;

  // One question for the lot: what the server already has, and which records
  // have reached it at all.
  let statuses: Record<string, ServerOriginalStatus> = {};
  let photos: Record<string, boolean> = {};
  try {
    const answer = await getOriginalStatuses(
      rows.map((row) => row.sha256),
      rows.filter((row) => row.state === "captured").map((row) => row.photoSha256),
    );
    statuses = answer.results ?? {};
    photos = answer.photos ?? {};
  } catch {
    statuses = {};
  }

  const toSend: LocalOriginalInfo[] = [];
  for (const row of rows) {
    const server = statuses[row.sha256]?.status;
    if (server === "ORIGINAL_BACKED_UP") {
      await deleteLocalOriginal(row.id);
      result.backedUp += 1;
    } else if (
      row.state === "captured" &&
      server !== "ORIGINAL_PENDING" &&
      server !== "ORIGINAL_FAILED" &&
      !photos[row.photoSha256]
    ) {
      // Its record is still on the phone (in the queue or a form): the
      // application photo goes first (三.3).
      result.notYet += 1;
    } else {
      toSend.push(row);
    }
  }

  let remainingBytes = toSend.reduce((sum, row) => sum + row.size, 0);
  setProgress({ running: true, done: 0, total: toSend.length, remainingBytes });
  for (let index = 0; index < toSend.length; index += 1) {
    const row = toSend[index];
    // Never ahead of the application photos: let a pass in progress finish.
    const appPass = offlineFlushInFlight();
    if (appPass) await appPass.catch(() => undefined);
    if (offline()) break;
    const original = await getLocalOriginal(row.id);
    if (!original) continue;
    const attemptAt = new Date().toISOString();
    try {
      await uploadOriginal(original);
      await deleteLocalOriginal(row.id);
      result.backedUp += 1;
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) break;
      const code = error instanceof ApiError ? error.code || (error.isNetwork ? "network" : "") : "";
      const notExpected = code === "original_not_expected";
      if (notExpected && original.state === "captured") {
        result.notYet += 1;
      } else {
        await updateLocalOriginal(row.id, {
          state: "failed",
          attempts: original.attempts + 1,
          lastError: error instanceof Error ? error.message : String(error),
          lastErrorCode: code,
          lastAttemptAt: attemptAt,
        });
        result.failed += 1;
      }
    }
    remainingBytes -= row.size;
    setProgress({ running: true, done: index + 1, total: toSend.length, remainingBytes: Math.max(0, remainingBytes) });
    announceOriginalsChanged();
  }
  return result;
}

/**
 * Drop this person's kept originals that belong to nothing (H5 三.8).
 *
 * Only what `protectedLocalItems` leaves out: a shot whose record was never
 * sent - retaken, or its form abandoned - that no queued job and no saved
 * draft holds, after a week. Anything the server is waiting for, or that
 * could still become a record, stays. Before dropping, the server is asked:
 * an original it waits for (原图待同步 / 失败) or whose photo it holds stays.
 * When the drafts cannot be read or the server does not answer, nothing is
 * dropped: an unreadable answer is not "no drafts" nor "not waiting".
 */
export async function pruneAbandonedOriginals(ownerId: string, now: number = Date.now()): Promise<number> {
  try {
    const [jobs, originals, drafts] = await Promise.all([
      getOfflineJobs(ownerId),
      getLocalOriginals(ownerId),
      draftFileNames(),
    ]);
    const keep = protectedLocalItems({ jobs, originals, draftFileNames: drafts }, now).originalIds;
    const candidates = originals.filter((row) => !keep.has(row.id));
    if (candidates.length === 0 || offline()) return 0;
    // The phone's own word is not enough: an upload can land while its
    // 「待同步」 mark fails to save, leaving the original `captured` although
    // the server holds its photo and waits for it. Ask first; no answer, no
    // deletion.
    const answer = await getOriginalStatuses(
      candidates.map((row) => row.sha256),
      candidates.map((row) => row.photoSha256).filter(Boolean),
    );
    if (!answer || typeof answer.results !== "object" || answer.results === null) return 0;
    const statuses = answer.results;
    const photos = answer.photos ?? {};
    const abandoned = candidates.filter((row) => {
      const server = statuses[row.sha256]?.status;
      if (server === "ORIGINAL_PENDING" || server === "ORIGINAL_FAILED") return false;
      if (row.photoSha256 && photos[row.photoSha256]) return false;
      return true;
    });
    for (const row of abandoned) await deleteLocalOriginal(row.id);
    if (abandoned.length) announceOriginalsChanged();
    return abandoned.length;
  } catch {
    return 0;
  }
}
