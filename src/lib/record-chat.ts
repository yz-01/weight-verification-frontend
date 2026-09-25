import type { ArchiveRecordKind } from "@/interfaces/contractor-ops";

/**
 * The record kinds that carry a conversation (T-339 / T-340).
 *
 * Mirrors `CHAT_SUBJECT_KINDS` in `contractor_ops/record_chat.py`. Two of the
 * archive queue's nine kinds are deliberately missing, and a screen that
 * offered the panel for them would show a box that can only fail:
 *
 * - `HAZARD` already has its own conversation, which *is* the hazard rather
 *   than a panel beside it. A second one would split a hazard's evidence in
 *   half, so the hazard screens keep `HazardConversationPanel`.
 * - `ATTENDANCE_DAY` is an aggregate — one queue line per project per day —
 *   with a synthetic key and no row to hang a conversation on. Evidence
 *   packages leave it out for the same reason.
 */
export const DISCUSSABLE_KINDS: readonly ArchiveRecordKind[] = [
  "MATERIAL_RECEIPT",
  "MATERIAL_OUTGOING",
  "EQUIPMENT_MOVEMENT",
  "WASTE_OUTGOING",
  "DISPOSAL_REQUEST",
  "PROGRESS",
  "CONSULTANT_APPLICATION",
  // 杂费报销 (D-232): its applicant talks to the office on the claim.
  "SUNDRY_CLAIM",
];

/**
 * Any string, so a column's wider kinds (T-396) can be asked too: a delivery
 * note, a registered machine or a document has no conversation to open.
 */
export function canDiscuss(kind: string): kind is ArchiveRecordKind {
  return (DISCUSSABLE_KINDS as readonly string[]).includes(kind);
}

/**
 * The kinds the final 【确认】 (D-234) can be asked about.
 *
 * The same eight: `record_closure.py` finds its record through the chat's
 * `resolve_subject`, so any other kind - a hazard, which closes through its
 * own verification, a day of attendance, or one of a column's non-queue
 * kinds - is "not found", and the panel would only ever show its failure.
 */
export function canConfirmClosure(kind: string): kind is ArchiveRecordKind {
  return canDiscuss(kind);
}

/**
 * The kinds 「我看过了」 can mark (T-233): the archive queue's own.
 *
 * `mark_records_seen` accepts nothing else, so a column's delivery note,
 * site record, machine, document or period claim gets no button.
 */
export const QUEUE_KINDS: readonly ArchiveRecordKind[] = [
  ...DISCUSSABLE_KINDS,
  "HAZARD",
  "ATTENDANCE_DAY",
];

export function isQueueKind(kind: string): kind is ArchiveRecordKind {
  return (QUEUE_KINDS as readonly string[]).includes(kind);
}

/**
 * The one query key a record's conversation is cached under.
 *
 * Shared so that whatever finishes a record - 【确认归档】 in the archive
 * queue, 【确认已付款】 on a sundry claim - refetches the very query the panel
 * reads, and the composer goes away without a reload (D-278). A second
 * spelling of this key anywhere would invalidate nothing.
 */
export function recordConversationKey(kind: ArchiveRecordKind, recordId: string) {
  return ["record-conversation", kind, recordId] as const;
}

/** Why a finished record's conversation takes no more messages (D-278). */
export type ConversationClosed = "" | "archived" | "paid";

/**
 * The line shown instead of the composer, or `null` while it is open.
 *
 * The history stays either way: 「记录全部都要留着」 - what closes is the
 * ability to add to it, and the reason is said rather than shown as a greyed
 * box nobody can explain. An unknown reason from a newer server still closes
 * the composer (it would only be refused) and says the archived sentence.
 */
export function conversationClosedLine(
  closed: string | null | undefined,
): "recordChat.closedArchived" | "recordChat.closedPaid" | null {
  if (!closed) return null;
  return closed === "paid" ? "recordChat.closedPaid" : "recordChat.closedArchived";
}
