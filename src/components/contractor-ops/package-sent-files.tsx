"use client";

import { useMutation } from "@tanstack/react-query";
import { Paperclip, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FileActionButtons } from "@/components/shared/file-actions";
import { Button } from "@/components/ui/button";
import type { PackageSentFile } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * JB307-1 (客户 11-28j 事项 1: 「项目经理上传的正式信函及相关文件，必须完整显示在
 * 资料包内，并支持接收方查看、预览、打印及导出，确保资料完整」): the files the
 * project manager uploaded into a package, as a receiver sees them - a
 * consultant on 「待审阅的资料包」, an owner or supplier on the link. Each one
 * opens as a PDF (a picture or Word file on the package's own pages), so
 * 预览 · 打印 · 导出 work the same for every kind of file; they are pages of
 * the whole package's PDF as well. Head office reads them in the office's own
 * window (the 「上传的资料」 panel).
 */
export function PackageSentFiles({
  files,
  load,
  ownWork,
  project,
  recordId,
  phone = false,
}: {
  files: PackageSentFile[];
  /** The file as a PDF; `inline` for the preview. */
  load: (file: PackageSentFile, inline: boolean) => Promise<File>;
  /** A consultant's own 资料包 work (JB210): as the records beside it. */
  ownWork?: boolean;
  project?: string;
  /** The package, for the print / export log row. */
  recordId?: string;
  /** The link's page: phone-sized buttons. */
  phone?: boolean;
}) {
  const t = useTranslations("jb307");
  const kinds = useTranslations("multiEngine");
  const formatter = useDateFormat();
  if (files.length === 0) return null;
  return (
    <section className="space-y-2" aria-label={t("files.title")} data-package-sent-files>
      <div>
        <h2 className="text-sm font-semibold">
          {t("files.title")} <span className="tabular-nums text-muted-foreground">({files.length})</span>
        </h2>
        <p className="text-xs text-muted-foreground">{t("files.help")}</p>
      </div>
      <ul className="space-y-2">
        {files.map((file) => (
          <li
            key={file.id}
            className={`space-y-2 rounded-lg border border-dashed p-3${phone ? " bg-card" : ""}`}
            data-package-sent-file
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-medium">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate" title={file.name}>
                  {file.name}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {kinds(file.letter ? "layoutLetter" : "layoutUpload")} · {file.uploaded_by_name || "—"} ·{" "}
                {formatter.dateTime(file.uploaded_at)} · {size(file.byte_size)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <FileActionButtons
                ownWork={ownWork}
                allowSave
                source={{
                  load: () => load(file, true),
                  loadToSend: () => load(file, false),
                  title: file.name,
                  project,
                  recordKind: recordId ? "EVIDENCE_PACKAGE" : undefined,
                  recordId,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * JB307-2 (客户 11-28j 事项 2: 「重新签名提交前可以删除本轮误上传的文件，提交后
 * 自动锁定，不影响上一轮的历史资料」): the bin on a file uploaded for the next
 * round, as on a record added for it. Asked once in plain words; the file
 * goes, and an earlier round's files never show this button.
 */
export function RemoveNextRoundFile({
  name,
  draft = false,
  onRemove,
  onRemoved,
}: {
  name: string;
  /** A draft's own upload: nothing was sent yet, there is no next round. */
  draft?: boolean;
  onRemove: () => Promise<unknown>;
  onRemoved?: () => void;
}) {
  const t = useTranslations("jb307");
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: onRemove,
    onSuccess: () => {
      setOpen(false);
      onRemoved?.();
    },
  });
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline-destructive"
        aria-label={t("remove.button")}
        title={t("remove.button")}
        data-remove-next-round-file
        onClick={() => setOpen(true)}
      >
        <Trash2 />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("remove.title", { name })}
        description={t(draft ? "remove.bodyDraft" : "remove.body")}
        confirmLabel={t("remove.confirm")}
        isPending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
