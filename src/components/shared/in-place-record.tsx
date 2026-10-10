"use client";

/**
 * A record opened where the reader is (Lucas 2026-10-10, 图8 → 图9).
 *
 * 「点那个卡片的时候就会显示完整的…资料，然后关掉还是会保留在刚刚的页面，不会
 * 跳转，其他业务模块也是一样」: a record pressed in a list, a report preview,
 * a badge's popup or a dashboard card opens its module's own record popup -
 * photographs, 已归档, signatures, attachments, 预览/打印 · 单独导出 · 分享 -
 * on top of the page, and closing it leaves the reader on that page.
 *
 * Only the kinds whose module popup stands on its own (takes an id and a
 * close) are here; the same components the 总部 approval list opens
 * (`approval-opener`). The others still open on their module's screen
 * (`recordTarget`), where their popup lives inside the list.
 */

import { useRouter } from "next/navigation";

import { OutgoingDecision } from "@/components/dashboard/approval-opener";
import { FieldTaskSheet } from "@/components/dashboard/field-task-sheet";
import { ConsultantApplicationDetail } from "@/components/consultant-workflow/application-detail";
import { MaterialRequestDetail } from "@/components/material-requests/material-requests-office";
import { ViewReceipt } from "@/components/receipts/view-receipt";
import { SundryClaimDetail } from "@/components/sundry-claims/sundry-claims-office";

const IN_PLACE_KINDS = new Set([
  "MATERIAL_RECEIPT",
  "MATERIAL_OUTGOING",
  "MATERIAL_REQUEST",
  "SUNDRY_CLAIM",
  "CONSULTANT_APPLICATION",
  "FIELD_TASK",
]);

/** Whether a record of this kind opens in a popup over the current page. */
export function opensInPlace(kind: string | null | undefined): boolean {
  return Boolean(kind && IN_PLACE_KINDS.has(kind));
}

export function InPlaceRecord({
  kind,
  id,
  onClose,
}: {
  kind: string;
  id: string;
  onClose: () => void;
}) {
  const router = useRouter();
  switch (kind) {
    case "MATERIAL_RECEIPT":
      return <ViewReceipt id={id} presentation="dialog" onClose={onClose} />;
    case "MATERIAL_OUTGOING":
      return <OutgoingDecision id={id} onClose={onClose} />;
    case "MATERIAL_REQUEST":
      return (
        <MaterialRequestDetail
          id={id}
          onClose={onClose}
          // Asking again is a new request on the MR screen (C05).
          onRaiseAgain={() => router.push("/material-requests")}
        />
      );
    case "SUNDRY_CLAIM":
      return <SundryClaimDetail id={id} onClose={onClose} />;
    case "CONSULTANT_APPLICATION":
      return <ConsultantApplicationDetail id={id} presentation="dialog" onClose={onClose} />;
    case "FIELD_TASK":
      return <FieldTaskSheet id={id} onClose={onClose} />;
    default:
      return null;
  }
}
