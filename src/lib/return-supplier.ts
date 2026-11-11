/**
 * 「待补供应商」 on a return to the supplier (JB169).
 *
 * The client, 11-11: 「发现退货记录没有填写供应商，系统竟然也允许保存归档。供应商
 * 应该属于必填项目，未选择供应商不能确认归档。」
 *
 * The phone may still apply without one (the site may not know whose it is);
 * its handover asks for one, and the office's 确认 and 确认归档 wait for it -
 * 「补供应商」 sits beside them. A 材料领用 never names a supplier, and a
 * rejected application never left site: neither is asked.
 */

import type { MaterialOutgoing } from "@/interfaces/contractor-ops";

/** Whether this 材料出场 record is a return still waiting for its supplier. */
export function returnNeedsSupplier(
  row: Pick<MaterialOutgoing, "supplier" | "status" | "needs_supplier"> & { kind?: string | null },
): boolean {
  // The server says so (``needs_supplier``); an older answer without it is
  // read by the same rule.
  if (typeof row.needs_supplier === "boolean") return row.needs_supplier;
  return row.kind !== "ISSUE" && !row.supplier && row.status !== "REJECTED";
}
