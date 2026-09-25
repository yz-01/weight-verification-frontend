/**
 * A record's status in the words its own module uses (T-391).
 *
 * The queue and the phone's 「我提交过的」 used to print the server's
 * `status_label`, which is the model's English label - so a Chinese reader saw
 * 「Verified and closed」, 「Released (before D-211)」 and 「Exit」, and an
 * attendance day showed a bare 「3」. Each module already names its statuses
 * on its own screens; this points at those names instead of writing a third
 * set, so the queue says exactly what the module says (one name per module).
 */

/** Where each kind's statuses are named in the catalogue. */
export const RECORD_STATUS_NAMESPACE: Record<string, string> = {
  MATERIAL_RECEIPT: "receipts.acceptance.status",
  MATERIAL_OUTGOING: "contractorOps.outgoingStatus",
  EQUIPMENT_MOVEMENT: "contractorOps.direction",
  HAZARD: "safetyRectification.status",
  WASTE_OUTGOING: "wasteOutgoing.status",
  DISPOSAL_REQUEST: "siteDisposal.status",
  PROGRESS: "contractorOps.progressStatus",
  CONSULTANT_APPLICATION: "consultantWorkflow.status",
  SUNDRY_CLAIM: "sundryClaim.status",
  // The five a Category Management column holds beyond the queue (T-396),
  // each in the words its own office screen already uses.
  DELIVERY_NOTE: "deliveryNotePublic.status",
  SITE_RECORD: "contractorOps.taskStatus",
  SITE_EQUIPMENT: "contractorOps.equipmentStatus",
  DOCUMENT: "documents.status",
  CLAIM: "claims.state",
};

/** The statuses the server sends per kind, for the catalogue check. */
export const RECORD_STATUSES: Record<string, readonly string[]> = {
  MATERIAL_RECEIPT: ["PENDING", "ACCEPTED", "REJECTED"],
  MATERIAL_OUTGOING: ["PENDING", "APPROVED", "REJECTED", "PROCESSED", "COMPLETED", "RELEASED"],
  EQUIPMENT_MOVEMENT: ["ENTRY", "EXIT"],
  HAZARD: ["OPEN", "INVESTIGATING", "ASSIGNED", "RECTIFICATION_SUBMITTED", "RETURNED", "VERIFIED", "RESOLVED"],
  WASTE_OUTGOING: ["DRAFT", "PENDING_APPROVAL", "RETURNED", "APPROVED", "ORDERED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
  DISPOSAL_REQUEST: ["REQUESTED", "APPROVED", "ASSIGNED", "IN_PROGRESS", "AWAITING_CONFIRMATION", "RETURNED", "COMPLETED", "REJECTED", "CANCELLED"],
  PROGRESS: ["SUBMITTED", "CONFIRMED", "RETURNED"],
  CONSULTANT_APPLICATION: ["DRAFT", "SUBMITTED", "APPROVED", "APPROVED_WITH_REMEDIAL", "REJECTED", "REVISE_RESUBMIT", "ARCHIVED"],
  SUNDRY_CLAIM: ["SUBMITTED", "CONFIRMED", "REJECTED", "PAID"],
  DELIVERY_NOTE: ["ISSUED", "ARRIVED", "COMPLETED", "CLOSED", "CANCELLED", "VOIDED"],
  SITE_RECORD: ["OPEN", "IN_PROGRESS", "SUBMITTED", "ACCEPTED", "RETURNED", "CANCELLED"],
  SITE_EQUIPMENT: ["OFF_SITE", "ON_SITE", "MAINTENANCE", "RETIRED"],
  DOCUMENT: ["ACTIVE", "ARCHIVED"],
  // A period claim only; SUBMITTED and REJECTED are the sundry claim's.
  CLAIM: ["DRAFT", "CONFIRMED"],
};

type Translate = {
  (key: string, values?: Record<string, string | number>): string;
  has: (key: string) => boolean;
};

/**
 * The status as the module names it; an attendance day as a head count.
 *
 * Falls back to the server's own label only for a status the catalogue does
 * not have - which the catalogue test makes a failing build rather than a
 * screen.
 */
export function recordStatusLabel(
  t: Translate,
  row: { kind: string; status: string; status_label: string },
  /** A screen that names some kinds its own way, e.g. the phone's words. */
  namespaces: Record<string, string> = {},
): string {
  if (row.kind === "ATTENDANCE_DAY") {
    const people = Number(row.status_label);
    return Number.isFinite(people) ? t("archiveQueue.people", { count: people }) : row.status_label;
  }
  const namespace = namespaces[row.kind] ?? RECORD_STATUS_NAMESPACE[row.kind];
  const key = namespace ? `${namespace}.${row.status}` : "";
  return key && t.has(key) ? t(key) : row.status_label;
}
