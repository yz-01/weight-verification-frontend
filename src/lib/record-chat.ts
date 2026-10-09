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
export const DISCUSSABLE_KINDS: readonly ChatRecordKind[] = [
  "MATERIAL_RECEIPT",
  "MATERIAL_OUTGOING",
  "EQUIPMENT_MOVEMENT",
  "WASTE_OUTGOING",
  "DISPOSAL_REQUEST",
  "PROGRESS",
  "CONSULTANT_APPLICATION",
  // 杂费报销 (D-232): its applicant talks to the office on the claim.
  "SUNDRY_CLAIM",
  // MR / Other Request (C05). Talks, but is not an archive-queue kind: it
  // ends by being approved or returned, not by 【确认归档】.
  "MATERIAL_REQUEST",
  // 门岗事项 (C22): the guard and the people they ask in talk on the gate
  // record itself. Not an archive-queue kind either, and never closes.
  "GATE_INCIDENT",
  // 总部任务 (C17): head office and the assignee talk on the task itself.
  // Not an archive-queue kind; a task closes by being confirmed (B18).
  "FIELD_TASK",
];

/**
 * Every kind that can carry a conversation: the archive queue's, plus a
 * material request and a gate record, which have screens of their own
 * instead of the queue.
 */
export type ChatRecordKind =
  | ArchiveRecordKind
  | "MATERIAL_REQUEST"
  | "GATE_INCIDENT"
  | "FIELD_TASK";

/** The chat kinds that are also archive-queue kinds. */
const ARCHIVE_CHAT_KINDS = DISCUSSABLE_KINDS.filter(
  (kind): kind is ArchiveRecordKind =>
    kind !== "MATERIAL_REQUEST" &&
    kind !== "GATE_INCIDENT" &&
    kind !== "FIELD_TASK",
);

/**
 * Any string, so a column's wider kinds (T-396) can be asked too: a delivery
 * note, a registered machine or a document has no conversation to open.
 */
export function canDiscuss(kind: string): kind is ChatRecordKind {
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
  return (ARCHIVE_CHAT_KINDS as readonly string[]).includes(kind);
}

/**
 * The kinds 「我看过了」 can mark (T-233): the archive queue's own.
 *
 * `mark_records_seen` accepts nothing else, so a column's delivery note,
 * site record, machine, document or period claim gets no button.
 */
export const QUEUE_KINDS: readonly ArchiveRecordKind[] = [
  ...ARCHIVE_CHAT_KINDS,
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
export function recordConversationKey(kind: ChatRecordKind, recordId: string) {
  return ["record-conversation", kind, recordId] as const;
}

/**
 * The phone's link to one record's conversation: `?chat=<KIND>:<id>`
 * (2026-10-09). A chat notice for a field account carries it, and 我提交过的
 * on the field home opens that record - its own sheet when it is the
 * worker's submission, the conversation alone otherwise.
 */
export function parseChatParam(
  value: string | null | undefined,
): { kind: ChatRecordKind; recordId: string } | null {
  if (!value) return null;
  const at = value.indexOf(":");
  if (at <= 0) return null;
  const kind = value.slice(0, at);
  const recordId = value.slice(at + 1);
  if (!recordId || !canDiscuss(kind)) return null;
  return { kind, recordId };
}

/** Why a finished record's conversation takes no more messages (D-278). */
export type ConversationClosed = "" | "archived" | "paid" | "decided";

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
): "recordChat.closedArchived" | "recordChat.closedPaid" | "recordChat.closedDecided" | null {
  if (!closed) return null;
  if (closed === "paid") return "recordChat.closedPaid";
  // A material request, once approved or returned (C05).
  if (closed === "decided") return "recordChat.closedDecided";
  return "recordChat.closedArchived";
}
