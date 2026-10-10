"use client";

import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  FILE_ACTION_ICONS,
  fileActionsFor,
  useFileActions,
  type FileAction,
} from "@/components/shared/file-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { captureDownload } from "@/services/api-client";
import type { ExportFormat } from "@/services/contractor.service";

const FORMAT_ICONS = { xlsx: FileSpreadsheet, pdf: FileText } as const;
const FORMAT_LABELS = { xlsx: "export.excel", pdf: "export.pdf" } as const;

/**
 * 「导出 ▾」 - the list on screen, or a report, as an Excel or a PDF file.
 *
 * A secondary action, so it sits in the toolbar as an outline pill rather than
 * competing with the one primary action in the page header.
 *
 * PDF 统一操作规则 (2026-10-10, 图4 「可以加一个预览」): under each format the
 * same actions every exported file has - 预览 (see the whole file here,
 * without downloading it), 打印 (PDF), 导出 (download, as before) and 发送
 * (WhatsApp, email...). All of them run the screen's own export once and act
 * on the file it produced (`captureDownload`), so what is previewed is what
 * is printed, saved and sent.
 *
 * The caller supplies the format handler rather than the endpoint, because
 * what an export contains - which columns, worded how - belongs to the screen
 * that knows both. Failures are already toasted by the service layer.
 */
export function ExportButton({
  onExport,
  disabled,
  disabledReason,
  formats = ["xlsx", "pdf"],
  allowSave = true,
  title,
  link,
  label,
  size,
  variant = "outline",
}: {
  onExport: (format: ExportFormat) => Promise<unknown>;
  disabled?: boolean;
  disabledReason?: string;
  /** The formats this export offers; both unless the server makes only one. */
  formats?: readonly ExportFormat[];
  /**
   * False where the person may read and print the file but not export it
   * (their existing permission): 导出 is left out, nothing else changes.
   */
  allowSave?: boolean;
  /** The heading on the preview and the share sheet; the file's name if not given. */
  title?: string;
  /** Where the same rows open in the system, offered beside the sent file. */
  link?: string;
  /** The trigger's words; 「导出」 (「文件」 without 导出) unless the screen names its file. */
  label?: string;
  size?: "sm" | "default";
  variant?: "outline" | "default";
}) {
  const t = useTranslations();
  const { busy, run, element } = useFileActions();

  const start = (format: ExportFormat, action: FileAction) =>
    void run(
      action,
      {
        load: () => captureDownload(() => onExport(format)),
        title: title ?? "",
        link,
      },
      { key: `${format}-${action}`, allowSave },
    );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size={size}
            data-slot="export-menu"
            disabled={disabled || Boolean(busy)}
            disabledReason={disabled ? disabledReason : undefined}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Download />}
            {label ?? (allowSave ? t("common.export") : t("fileActions.file"))}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {formats.map((format, index) => {
            const FormatIcon = FORMAT_ICONS[format];
            const actions = fileActionsFor(format === "pdf" ? "pdf" : "sheet", allowSave);
            return (
              <div key={format} data-slot={`export-${format}`}>
                {index > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuLabel className="flex items-center gap-1.5 text-foreground">
                  <FormatIcon className="size-3.5" />
                  {t(FORMAT_LABELS[format])}
                </DropdownMenuLabel>
                <div className="grid grid-cols-4 gap-1">
                  {actions.map((action) => {
                    const Icon = FILE_ACTION_ICONS[action];
                    return (
                      <DropdownMenuItem
                        key={action}
                        data-slot={`export-${format}-${action}`}
                        className="flex-col justify-center gap-1 px-1 text-xs"
                        onSelect={() => start(format, action)}
                      >
                        <Icon className="size-4" />
                        {t(`fileActions.${action}`)}
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <DropdownMenuSeparator />
          <p className="px-2 pb-1 text-xs leading-snug text-muted-foreground">
            {t("fileActions.shareHint")}
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
      {element}
    </>
  );
}
