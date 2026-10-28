/**
 * A Progress Claim's letter (JB30, 客户 10-26 事项 6). Optional since JB50
 * (客户 10-28: 「也不是说必须要上传附件才能确认」): uploaded, it is the first
 * page of the merged PDF; missing, the claim is confirmed all the same.
 *
 * Only the kinds whose Confirm merges a package need one - 材料到场 and 工程
 * 进度. A 一般 Claim raises no package (ID50) and is confirmed as before. The
 * server refuses the same (`claim_letter_required`); this is what lets the
 * screen say so before the press.
 */
import type { ClaimKind } from "@/interfaces/contractor-ops";

export const LETTER_CLAIM_KINDS: readonly ClaimKind[] = ["MATERIAL_ON_SITE", "PROGRESS"];

export function claimNeedsLetter(kind: ClaimKind): boolean {
  return LETTER_CLAIM_KINDS.includes(kind);
}

/**
 * Why 「确认本期」 cannot be pressed yet, or null: only an empty claim. A
 * missing letter no longer holds it back (JB50).
 */
export function claimConfirmBlocker(claim: {
  kind: ClaimKind;
  itemCount: number;
  /** Letters uploaded; `undefined` while still loading. */
  letterCount: number | undefined;
}): "nothingSelected" | "letterMissing" | null {
  if (claim.kind !== "GENERAL" && claim.itemCount === 0) return "nothingSelected";
  return null;
}
