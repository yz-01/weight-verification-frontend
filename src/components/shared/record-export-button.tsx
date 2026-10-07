"use client";

import { useMutation } from "@tanstack/react-query";
import { Download, Eye, Loader2, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { FilePreviewDialog } from "@/components/shared/file-preview";
import { Button } from "@/components/ui/button";
import { recordTarget } from "@/lib/record-routes";
import { absoluteUrl, shareOrCopy } from "@/lib/share";
import {
  downloadRecordPdf,
  recordPdfFile,
  recordPdfObjectUrl,
  type ExportableRecordKind,
} from "@/services/contractor-ops.service";

/**
 * 「单独导出」 - this one record as a PDF, from the top right of its detail
 * (T-386, D-267).
 *
 * The customer and Lucas: 「每个模块都是一样可以单独导出」. Until now a single
 * record could only be exported from inside an evidence package, so exporting
 * one delivery order meant building a package for it first (F-468). One
 * component for all nine details, so the nine cannot drift apart.
 *
 * No permission gate here beyond the one that opened the detail: the server
 * decides who can see the record, and a refusal is toasted by `download`.
 * Nothing is drawn for a record that has no id yet.
 *
 * Beside it, 【预览／打印】 opens the same PDF in the page (D12: 「单条资料仍可
 * 单独 Preview／打印／下载／导出」) - archived or not, since a locked record is
 * still there to be read.
 *
 * And 【分享】 (2026-10 C11: 「退场记录能拿出去当证据」): the phone's share
 * sheet with the PDF itself where it can take a file, the record's link where
 * it can only take a link, and the link copied where there is no share sheet.
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
  const t = useTranslations("common");
  const [previewing, setPreviewing] = useState(false);
  const exporting = useMutation({
    mutationFn: (id: string) => downloadRecordPdf(kind, id, reference),
  });
  const sharing = useMutation({
    mutationFn: async (id: string) => {
      const target = recordTarget(kind, id);
      const href = target && "href" in target ? target.href : "/";
      // The file when it can be had; the link alone otherwise.
      const file = await recordPdfFile(kind, id, reference).catch(() => null);
      return shareOrCopy({ title: reference, url: absoluteUrl(href), file });
    },
    onSuccess: (outcome) => {
      if (outcome === "copied") toast.success(t("linkCopied"));
      else if (outcome === "failed") toast.error(t("shareFailed"));
    },
  });

  if (!recordId) return null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-slot="record-preview"
        onClick={() => setPreviewing(true)}
      >
        <Eye className="h-3.5 w-3.5" />
        {t("previewThisRecord")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-slot="record-export"
        disabled={exporting.isPending}
        onClick={() => exporting.mutate(recordId)}
      >
        {exporting.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {t("exportThisRecord")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-slot="record-share"
        disabled={sharing.isPending}
        onClick={() => sharing.mutate(recordId)}
      >
        {sharing.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Share2 className="h-3.5 w-3.5" />
        )}
        {t("shareThisRecord")}
      </Button>
      {previewing && (
        <FilePreviewDialog
          title={reference}
          load={() => recordPdfObjectUrl(kind, recordId)}
          previewType="application/pdf"
          filename={`${reference || "record"}.pdf`}
          onDownload={() => downloadRecordPdf(kind, recordId, reference)}
          onClose={() => setPreviewing(false)}
        />
      )}
    </>
  );
}
