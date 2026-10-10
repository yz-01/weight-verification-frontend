"use client";

import { FileActionButtons } from "@/components/shared/file-actions";
import { recordTarget } from "@/lib/record-routes";
import { absoluteUrl } from "@/lib/share";
import { recordPdfFile, type ExportableRecordKind } from "@/services/contractor-ops.service";

/**
 * This one record as a PDF, from the top right of its detail (T-386, D-267):
 * 预览 · 打印 · 导出 · 发送, the same four every exported file has
 * (PDF 统一操作规则, 2026-10-10).
 *
 * The customer and Lucas: 「每个模块都是一样可以单独导出」, and D12: 「单条资料
 * 仍可单独 Preview／打印／下载／导出」 - archived or not, since a locked record
 * is still there to be read. One component for every detail, so they cannot
 * drift apart; the four actions themselves are `FileActionButtons`, shared
 * with every list and report export.
 *
 * Each action fetches the record's PDF once and works on those bytes, so the
 * preview is what prints, saves and sends. 发送 hands the PDF itself to the
 * phone's share sheet (2026-10 C11: 「退场记录能拿出去当证据」); where there is
 * none, the file is downloaded to attach, with the record's link beside it.
 *
 * No permission gate here beyond the one that opened the detail: the server
 * decides who can see the record, and a refusal is toasted by the service.
 * Nothing is drawn for a record that has no id yet.
 */
export function RecordExportButton({
  kind,
  recordId,
  reference,
}: {
  kind: ExportableRecordKind;
  recordId: string | null | undefined;
  reference: string;
}) {
  if (!recordId) return null;
  const target = recordTarget(kind, recordId);
  const href = target && "href" in target ? target.href : "/";
  return (
    <FileActionButtons
      source={{
        load: () => recordPdfFile(kind, recordId, reference),
        title: reference,
        link: absoluteUrl(href),
      }}
    />
  );
}
