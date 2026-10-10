"use client";

/**
 * 报表导出历史 as an archive (建筑商总部, 2026-10-10).
 *
 * The client: 「点击文件名或「查看」按钮，可直接打开当时生成的报表 · 支持预览 ·
 * 支持再次下载 · 支持打印 · 打开的必须是当时已经生成并保存的那一份历史文件 ·
 * 不要点击后再用当前数据库资料重新生成」.
 *
 * Every history row keeps the file its export handed over; these pieces open
 * that stored file - never a fresh export - with the shared 预览 · 打印 · 导出 ·
 * 发送 (`useFileActions`), so a PDF previews in the page and an Excel file in
 * the sheet previewer. A row from before files were kept says so, and its
 * buttons stay greyed with that reason.
 *
 * Used by every report export history: the contractor's 报表导出历史, the MSE
 * Admin report centre and the recycler report centre.
 */

import { Eye, FileCheck2, FileClock, Fingerprint, Loader2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

import {
  FILE_ACTION_ICONS,
  fileActionsFor,
  useFileActions,
  type FileAction,
} from "@/components/shared/file-actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import type { ArchivedReportFile } from "@/interfaces/report-archive";
import { cn } from "@/lib/utils";
import { archivedReportFile, previewArchivedReport } from "@/services/report-archive.service";

/** 1.2 MB - the stored file's size, as the archive shows it. */
export function formatFileSize(bytes: number): string {
  const value = Math.max(0, bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Open history rows' stored files. Render `element` once in the screen.
 *
 * Looking and printing fetch the file as a preview; saving and sending fetch
 * it as a download, which the server notes as the report leaving again.
 */
export function useReportArchive() {
  const { busy, run, element } = useFileActions();
  const open = useCallback(
    (row: ArchivedReportFile, action: FileAction, title?: string) => {
      if (!row.has_file) return;
      void run(
        action,
        {
          load: () => previewArchivedReport(row.id, row.file_name),
          loadToSend: () => archivedReportFile(row.id, row.file_name),
          title: title || row.file_name,
        },
        { key: `${row.id}:${action}` },
      );
    },
    [run],
  );
  return { busy, open, element };
}

export type ReportArchive = ReturnType<typeof useReportArchive>;

interface RowProps {
  row: ArchivedReportFile;
  archive: ReportArchive;
  /** The heading on the preview: the report and its period. */
  title?: string;
  className?: string;
}

/** The file name: a link to the stored file, or plain when none was kept. */
export function ArchivedReportName({ row, archive, title, className }: RowProps) {
  const t = useTranslations("reportArchive");
  if (!row.has_file) {
    return (
      <span
        className={cn("flex min-w-0 items-start gap-2 text-muted-foreground", className)}
        title={`${row.file_name}\n${t("missing")}`}
        data-slot="report-archive-name"
      >
        <FileClock className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span className="line-clamp-2 min-w-0 break-all">{row.file_name}</span>
      </span>
    );
  }
  const opening = archive.busy === `${row.id}:preview`;
  return (
    <button
      type="button"
      className={cn(
        "flex min-w-0 items-start gap-2 rounded-sm text-left font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-wait",
        className,
      )}
      title={`${row.file_name}\n${t("viewHint")}`}
      disabled={Boolean(archive.busy)}
      onClick={() => archive.open(row, "preview", title)}
      data-slot="report-archive-name"
    >
      {opening ? (
        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        <FileCheck2 className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      <span className="line-clamp-2 min-w-0 break-all">{row.file_name}</span>
    </button>
  );
}

/**
 * Under the file name: 「已存档 · 不会重新生成」, its size and the 技术资料
 * (SHA-256) - or, for a row from before files were kept, why it cannot open.
 */
export function ArchivedReportNote({ row, className }: { row: ArchivedReportFile; className?: string }) {
  const t = useTranslations("reportArchive");
  if (!row.has_file) {
    return (
      <p className={cn("mt-1 text-xs leading-snug text-muted-foreground", className)} data-slot="report-archive-missing">
        {t("missing")}
      </p>
    );
  }
  return (
    <div
      className={cn("mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground", className)}
      data-slot="report-archive-note"
    >
      <span className="inline-flex items-center gap-1 text-success" title={t("archivedHint")}>
        <ShieldCheck className="size-3.5" aria-hidden />
        {t("archived")}
      </span>
      <span className="tabular">{formatFileSize(row.file_size)}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
            data-slot="report-archive-technical"
          >
            <Fingerprint className="size-3.5" aria-hidden />
            {t("technical")}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)]">
          <PopoverHeader>
            <PopoverTitle>{t("technical")}</PopoverTitle>
          </PopoverHeader>
          <dl className="grid gap-2 text-xs">
            <div>
              <dt className="text-muted-foreground">{t("format")}</dt>
              <dd>{row.export_format === "PDF" ? "PDF" : "Excel (.xlsx)"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("size")}</dt>
              <dd className="tabular">
                {formatFileSize(row.file_size)} · {t("bytes", { count: row.file_size })}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">SHA-256</dt>
              <dd className="font-mono break-all select-all" data-slot="report-archive-sha256">
                {row.file_sha256}
              </dd>
            </div>
          </dl>
          <p className="text-xs leading-snug text-muted-foreground">{t("sha256Hint")}</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * 「查看」, then 打印 (PDF only) · 导出 · 发送 straight from the row - all on the
 * stored file.
 */
export function ArchivedReportActions({ row, archive, title, className }: RowProps) {
  const t = useTranslations("reportArchive");
  const files = useTranslations("fileActions");
  const busy = archive.busy;
  const reason = !row.has_file ? t("missing") : busy ? files("preparing") : undefined;
  const disabled = !row.has_file || Boolean(busy);
  const others = fileActionsFor(row.export_format === "PDF" ? "pdf" : "sheet").filter(
    (action) => action !== "preview",
  );
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)} data-slot="report-archive-actions">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        disabledReason={reason}
        title={row.has_file ? t("viewHint") : undefined}
        onClick={() => archive.open(row, "preview", title)}
        data-slot="report-archive-view"
      >
        {busy === `${row.id}:preview` ? <Loader2 className="animate-spin" /> : <Eye />}
        {t("view")}
      </Button>
      {others.map((action) => {
        const Icon = FILE_ACTION_ICONS[action];
        return (
          <Button
            key={action}
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={files(action)}
            title={
              !row.has_file
                ? undefined
                : action === "save"
                  ? t("downloadAgain")
                  : action === "share"
                    ? files("shareHint")
                    : files(action)
            }
            disabled={disabled}
            disabledReason={reason}
            onClick={() => archive.open(row, action, title)}
            data-slot={`report-archive-${action}`}
          >
            {busy === `${row.id}:${action}` ? <Loader2 className="animate-spin" /> : <Icon />}
          </Button>
        );
      })}
    </div>
  );
}
