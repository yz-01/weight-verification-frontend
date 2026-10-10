"use client";

/**
 * 预览 · 打印 · 导出 · 发送 - one way to handle every file the system exports
 * (Lucas, 2026-10-10, 「PDF 统一操作规则」).
 *
 * 「所有栏目采用相同操作方式」: a report, a list, one record - the same four
 * words, the same icons, the same behaviour, from this one file:
 *
 * * `useFileActions` runs an action on a file: fetches it once, then
 *   previews, prints, saves or sends exactly those bytes
 *   (「预览内容与打印、导出的内容保持一致」);
 * * `FileActionButtons` - the four buttons, for one file (a record's PDF);
 * * `ExportButton` (export-button.tsx) - the list toolbar's 「导出 ▾」 menu,
 *   the same four actions for each format it offers (图4).
 *
 * Nothing here writes anything back: previewing, printing and sending read a
 * copy, and the record and its evidence stay as they are
 * (「不改变原始记录及证据资料」). Who may do what is the caller's permission
 * check, unchanged: a screen that could not export before passes
 * `allowSave={false}`, and a button the person cannot use is not drawn.
 *
 * 「发送」 shares a copy of the file. It is not an approval or a receipt
 * confirmation, and the screens say so in small print beside it.
 */

import { Copy, Download, ExternalLink, Eye, FileText, FileWarning, Loader2, Mail, MessageCircle, Printer, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { ApiError } from "@/interfaces/api";
import {
  canShareFile,
  canShowPdfInPage,
  fileFormat,
  mailtoLink,
  printFile,
  saveFile,
  shareFile,
  whatsappLink,
} from "@/lib/file-actions";
import { cn } from "@/lib/utils";
import { readWorkbook, type SheetPreview } from "@/lib/xlsx-preview";

export type FileAction = "preview" | "print" | "save" | "share";

export interface FileSource {
  /** Fetches the file; every action then works on what this returned. */
  load: () => Promise<File>;
  /**
   * Only where the server records that a file left the system (an evidence
   * package's 「已导出」, D-148): the same stored file, fetched so that the
   * export or the send is noted. Preview and print use `load` and note
   * nothing - looking at a file is not taking it out.
   */
  loadToSend?: () => Promise<File>;
  /** The heading on the preview and the share sheet. */
  title: string;
  /**
   * Where the record opens in the system, for colleagues who sign in: copied
   * or put in the message beside the file (2026-10 C11).
   */
  link?: string;
}

/** Share2, not Send: 「发送给顾问」 and other formal sends already use Send. */
export const FILE_ACTION_ICONS = {
  preview: Eye,
  print: Printer,
  save: Download,
  share: Share2,
} as const;

interface Held {
  file: File;
  title: string;
  link?: string;
  allowSave: boolean;
  /** Set when exporting or sending this file must be fetched as `loadToSend`. */
  resend?: () => Promise<File>;
}

const LEAVES: readonly FileAction[] = ["save", "share"];

/**
 * Run 预览 / 打印 / 导出 / 发送 on a file, and draw the dialogs they open.
 *
 * Render `element` once, anywhere in the caller.
 */
export function useFileActions() {
  const t = useTranslations("fileActions");
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Held | null>(null);
  const [sending, setSending] = useState<Held | null>(null);

  /** Fetch with a spinner; null when it failed (and the person was told). */
  const fetchWith = useCallback(
    async (load: () => Promise<File>, key: string): Promise<File | null> => {
      setBusy(key);
      try {
        return await load();
      } catch (error) {
        // A refusal from the server has already been toasted in the reader's
        // language; anything else gets a plain sentence, not silence.
        if (!(error instanceof ApiError) && !(error instanceof DOMException && error.name === "AbortError")) {
          toast.error(t("failed"));
        }
        return null;
      } finally {
        setBusy(null);
      }
    },
    [t],
  );

  /** One action on a file already in hand - no second fetch. */
  const act = useCallback(
    async (action: FileAction, given: Held) => {
      let held = given;
      if (held.resend && LEAVES.includes(action)) {
        const file = await fetchWith(held.resend, action);
        if (!file) return;
        held = { ...held, file, resend: undefined };
      }
      if (action === "preview") {
        setViewing(held);
      } else if (action === "save") {
        saveFile(held.file);
      } else if (action === "print") {
        if (!(await printFile(held.file))) {
          // A phone that cannot print from the page: the preview, where the
          // phone's own viewer prints it.
          setViewing(held);
          toast.info(t("printFromViewer"));
        }
      } else {
        const outcome = await shareFile(held.file, held.title);
        if (outcome === "shared") toast.success(t("shared"));
        else if (outcome !== "cancelled") setSending(held);
      }
    },
    [fetchWith, t],
  );

  /** Fetch the file, then run the action on it. `key` names the spinner. */
  const run = useCallback(
    async (action: FileAction, source: FileSource, options: { key?: string; allowSave?: boolean } = {}) => {
      if (busy) return;
      const leaving = Boolean(source.loadToSend) && LEAVES.includes(action);
      const file = await fetchWith(leaving ? source.loadToSend! : source.load, options.key ?? action);
      if (!file) return;
      await act(action, {
        file,
        title: source.title || file.name.replace(/\.[^.]+$/, ""),
        link: source.link,
        allowSave: options.allowSave ?? true,
        resend: leaving ? undefined : source.loadToSend,
      });
    },
    [act, busy, fetchWith],
  );

  const element = (
    <>
      {viewing ? (
        <FileViewerDialog
          held={viewing}
          busy={Boolean(busy)}
          onAct={(action) => void act(action, viewing)}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {sending ? <ShareFileDialog held={sending} onClose={() => setSending(null)} /> : null}
    </>
  );

  return { busy, run, element };
}

/** The four, in their one order. Printing is for PDFs only. */
export function fileActionsFor(format: "pdf" | "sheet", allowSave = true): FileAction[] {
  const all: FileAction[] = format === "pdf" ? ["preview", "print", "save", "share"] : ["preview", "save", "share"];
  return allowSave ? all : all.filter((action) => action !== "save");
}

/**
 * 预览 · 打印 · 导出 · 发送 as four buttons, for one file - a record's PDF in
 * the top right of its detail, or a dialog's own file.
 */
export function FileActionButtons({
  source,
  allowSave = true,
  disabled,
  disabledReason,
  className,
  label,
  labelHint,
}: {
  source: FileSource;
  /** False where the person may look at the file but not export it. */
  allowSave?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
  /**
   * What the four buttons act on, said once before them - a record's
   * 「完整证据 PDF」 (2026-10-10, 审批证据完整性), so nobody mistakes it for
   * the bare form. `labelHint` says what is inside, on hover.
   */
  label?: string;
  labelHint?: string;
}) {
  const t = useTranslations("fileActions");
  const { busy, run, element } = useFileActions();
  return (
    <>
      <div className={cn("contents", className)} data-slot="file-actions">
        {label ? (
          <span
            className="col-span-full inline-flex items-center gap-1 self-center text-xs font-medium text-muted-foreground"
            title={labelHint}
            data-slot="file-actions-label"
          >
            <FileText className="size-3.5" aria-hidden />
            {label}
          </span>
        ) : null}
        {fileActionsFor("pdf", allowSave).map((action) => {
          const Icon = FILE_ACTION_ICONS[action];
          return (
            <Button
              key={action}
              type="button"
              size="sm"
              variant="outline"
              data-slot={`file-action-${action}`}
              disabled={disabled || Boolean(busy)}
              disabledReason={disabled ? disabledReason : busy ? t("preparing") : undefined}
              title={action === "share" ? t("shareHint") : undefined}
              onClick={() => void run(action, source, { allowSave })}
            >
              {busy === action ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
              {t(action)}
            </Button>
          );
        })}
      </div>
      {element}
    </>
  );
}

/* --------------------------------------------------------------- viewer */

function FileViewerDialog({
  held,
  busy,
  onAct,
  onClose,
}: {
  held: Held;
  busy: boolean;
  onAct: (action: FileAction) => void;
  onClose: () => void;
}) {
  const t = useTranslations("fileActions");
  const format = fileFormat(held.file);
  const url = useObjectUrl(held.file);
  const actions = fileActionsFor(format === "pdf" ? "pdf" : "sheet", held.allowSave).filter(
    (action) => action !== "preview",
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[92dvh] flex-col gap-3 sm:max-w-5xl" data-slot="file-viewer">
        <DialogHeader>
          <DialogTitle className="break-all pr-8">{held.title}</DialogTitle>
          <DialogDescription className="break-all">{held.file.name}</DialogDescription>
        </DialogHeader>
        <div className="relative min-h-60 flex-1 overflow-hidden rounded-md border bg-muted/30">
          {format === "pdf" ? (
            <PdfView url={url} name={held.file.name} />
          ) : format === "sheet" ? (
            <SheetView file={held.file} />
          ) : format === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={held.file.name} className="absolute inset-0 size-full object-contain" />
          ) : (
            <Unsupported />
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {format === "sheet" ? `${t("sheetNoPrint")} ` : ""}
            {t("shareHint")}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            {format === "pdf" ? (
              <Button size="sm" variant="outline" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
                <ExternalLink className="size-4" />
                {t("openNewTab")}
              </Button>
            ) : null}
            {actions.map((action) => {
              const Icon = FILE_ACTION_ICONS[action];
              return (
                <Button
                  key={action}
                  size="sm"
                  variant={action === "save" ? "default" : "outline"}
                  data-slot={`file-viewer-${action}`}
                  disabled={busy}
                  disabledReason={busy ? t("preparing") : undefined}
                  onClick={() => {
                    if (action === "print" && !canShowPdfInPage()) {
                      // A phone: its own viewer prints, from its share menu.
                      // Opened straight from the tap, so it is not blocked.
                      window.open(url, "_blank", "noopener,noreferrer");
                      toast.info(t("printInViewer"));
                      return;
                    }
                    onAct(action);
                  }}
                >
                  <Icon className="size-4" />
                  {t(action)}
                </Button>
              );
            })}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** An object URL for the file, released when the viewer closes. */
function useObjectUrl(file: File): string {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return url;
}

function PdfView({ url, name }: { url: string; name: string }) {
  const t = useTranslations("fileActions");
  // Only ever drawn after a tap, never on the server, so the browser can be
  // asked straight away.
  const [inPage] = useState(canShowPdfInPage);
  if (inPage) {
    return <iframe src={url} title={name} className="absolute inset-0 size-full bg-paper" />;
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="max-w-md text-sm text-foreground">{t("noInlinePdf")}</p>
      <Button onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
        <ExternalLink className="size-4" />
        {t("openInViewer")}
      </Button>
    </div>
  );
}

function Unsupported() {
  const t = useTranslations("fileActions");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <FileWarning className="size-8 text-warning" />
      <p className="max-w-md text-sm text-foreground">{t("unsupported")}</p>
    </div>
  );
}

const SHEET_ROWS = 1000;

/** The workbook's sheets as read-only tables, from the file's own bytes. */
export function SheetView({ file }: { file: Blob }) {
  const t = useTranslations("fileActions");
  const [sheets, setSheets] = useState<SheetPreview[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => {
    let alive = true;
    readWorkbook(file, SHEET_ROWS)
      .then((read) => alive && setSheets(read))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [file]);

  if (failed || (sheets && !sheets.length)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <FileWarning className="size-8 text-warning" />
        <p className="max-w-md text-sm text-foreground">{t("sheetFailed")}</p>
      </div>
    );
  }
  if (!sheets) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="size-7 animate-spin text-primary" />
      </div>
    );
  }
  const sheet = sheets[Math.min(active, sheets.length - 1)];
  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      {sheets.length > 1 ? (
        <div className="flex shrink-0 flex-wrap gap-1 border-b p-2" role="tablist">
          {sheets.map((entry, index) => (
            <Button
              key={`${entry.name}-${index}`}
              size="sm"
              role="tab"
              aria-selected={index === active}
              variant={index === active ? "default" : "ghost"}
              onClick={() => setActive(index)}
            >
              {entry.name}
            </Button>
          ))}
        </div>
      ) : null}
      {sheet.totalRows > sheet.rows.length ? (
        <p className="shrink-0 border-b bg-warning/10 px-3 py-2 text-xs">
          {t("sheetTruncated", { shown: sheet.rows.length, total: sheet.totalRows })}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <SheetTable sheet={sheet} />
      </div>
    </div>
  );
}

function SheetTable({ sheet }: { sheet: SheetPreview }) {
  // Which cells a merge covers, and the spans of the cell that starts it.
  const { starts, covered } = useMemo(() => {
    const starts = new Map<string, { rows: number; columns: number }>();
    const covered = new Set<string>();
    for (const merge of sheet.merges) {
      starts.set(`${merge.row}:${merge.column}`, { rows: merge.rows, columns: merge.columns });
      for (let r = merge.row; r < merge.row + merge.rows; r += 1) {
        for (let c = merge.column; c < merge.column + merge.columns; c += 1) {
          if (r !== merge.row || c !== merge.column) covered.add(`${r}:${c}`);
        }
      }
    }
    return { starts, covered };
  }, [sheet]);
  return (
    <Table className="text-xs">
      <TableBody>
        {sheet.rows.map((cells, row) => (
          <TableRow key={row}>
            {cells.map((text, column) => {
              const key = `${row}:${column}`;
              if (covered.has(key)) return null;
              const span = starts.get(key);
              return (
                <TableCell
                  key={key}
                  colSpan={span?.columns}
                  rowSpan={span && span.rows > 1 ? span.rows : undefined}
                  className={cn("max-w-80 whitespace-pre-wrap border-r align-top", span && "font-semibold")}
                >
                  {text}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/* ---------------------------------------------------------------- share */

/**
 * Where the share sheet could not take the file: a second tap on a phone
 * (iOS allows the sheet only straight after a tap, and fetching the file can
 * take longer), and on a computer, the file downloaded plus an email or a
 * WhatsApp message to attach it to.
 */
function ShareFileDialog({ held, onClose }: { held: Held; onClose: () => void }) {
  const t = useTranslations("fileActions");
  // A second tap on a phone; download and attach on a computer.
  const [canShare, setCanShare] = useState(() => canShareFile(held.file));
  const common = useTranslations("common");
  const message = [t("shareMessage", { name: held.file.name }), held.link].filter(Boolean).join("\n");
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(held.link ?? "");
      toast.success(common("linkCopied"));
    } catch {
      toast.error(common("shareFailed"));
    }
  };
  const share = async () => {
    const outcome = await shareFile(held.file, held.title);
    if (outcome === "shared") {
      toast.success(t("shared"));
      onClose();
    } else if (outcome === "failed" || outcome === "unsupported") {
      setCanShare(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" data-slot="file-share">
        <DialogHeader>
          <DialogTitle>{t("shareTitle")}</DialogTitle>
          <DialogDescription className="break-all">{held.file.name}</DialogDescription>
        </DialogHeader>
        {canShare ? (
          <div className="space-y-3">
            <p className="text-sm">{t("shareReady")}</p>
            <Button className="w-full" onClick={() => void share()}>
              <Share2 className="size-4" />
              {t("share")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">{t("shareDesktop")}</p>
            <Button className="w-full" onClick={() => saveFile(held.file)}>
              <Download className="size-4" />
              {t("shareDownload")}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" asChild>
                <a href={mailtoLink(held.title, message)}>
                  <Mail className="size-4" />
                  {t("shareEmail")}
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={whatsappLink(`${held.title}\n${message}`)} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" />
                  {t("shareWhatsapp")}
                </a>
              </Button>
            </div>
            {held.link ? (
              <Button variant="ghost" className="w-full" onClick={() => void copyLink()}>
                <Copy className="size-4" />
                {t("shareCopyLink")}
              </Button>
            ) : null}
          </div>
        )}
        <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">{t("shareHint")}</p>
      </DialogContent>
    </Dialog>
  );
}

/** For callers that put the hint under their own buttons. */
export function ShareHint({ className }: { className?: string }): ReactNode {
  const t = useTranslations("fileActions");
  return <p className={cn("text-xs text-muted-foreground", className)}>{t("shareHint")}</p>;
}
