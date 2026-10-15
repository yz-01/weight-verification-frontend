import type { DisposalRequest, DisposalRequestStatus, DisposalTrip } from "@/interfaces/contractor-ops";

/**
 * 工地清运: which clearance company and which lorries took a job (I27, ID65).
 *
 * The client, 2026-10-15 事项 6: 「table增加清运车牌和把执行人改为供应商…因为
 * 建筑公司不止一家清运公司，为了要打包结算。增加筛选日期和供应商筛选」. The
 * construction company settles with each clearance company apart, so every
 * clearance shows its company (from the supplier list) and its lorry plates,
 * and the list filters by company and by date.
 *
 * Pure functions here; the screens are in
 * `components/contractor-ops/site-disposal-workspaces.tsx`.
 */

/** `?supplier=none`: the jobs no supplier on the list is named for (the server's word). */
export const NO_SUPPLIER = "none";

/** What the 工地清运 list filters on besides project, status and `counted`. */
export const DISPOSAL_SUPPLIER_FILTERS = ["supplier", "date_from", "date_to"] as const;

/**
 * The 供应商 cell: 「内部清运 · 负责人」 for field staff's own clearance, else the
 * supplier's name (or the name typed before I27), else "not assigned yet".
 */
export function disposalSupplierText(
  row: Pick<DisposalRequest, "assignment_type" | "assigned_staff_name" | "supplier_name" | "collector_company_name">,
  words: { internal: string; none: string },
): string {
  if (row.assignment_type === "INTERNAL") {
    return [words.internal, row.assigned_staff_name ?? ""].filter((part) => part.trim()).join(" · ");
  }
  // The typed name too, for the minutes a server from before I27 answers
  // without `supplier_name` (the frontend deploys first).
  return (row.supplier_name ?? "").trim() || (row.collector_company_name ?? "").trim() || words.none;
}

/** The 清运车牌 cell: each lorry once, in the order they went; "—" for none. */
export function disposalPlatesText(row: Pick<DisposalRequest, "vehicle_plates">): string {
  const plates = row.vehicle_plates ?? [];
  return plates.length ? plates.join(", ") : "—";
}

/**
 * A lorry plate as the server keeps it: capitals, single spaces. So the
 * correction dialog can tell 「wxy 1234」 typed over 「WXY 1234」 is no change.
 */
export function normalisePlate(value: string): string {
  return value.split(/\s+/).filter(Boolean).join(" ").toUpperCase();
}

/** The plate typed in the correction dialog, when it changes the lorry's (else null). */
export function changedPlate(typed: string, trip: Pick<DisposalTrip, "vehicle_plate">): string | null {
  const plate = normalisePlate(typed);
  return plate && plate !== (trip.vehicle_plate ?? "") ? plate : null;
}

/** When the office may name or change the clearance company (the server's `set_supplier` rule). */
const SUPPLIER_SETTABLE: readonly DisposalRequestStatus[] = [
  "APPROVED",
  "ASSIGNED",
  "IN_PROGRESS",
  "RETURNED",
  "AWAITING_CONFIRMATION",
  "COMPLETED",
];

/** States where 「选择执行方式」 (assign) is offered to `disposal.manage`. */
export const ASSIGNABLE: readonly DisposalRequestStatus[] = ["APPROVED", "ASSIGNED", "RETURNED"];

export function canSetSupplier(row: Pick<DisposalRequest, "status" | "assignment_type">): boolean {
  return SUPPLIER_SETTABLE.includes(row.status) && row.assignment_type !== "INTERNAL";
}

/**
 * Whether 「填写 / 更改供应商」 is worth a button for this reader: never while
 * the assign dialog (which chooses the company too) is on offer to them.
 */
export function offersSupplierButton(
  row: Pick<DisposalRequest, "status" | "assignment_type">,
  may: { manage: boolean; confirm: boolean },
): boolean {
  if (!(may.manage || may.confirm) || !canSetSupplier(row)) return false;
  return !(may.manage && ASSIGNABLE.includes(row.status));
}

/** Replacing a company already named (or typed before I27) asks why; naming the first does not. */
export function supplierChangeNeedsReason(
  row: Pick<DisposalRequest, "collector_supplier" | "supplier_name">,
): boolean {
  return Boolean(row.collector_supplier || (row.supplier_name ?? "").trim());
}
