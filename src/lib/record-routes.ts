import type { CategoryRecordKind } from "@/interfaces/contractor-ops";

/**
 * Where one record is opened: its own module's business detail (F9, C4).
 *
 * The customer clicked a photo on the head-office page and got the record
 * centre's sheet with 「确认归档」 in it. What they wanted was the record as
 * its own module shows it - the delivery that was accepted, with both
 * signatures (「收货时项目里已验收、双方签名的那一笔」). So every place that
 * opens "this record" - a dashboard photo, a 「等你处理」 row - asks this one
 * function, and they cannot drift apart.
 *
 * A kind whose module has no detail page yet opens the shared record sheet
 * read-only (no 确认归档, no 我看过了): `{ sheet }`. Kinds are accepted under
 * every name the server uses for them - the archive queue's (`HAZARD`,
 * `PROGRESS`, `DISPOSAL_REQUEST`), the photo list's (`SAFETY_INCIDENT`,
 * `SITE_PROGRESS`, `DISPOSAL`, `EQUIPMENT`) and the approval queue's.
 */
export type RecordTarget =
  | { href: string }
  | { sheet: CategoryRecordKind; id: string }
  | null;

const PAGES: Record<string, (id: string) => string> = {
  MATERIAL_RECEIPT: (id) => `/receipts/${id}`,
  MATERIAL_OUTGOING: (id) => `/material-outgoing?record=${id}`,
  WASTE_OUTGOING: (id) => `/waste-outgoing?record=${id}`,
  DISPOSAL_REQUEST: (id) => `/waste-clearance?kind=disposal&record=${id}`,
  DISPOSAL: (id) => `/waste-clearance?kind=disposal&record=${id}`,
  WASTE_DISPATCH: (id) => `/dispatches/${id}`,
  HAZARD: (id) => `/hazard-rectifications?incident=${id}`,
  SAFETY_INCIDENT: (id) => `/hazard-rectifications?incident=${id}`,
  FIELD_TASK: (id) => `/field-tasks?task=${id}`,
  GATE_INCIDENT: (id) => `/site-access?tab=gate-records&gate_incident=${id}`,
  CONSULTANT_APPLICATION: (id) => `/consultant-applications/${id}`,
  SUNDRY_CLAIM: (id) => `/sundry-claims?record=${id}`,
  MATERIAL_REQUEST: (id) => `/material-requests?record=${id}`,
};

/** No detail page of their own yet: the read-only record sheet. */
const READ_ONLY_SHEETS: Record<string, CategoryRecordKind> = {
  EQUIPMENT_MOVEMENT: "EQUIPMENT_MOVEMENT",
  EQUIPMENT: "SITE_EQUIPMENT",
  SITE_EQUIPMENT: "SITE_EQUIPMENT",
  PROGRESS: "PROGRESS",
  SITE_PROGRESS: "PROGRESS",
  // A delivery note the site has not received yet. Once received, the
  // server names its receipt instead.
  DELIVERY_NOTE: "DELIVERY_NOTE",
};

export function recordTarget(
  kind: string,
  id: string | null | undefined,
): RecordTarget {
  if (!id) return null;
  const page = PAGES[kind];
  if (page) return { href: page(encodeURIComponent(id)) };
  const sheet = READ_ONLY_SHEETS[kind];
  return sheet ? { sheet, id } : null;
}

/** Every kind this function can open. */
export const ROUTED_RECORD_KINDS = [
  ...Object.keys(PAGES),
  ...Object.keys(READ_ONLY_SHEETS),
];
