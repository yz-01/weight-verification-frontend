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

export function canDiscuss(kind: ArchiveRecordKind): boolean {
  return DISCUSSABLE_KINDS.includes(kind);
}
