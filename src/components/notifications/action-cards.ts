import type { NotificationRow } from "@/interfaces/platform-ops";

/** When a notice was made, as a number; an unreadable time sorts last. */
function createdTime(row: NotificationRow): number {
  const time = Date.parse(row.created_at);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * The office's task cards: every outstanding ACTION notice, newest first.
 *
 * Lucas (2026-10-09): 「弄成最新的通知在第一个，然后会显示所有待处理的事项」.
 * All of them - no cap - so the number in the strip's title is the number of
 * cards in it. The server already sends the list newest first, but a list
 * merged from several pages or refreshed live is sorted here once more, on
 * the time itself rather than its text (offsets can differ), with the id as a
 * stable tie-break.
 */
export function pendingActionCards(rows: readonly NotificationRow[]): NotificationRow[] {
  return rows
    .filter((row) => row.card === "ACTION")
    .sort((a, b) => createdTime(b) - createdTime(a) || b.id.localeCompare(a.id));
}

