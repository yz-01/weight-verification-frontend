/**
 * What to tell a driver about their connection, in one word.
 *
 * Requirement 1.2.7 asks for four states — online, offline, syncing, synced —
 * and the queue adds a fifth that matters more than any of them: something
 * failed to upload. A driver who thinks their photos are safe when three of
 * them are stuck in a retry queue is the failure this exists to prevent, so
 * `failed` outranks `pending`, and both outrank the plain `online` the app
 * would otherwise show.
 *
 * Extracted because the rule was written out twice, inline, in two screens
 * that must never disagree — a phone that says "synced" on the dashboard and
 * "3 waiting" in settings is worse than either message alone.
 */
export type NetworkStatus =
  | "offline"
  | "syncing"
  | "failed"
  | "pending"
  | "online";

export interface SyncSnapshot {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
}

export function networkStatus(sync: SyncSnapshot): NetworkStatus {
  // Offline first: nothing else is worth saying while there is no connection,
  // and a queue that is "syncing" with the radio off is a stale flag.
  if (!sync.isOnline) return "offline";
  if (sync.isSyncing) return "syncing";
  if (sync.failedCount > 0) return "failed";
  if (sync.pendingCount > 0) return "pending";
  return "online";
}
