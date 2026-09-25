"use client";

import { useMutation } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  downloadRecordPdf,
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
  const exporting = useMutation({
    mutationFn: (id: string) => downloadRecordPdf(kind, id, reference),
  });

  if (!recordId) return null;

  return (
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
  );
}
