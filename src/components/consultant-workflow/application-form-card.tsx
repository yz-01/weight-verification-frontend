"use client";

import { useMutation } from "@tanstack/react-query";
import { FileText, Loader2, Paperclip, Printer, Send } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

/**
 * The application as the customer's A4 form (2026-10 C1).
 *
 * Every way the office uses the form starts here and comes back the same
 * page: 预览 and 导出 PDF (the record export, which for an application is the
 * A4 form - C17), 打印 (that same PDF, printed), 发送给顾问 (the in-system
 * send to the consultant it is addressed to) and 看附件 (the list on this
 * page the form's attachment index refers to).
 *
 * `exportButtons` is the shared preview / export pair, passed in so the
 * detail keeps drawing `RecordExportButton` itself like every other module.
 */
export function ApplicationFormCard({
  consultantName,
  attachmentCount,
  canSend,
  isSubmitting,
  onSend,
  onPrint,
  onShowAttachments,
  exportButtons,
}: {
  consultantName: string;
  attachmentCount: number;
  /** A draft, and the reader may send it. */
  canSend: boolean;
  isSubmitting: boolean;
  onSend: () => void;
  onPrint: () => Promise<void>;
  onShowAttachments: () => void;
  exportButtons: React.ReactNode;
}) {
  const t = useTranslations("consultantWorkflow.formCard");
  const printing = useMutation({ mutationFn: onPrint });
  return (
    <section
      className="surface-panel rounded-xl p-4"
      data-testid="application-form-card"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <FileText className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold">{t("title")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("help")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {exportButtons}
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-slot="application-form-print"
            disabled={printing.isPending}
            onClick={() => printing.mutate()}
          >
            {printing.isPending ? <Loader2 className="animate-spin" /> : <Printer />}
            {t("print")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-slot="application-form-attachments"
            onClick={onShowAttachments}
          >
            <Paperclip />
            {t("attachments", { count: attachmentCount })}
          </Button>
          {canSend ? (
            <Button
              type="button"
              size="sm"
              data-slot="application-form-send"
              disabled={isSubmitting}
              onClick={onSend}
            >
              {isSubmitting ? <Loader2 className="animate-spin" /> : <Send />}
              {t("send", { name: consultantName })}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * Print a PDF without leaving the page: load it into a hidden frame and ask
 * that frame to print. Where a browser will not print a PDF from a frame,
 * the PDF opens in a new tab to print from there.
 */
export async function printPdf(load: () => Promise<string>) {
  const url = await load();
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.setAttribute("aria-hidden", "true");
  frame.src = url;
  const cleanUp = () => {
    frame.remove();
    URL.revokeObjectURL(url);
  };
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      // The print dialog blocks in most browsers; a minute is long enough
      // for the ones where it does not.
      window.setTimeout(cleanUp, 60_000);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(cleanUp, 60_000);
    }
  };
  document.body.appendChild(frame);
}
