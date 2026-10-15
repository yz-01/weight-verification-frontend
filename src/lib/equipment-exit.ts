/**
 * Where an equipment movement stands, in the words its own direction uses
 * (2026-10 I13, ID30).
 *
 * An entry is recorded on site in one step and accepted by the office: 等待后台
 * 验收 / 已验收 / 未通过验收 (`contractorOps.equipmentMovementStatus`). An exit
 * goes the way material leaves site, and its states read like material's:
 * 等待批准 / 已批准，等待退场 / 已退回 / 已退场，待后台确认 / 已完成 / 不通过
 * (`contractorOps.equipmentExit.status`).
 */

export const EXIT_STATUSES = [
  "PENDING",
  "APPROVED",
  "RETURNED",
  "SUBMITTED",
  "COMPLETED",
  "REJECTED",
] as const;

export type ExitStatus = (typeof EXIT_STATUSES)[number];

/** The message key, under `contractorOps`, for a movement's status. */
export function movementStatusKey(direction: string | undefined, status: string | undefined): string {
  const shown = status || "COMPLETED";
  if (direction === "EXIT" && (EXIT_STATUSES as readonly string[]).includes(shown)) {
    return `equipmentExit.status.${shown}`;
  }
  return `equipmentMovementStatus.${shown}`;
}

/**
 * What the phone offers for a machine on site, from its exit under way
 * (`SiteEquipment.open_exit`): apply, wait, do the actual exit, or wait for
 * the office.
 */
export type ExitStep = "apply" | "awaitingApproval" | "leave" | "awaitingOffice";

export function exitStep(openExit: { status: string } | null | undefined): ExitStep {
  if (!openExit) return "apply";
  if (openExit.status === "APPROVED") return "leave";
  if (openExit.status === "SUBMITTED") return "awaitingOffice";
  return "awaitingApproval";
}

/** Whether a 我提交过的 row is an exit waiting for its actual exit on the phone. */
export function offersEquipmentExit(row: { kind: string; status: string; movement_status?: string }): boolean {
  return row.kind === "EQUIPMENT_MOVEMENT" && row.status === "EXIT" && row.movement_status === "APPROVED";
}
