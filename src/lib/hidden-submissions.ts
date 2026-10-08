/**
 * 「从我的列表移除」 - records a worker has taken off their own phone's list
 * (client 2026-10-09 四.4; Lucas's decision 4).
 *
 * A local list on this phone, one per user: nothing is deleted anywhere, the
 * server is not told, the back office and every other user see exactly what
 * they saw before. Kept in localStorage (a few dozen bytes a record) rather
 * than in the offline database, so it needs no database upgrade and cannot
 * touch the queue.
 *
 * Only a record the server holds can be hidden, and never one whose photo
 * originals are still waiting to be backed up (四.6): the list is where the
 * worker sees that they still owe 「同步原图」.
 *
 * An entry for a record older than the history window is dropped when the
 * list next loads (四.2): that record has left the list anyway. Clearing the
 * browser's site data clears this list too, and the records reappear - the
 * price of keeping it on the phone, which the client asked for.
 */

const KEY_PREFIX = "mse-hidden-submissions:v1:";
const DAY_MS = 24 * 60 * 60 * 1000;

/** The window event the list and the settings listen for. */
export const HIDDEN_SUBMISSIONS_CHANGED = "mse:hidden-submissions-changed";

export interface HiddenEntry {
  /** When the worker removed it from the list. */
  at: string;
  /** When the record was submitted, so the entry can leave with the window. */
  submittedAt?: string;
}

/** `"<kind>:<id>"` → entry. */
export type HiddenMap = Record<string, HiddenEntry>;

export interface HideableRow {
  kind: string;
  id: string;
  submitted_at?: string;
  /** The originals package's summary (WP1), when the server sends one. */
  original_backup?: { status?: string } | null;
}

export function hiddenKey(row: Pick<HideableRow, "kind" | "id">): string {
  return `${row.kind}:${row.id}`;
}

/** Originals still owed: the row stays on the list until they are backed up. */
const ORIGINALS_NOT_BACKED_UP = new Set(["ORIGINAL_PENDING", "ORIGINAL_FAILED"]);

/** May this row be taken off the worker's list? */
export function canHideRow(row: HideableRow): boolean {
  return Boolean(row.id) && !ORIGINALS_NOT_BACKED_UP.has(row.original_backup?.status ?? "");
}

/** The rows still on the worker's list. */
export function withoutHidden<T extends Pick<HideableRow, "kind" | "id">>(rows: T[], hidden: HiddenMap): T[] {
  return rows.filter((row) => !Object.hasOwn(hidden, hiddenKey(row)));
}

export function withHidden(map: HiddenMap, row: HideableRow, now: Date = new Date()): HiddenMap {
  if (!canHideRow(row)) return map;
  return { ...map, [hiddenKey(row)]: { at: now.toISOString(), submittedAt: row.submitted_at } };
}

/** Entries whose record is older than the window - by submission, else by when hidden. */
export function prunedHidden(map: HiddenMap, windowDays: number, now: Date = new Date()): HiddenMap {
  if (!(windowDays > 0)) return map;
  const oldest = now.getTime() - windowDays * DAY_MS;
  return Object.fromEntries(
    Object.entries(map).filter(([, entry]) => {
      const at = Date.parse(entry.submittedAt ?? entry.at);
      return !Number.isFinite(at) || at >= oldest;
    }),
  );
}

// ---------------------------------------------------------------------------
// This phone's copy, per user
// ---------------------------------------------------------------------------

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function readHidden(userId: string): HiddenMap {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as HiddenMap) : {};
  } catch {
    return {};
  }
}

function writeHidden(userId: string, map: HiddenMap): void {
  try {
    if (Object.keys(map).length === 0) localStorage.removeItem(storageKey(userId));
    else localStorage.setItem(storageKey(userId), JSON.stringify(map));
  } catch {
    // Storage refused (private window, full): the record simply stays listed.
  }
  try {
    window.dispatchEvent(new Event(HIDDEN_SUBMISSIONS_CHANGED));
  } catch {
    // Not in a browser.
  }
}

export function hideSubmission(userId: string, row: HideableRow): void {
  if (!userId || !canHideRow(row)) return;
  writeHidden(userId, withHidden(readHidden(userId), row));
}

/** Show every hidden record on this worker's list again. */
export function unhideAllSubmissions(userId: string): void {
  if (!userId) return;
  writeHidden(userId, {});
}

/** Drop entries that have left the history window (四.2). */
export function pruneHiddenSubmissions(userId: string, windowDays: number): void {
  if (!userId) return;
  const current = readHidden(userId);
  const next = prunedHidden(current, windowDays);
  if (Object.keys(next).length !== Object.keys(current).length) writeHidden(userId, next);
}
