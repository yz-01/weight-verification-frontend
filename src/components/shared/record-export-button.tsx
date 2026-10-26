"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { FileActionButtons, FileActionMenu } from "@/components/shared/file-actions";
import type { CorrectionHistoryKind } from "@/interfaces/record-correction";
import { recordTarget } from "@/lib/record-routes";
import { absoluteUrl } from "@/lib/share";
import { recordPdfFile, type RecordPdfKind } from "@/services/contractor-ops.service";
import { listRecordCorrections } from "@/services/record-corrections.service";

/** The kinds whose history can say there is an earlier version (J1-21). */
const VERSIONED: ReadonlySet<string> = new Set<CorrectionHistoryKind>([
  "MATERIAL_RECEIPT", "MATERIAL_OUTGOING", "EQUIPMENT_MOVEMENT", "PROGRESS", "HAZARD",
  "FIELD_TASK", "SUNDRY_CLAIM", "GATE_INCIDENT", "WASTE_OUTGOING", "DISPOSAL_REQUEST",
]);

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
 * The PDF is the record's complete evidence (2026-10-10, 审批证据完整性):
 * the form, its photographs, every attachment's content (Word, Excel and PDF
 * turned into printable pages), the approval history with signatures and
 * the conversation, all tied to this one record - labelled 「完整证据 PDF」
 * so it is not mistaken for the bare form.
 *
 * No permission gate here beyond the one that opened the detail: the server
 * decides who can see the record, and a refusal is toasted by the service.
 * Nothing is drawn for a record that has no id yet.
 */
export function RecordExportButton({
  kind,
  recordId,
  reference,
  href: givenHref,
  layout = "buttons",
}: {
  kind: RecordPdfKind;
  recordId: string | null | undefined;
  reference: string;
  /** Where the record opens, for a kind `recordTarget` does not route (H16). */
  href?: string;
  /**
   * `menu`: each PDF one button with its four actions under it -
   * 「完整证据 PDF ▾」「修改前原单 ▾」 - for the photo viewer's single row of
   * actions (JB29). The record detail keeps its four buttons.
   */
  layout?: "buttons" | "menu";
}) {
  const t = useTranslations("fileActions");
  // The same history the detail's 修改记录 reads (one cached request): a
  // corrected record also offers its original (J1-21, Q1-6).
  const versioned = Boolean(recordId) && VERSIONED.has(kind);
  // query-failure: without the history the latest PDF is still offered; only the original is left out
  const history = useQuery({
    // `recordCorrectionsKey`, written out: importing it would close a
    // loop through the detail shell.
    queryKey: ["record-corrections", kind, recordId ?? ""],
    queryFn: () => listRecordCorrections(kind as CorrectionHistoryKind, recordId ?? ""),
    enabled: versioned,
  });
  if (!recordId) return null;
  const target = recordTarget(kind, recordId);
  const href = givenHref ?? (target && "href" in target ? target.href : "/");
  const corrected = versioned && (history.data?.corrections?.length ?? 0) > 0;
  const Actions = layout === "menu" ? FileActionMenu : FileActionButtons;
  const latest = (
    <Actions
      label={t("completeEvidence")}
      labelHint={t("completeEvidenceHint")}
      source={{
        load: () => recordPdfFile(kind, recordId, reference),
        title: t("completeEvidenceTitle", { reference }),
        link: absoluteUrl(href),
        // The log row names the record (JB27).
        recordKind: kind,
        recordId,
      }}
    />
  );
  if (!corrected) return latest;
  const original = (
    <Actions
      label={t("originalVersion")}
      labelHint={t("originalVersionHint")}
      source={{
        load: () => recordPdfFile(kind, recordId, reference, 1),
        title: t("originalVersionTitle", { reference }),
        link: absoluteUrl(href),
        // The log row names the record (JB27).
        recordKind: kind,
        recordId,
      }}
    />
  );
  // In the viewer's row the two sit inline with the other actions.
  if (layout === "menu") {
    return (
      <>
        {latest}
        {original}
      </>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {latest}
      {original}
    </div>
  );
}
