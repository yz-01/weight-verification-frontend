"use client";

import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  FILE_ACTION_ICONS,
  fileActionsFor,
  useFileActions,
  type FileAction,
} from "@/components/shared/file-actions";
import { Button } from "@/components/ui/button";
import { useMayExport } from "@/hooks/use-may-export";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
 * 预览 asks no PIN and is not an export (JB27); 打印 · 导出 · 发送 ask for the
 * person's own PIN once - the export behind them is not asked again - and
 * are written to the operation log (`useFileActions`).
 *
 * The caller supplies the format handler rather than the endpoint, because
 * what an export contains - which columns, worded how - belongs to the screen
 * that knows both. Failures are already toasted by the service layer.
 */
/** What the person chose in the menu, passed to `onExport` (JB256). */
export interface ExportChoice {
  /** 「包含照片」 (true) or 「不包含照片」 (false). */
  includePhotos: boolean;
}

export function ExportButton({
  onExport,
  photoChoice = false,
  disabled,
  disabledReason,
  formats = ["xlsx", "pdf"],
  allowSave = true,
  title,
  link,
  record,
  label,
  size,
  variant = "outline",
  ownWork,
  blockedReason,
}: {
  onExport: (format: ExportFormat, choice: ExportChoice) => Promise<unknown>;
  /**
   * 「包含照片 / 不包含照片」 at the top of the menu (JB256, 客户 11-24b 事项 3:
   * 「预览及导出时，支持选择包含照片或不包含照片」): the choice holds for
   * 预览 · 打印 · 导出 · 发送 alike. Without it the file is as it always was.
   */
  photoChoice?: boolean;
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
  /**
   * The one record this file is (a weigh ticket, a final report, a package's
   * single item): named on the log row, so 「打开记录」 opens it (JB183).
   */
  record?: { kind: string; id: string };
  /** The trigger's words; 「导出」 (「文件」 without 导出) unless the screen names its file. */
  label?: string;
  size?: "sm" | "default";
  variant?: "outline" | "default";
  /**
   * A consultant's own 顾问申请 / 资料包 list (JB210): exported as before,
   * 「导出」 ticked or not.
   */
  ownWork?: boolean;
  /**
   * 预览 only, the other three greyed with this sentence - as
   * `FileActionButtons` does. JB220: MSE may only look at a customer's ticket
   * (「允许 MSE 查看」 is look and preview, no print, export or send).
   */
  blockedReason?: string;
}) {
  const t = useTranslations();
  const { busy, run, element } = useFileActions();
  const { user } = useAuth();
  // 「导出：报表和各模块清单可以导出」 (JB210, walk 11-17 F-A4): a consultant
  // without it gets no list file at all - the server makes none for him.
  const mayExport = useMayExport() || Boolean(ownWork);
  const [includePhotos, setIncludePhotos] = useState(true);

  const start = (format: ExportFormat, action: FileAction) =>
    void run(
      action,
      {
        load: () => captureDownload(() => onExport(format, { includePhotos })),
        title: title ?? "",
        link,
        recordKind: record?.kind,
        recordId: record?.id,
        // Each real export is kept in 「报表导出历史」 by the server; a
        // preview is not (JB27), so an action from the preview fetches again.
        exportedOnServer: true,
        ownWork,
      },
      { key: `${format}-${action}`, allowSave, blockedReason },
    );

  // Files are the office's (Lucas 11-05): never offered on the phone.
  if (user?.is_field_staff) return null;
  if (!mayExport) return null;
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
          {photoChoice ? (
            <div data-slot="export-photos">
              <DropdownMenuLabel className="text-foreground">{t("jb256.photos")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={includePhotos ? "with" : "without"}
                onValueChange={(value) => setIncludePhotos(value === "with")}
              >
                {/* Choosing keeps the menu open: the file is picked next. */}
                <DropdownMenuRadioItem
                  value="with"
                  data-slot="export-photos-with"
                  onSelect={(event) => event.preventDefault()}
                >
                  {t("jb256.withPhotos")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="without"
                  data-slot="export-photos-without"
                  onSelect={(event) => event.preventDefault()}
                >
                  {t("jb256.withoutPhotos")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
            </div>
          ) : null}
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
                    const blocked = Boolean(blockedReason) && action !== "preview";
                    return (
                      <DropdownMenuItem
                        key={action}
                        data-slot={`export-${format}-${action}`}
                        className="flex-col justify-center gap-1 px-1 text-xs"
                        disabled={blocked}
                        title={blocked ? blockedReason : undefined}
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
            {blockedReason ?? t("fileActions.shareHint")}
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
      {element}
    </>
  );
}
