"use client";

/**
 * 「A4 预览」 of a consultant application (JB163, 客户 11-10 晚上 第十一批 第二段).
 *
 * The client, verbatim (the message ends mid-sentence):
 *
 *   1. 所有顾问申请表格（RFI、WIR、Material Approval、Method Statement、Shop
 *      Drawing、VO、SI、NCR 等）同样需要正式 A4 排版预览。
 *   2. 预览必须显示建筑商 Logo、正式公司名称、项目名称、申请编号、申请内容及相
 *
 * 「同样」 is JB162's 「正式文件样板预览」, and it looks the same: the pages are
 * pictures the server draws (an in-page PDF does not show on an iPhone), with
 * 「打开 PDF」 for the file itself. They are drawn by the same renderer as the
 * real export (`build_application_form_pdf`), for every application type, so
 * what is seen here is what goes out - the builder's logo, its official name,
 * the project, the number, the content and the related parts the form has.
 *
 * Three sources (`ApplicationFormPreviewSource`): an application as it is (the
 * detail), a draft with the edits on screen, one still being filled in. The
 * last two are what the save would send, taken at the press: typing on after
 * opening does not redraw the pages under the reader. Nothing is saved.
 */

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileSearch, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { LoadFailed, QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/interfaces/api";
import {
  applicationFormPreviewObjectUrl,
  getApplicationFormPreviewInfo,
  type ApplicationFormPreviewSource,
} from "@/services/consultant-workflow.service";

/**
 * Pages drawn as pictures here; a consultant's own form of more pages is in
 * the PDF in full. Each picture is a render of its own, so a 40-page form is
 * not drawn 40 times to be scrolled past.
 */
export const PREVIEW_PAGE_LIMIT = 6;

/** The cache key of one part of one preview: a new snapshot, new keys. */
export function previewKey(source: ApplicationFormPreviewSource, ...part: (string | number)[]) {
  return ["consultant-application-a4-preview", JSON.stringify(source), ...part];
}

/** A blob URL held by a query, let go when the query moves on to a new one. */
function useReleased(url: string | undefined) {
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
}

/**
 * 「A4 预览」. `source` is called at the press, so the preview is of the form
 * as it is then. Greyed out, it says why: `requires` (the fields the form is
 * still waiting for) or `disabledReason`.
 */
export function ApplicationA4PreviewButton({
  source,
  requires,
  disabledReason,
  size = "sm",
}: {
  source: () => ApplicationFormPreviewSource;
  requires?: React.ComponentProps<typeof Button>["requires"];
  disabledReason?: string;
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const t = useTranslations("consultantWorkflow.a4Preview");
  const [open, setOpen] = useState<ApplicationFormPreviewSource | null>(null);
  return (
    <>
      <Button
        type="button"
        size={size}
        variant="outline"
        data-slot="application-a4-preview"
        requires={requires}
        disabledReason={disabledReason}
        disabled={Boolean(disabledReason)}
        onClick={() => setOpen(source())}
      >
        <FileSearch />
        {t("button")}
      </Button>
      {open ? <ApplicationA4PreviewDialog source={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

export function ApplicationA4PreviewDialog({
  source,
  onClose,
}: {
  source: ApplicationFormPreviewSource;
  onClose: () => void;
}) {
  const t = useTranslations("consultantWorkflow.a4Preview");
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{source.kind === "saved" ? t("noteSaved") : t("noteUnsaved")}</DialogDescription>
        </DialogHeader>
        <ApplicationA4PreviewBody source={source} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

/** The dialog's content: the pages, what they are, 打开 PDF. */
export function ApplicationA4PreviewBody({
  source,
  onClose,
}: {
  source: ApplicationFormPreviewSource;
  onClose: () => void;
}) {
  const t = useTranslations("consultantWorkflow.a4Preview");
  const info = useQuery({
    queryKey: previewKey(source, "info"),
    queryFn: () => getApplicationFormPreviewInfo(source),
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
  });
  // Fetched ahead, so 「打开 PDF」 opens it straight from the tap: a phone
  // blocks a window opened after waiting for the network (JB162).
  const pdf = useQuery({
    queryKey: previewKey(source, "pdf"),
    queryFn: () => applicationFormPreviewObjectUrl(source, "pdf"),
    enabled: info.isSuccess,
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
  });
  useReleased(pdf.data);

  const facts = info.data;
  const shown = facts ? Math.min(facts.pages, PREVIEW_PAGE_LIMIT) : 0;
  const own = facts?.consultant_form ?? null;
  const reason = info.error instanceof ApiError ? info.error.message : "";

  return (
    <div className="space-y-4" data-testid="application-a4-preview">
      {facts ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium text-foreground">
            {t("number", { number: facts.application_no })}
          </p>
          {facts.number_provisional ? (
            <p className="rounded-lg border border-info/30 bg-info/5 p-3 text-info">
              {t("numberProvisional", { number: facts.application_no })}
            </p>
          ) : null}
          {own ? (
            <p className="rounded-lg border bg-muted/30 p-3 text-muted-foreground" data-testid="application-a4-own-form">
              {own.source === "FILLED"
                ? t("ownFormFilled", { name: own.name, version: own.version, page: facts.form_pages + 1 })
                : t("ownFormBlank", { name: own.name, version: own.version, page: facts.form_pages + 1 })}
            </p>
          ) : null}
        </div>
      ) : null}

      {info.isError ? (
        <div className="space-y-2">
          <LoadFailed what={t("what")} onRetry={() => info.refetch()} />
          {reason ? <p className="text-center text-xs text-muted-foreground">{reason}</p> : null}
        </div>
      ) : !facts ? (
        <div className="grid min-h-48 place-items-center text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Loader2 className="size-5 animate-spin text-primary" />
            {t("loading")}
          </span>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from({ length: shown }, (_, index) => (
            <PreviewPage key={index} source={source} page={index + 1} total={facts.pages} />
          ))}
          {facts.pages > shown ? (
            <p className="text-center text-xs text-muted-foreground">
              {t("morePages", { count: facts.pages - shown })}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-end">
        <QueryFailedNote query={pdf} what={t("pdfWhat")} className="sm:mr-auto" />
        <Button type="button" variant="outline" onClick={onClose}>
          {t("close")}
        </Button>
        <Button
          type="button"
          data-slot="application-a4-open-pdf"
          disabledReason={pdf.data ? undefined : info.isError || pdf.isError ? t("pdfFailed") : t("pdfPreparing")}
          disabled={!pdf.data}
          onClick={() => window.open(pdf.data, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink />
          {t("openPdf")}
        </Button>
      </div>
    </div>
  );
}

function PreviewPage({
  source,
  page,
  total,
}: {
  source: ApplicationFormPreviewSource;
  page: number;
  total: number;
}) {
  const t = useTranslations("consultantWorkflow.a4Preview");
  const picture = useQuery({
    queryKey: previewKey(source, "png", page),
    queryFn: () => applicationFormPreviewObjectUrl(source, "png", page),
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
  });
  useReleased(picture.data);
  return (
    <figure className="space-y-1">
      <div className="mx-auto aspect-[210/297] w-full max-w-xl overflow-hidden rounded-md border bg-paper shadow-sm">
        {picture.data ? (
          // A blob URL of the server's own drawing: shown as it is.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={picture.data}
            alt={t("pageAlt", { page })}
            className="size-full object-contain"
            data-testid="application-a4-page"
          />
        ) : picture.isError ? (
          <div className="grid size-full place-items-center p-6 text-center">
            <QueryFailedNote query={picture} what={t("pageWhat", { page })} />
          </div>
        ) : (
          <div className="grid size-full place-items-center text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        )}
      </div>
      <figcaption className="text-center text-xs text-muted-foreground">
        {t("pageOf", { page, total })}
      </figcaption>
    </figure>
  );
}
