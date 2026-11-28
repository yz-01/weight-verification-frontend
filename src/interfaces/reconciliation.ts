/**
 * What an original record says of its 核对 / 结算 - the backend's
 * `contractor_ops.reconciliation.record_links` (JB278; amounts, 凭证编号 and
 * voucher files on the record's own window since JB307-7 / JB308).
 */

import type { ReconKind } from "@/services/return-check.service";

/** One voucher file as the record's shape names it (the panel reads the files themselves). */
export interface ReconciliationVoucherFile {
  id: string;
  name: string;
  content_type: string;
  byte_size: number;
  uploaded_by_name: string;
  uploaded_at: string;
}

/** What an original record says of its 核对 / 结算 (`reconciliation.record_links`). */
export interface RecordReconciliation {
  state: "CHECKED" | "SETTLED";
  kind: ReconKind;
  check_id: string;
  check_no: string;
  /** The check's 凭证编号 (as `check_voucher_no`). */
  voucher_no?: string;
  checked_by_name: string;
  checked_at: string;
  settlement_id: string | null;
  settlement_no: string;
  settled_by_name: string;
  settled_at: string | null;
  // On the record's own window (JB307-7 / JB308):
  check_voucher_no?: string;
  check_note?: string;
  check_item_count?: number;
  /** This record's 核对金额 (RM); null for a 退场 (no price) or without 金额查看. */
  checked_amount?: string | null;
  /** A Progress Claim's reason when its 核对金额 differs from the 批准金额. */
  checked_reason?: string;
  check_vouchers?: ReconciliationVoucherFile[];
  settlement_voucher_no?: string;
  settlement_note?: string;
  /** How many records the settlement holds - its 结算金额 is their total. */
  settlement_item_count?: number;
  settled_amount?: string | null;
  settlement_vouchers?: ReconciliationVoucherFile[];
}

/** A package read without 「金额查看」: the server says only that it is locked. */
export type LockedReconciliation = { locked: true };

export function isLockedReconciliation(
  links: RecordReconciliation | LockedReconciliation | null | undefined,
): links is LockedReconciliation {
  return Boolean(links && "locked" in links && links.locked);
}
