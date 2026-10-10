"use client";

/**
 * 通用附件 / Attachments on one record (B28, E10).
 *
 * 「普通 Upload／Attachment 为通用上传，可上传照片、PDF、单据、证书、付款凭证及其他
 * 相关文件；所有有相应项目／事项访问权限的后台人员可上传」. So the button is shown
 * to whoever has the record open - the server decides who that is, the same
 * way it decides who may talk on the record - and a module's own dedicated
 * slot (a sundry claim's payment voucher) stays where it is beside this one.
 *
 * Every file is write-once: there is no delete and no replace, only another
 * file. Once the record is finished nothing more is added, and everything
 * already attached can still be opened, printed and downloaded (D12).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, FileText, ImageIcon, Loader2, Lock, Paperclip, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FilePreviewDialog } from "@/components/shared/file-preview";
import { FieldWrapper, LoadFailed } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RecordAttachment } from "@/interfaces/record-attachment";
import type { ChatRecordKind } from "@/lib/record-chat";
import { useDateFormat } from "@/lib/dates";
import {
  downloadRecordAttachment,
  getRecordAttachments,
  recordAttachmentObjectUrl,
  uploadRecordAttachments,
} from "@/services/record-attachment.service";

export function recordAttachmentsKey(kind: ChatRecordKind, recordId: string) {
  return ["record-attachments", kind, recordId] as const;
}

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RecordAttachmentsPanel({
  kind,
  recordId,
  readOnly = false,
}: {
  kind: ChatRecordKind;
  recordId: string;
  /** Read and open only, no 加附件 - the phone's view of a permit. */
  readOnly?: boolean;
}) {
  const t = useTranslations("recordAttachments");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const [previewing, setPreviewing] = useState<RecordAttachment | null>(null);

  const state = useQuery({
    queryKey: recordAttachmentsKey(kind, recordId),
    queryFn: () => getRecordAttachments(kind, recordId),
  });
  const upload = useMutation({
    mutationFn: () => uploadRecordAttachments(kind, recordId, files, note.trim()),
    onSuccess: () => {
      setFiles([]);
      setNote("");
      setInputKey((value) => value + 1);
      setAdding(false);
    },
    // A finished record refuses with 409; refetching shows why instead of the form.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: recordAttachmentsKey(kind, recordId) }),
  });

  const rows = state.data?.attachments ?? [];
  const closed = state.data?.closed ?? "";

  return (
    <section className="rounded-lg border p-3" data-slot="record-attachments">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("title")}
          <span className="ml-1 tabular-nums">({rows.length})</span>
        </h3>
        {!readOnly && !closed && state.data && !adding && (
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setAdding(true)}>
            <Paperclip className="size-3.5" />
            {t("add")}
          </Button>
        )}
      </div>

      {state.isLoading ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t("loading")}
        </p>
      ) : state.isError ? (
        <LoadFailed what={t("what")} onRetry={() => void state.refetch()} className="p-3" />
      ) : (
        <>
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="space-y-1.5">
              {rows.map((row) => {
                const Icon = row.preview_type?.startsWith("image/") ? ImageIcon : FileText;
                return (
                  <li key={row.id} className="flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs">
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        className="block max-w-full truncate text-left font-medium text-foreground hover:underline"
                        title={row.original_name}
                        onClick={() => setPreviewing(row)}
                      >
                        {row.original_name}
                      </button>
                      <p className="truncate text-2xs text-muted-foreground">
                        {row.uploaded_by_name ?? "—"} · {df.dateTime(row.uploaded_at)} · {size(row.byte_size)}
                      </p>
                      {row.note ? <p className="mt-0.5 break-words text-2xs">{row.note}</p> : null}
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0"
                      title={t("preview")}
                      onClick={() => setPreviewing(row)}
                    >
                      <Eye className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0"
                      title={t("download")}
                      onClick={() => void downloadRecordAttachment(kind, recordId, row)}
                    >
                      <Download className="size-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {readOnly ? null : closed ? (
            <p className="mt-2 flex items-start gap-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-2xs text-muted-foreground">
              <Lock className="mt-0.5 size-3 shrink-0" />
              {t("closed")}
            </p>
          ) : adding ? (
            <div className="mt-2 space-y-2 rounded-md border border-dashed p-2">
              <p className="text-2xs text-muted-foreground">{t("hint")}</p>
              <FieldWrapper label={t("files")} required>
                <Input
                  key={inputKey}
                  type="file"
                  multiple
                  className="h-8 text-xs"
                  aria-label={t("files")}
                  onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                />
              </FieldWrapper>
              <Input
                className="h-8 text-xs"
                value={note}
                maxLength={255}
                placeholder={t("notePlaceholder")}
                aria-label={t("note")}
                onChange={(event) => setNote(event.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={upload.isPending}
                  onClick={() => {
                    setAdding(false);
                    setFiles([]);
                    setNote("");
                  }}
                >
                  <X className="size-3.5" />
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  requires={[[files.length > 0, t("files")]]}
                  disabled={upload.isPending}
                  onClick={() => upload.mutate()}
                >
                  {upload.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  {t("upload", { count: files.length })}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {previewing && (
        <FilePreviewDialog
          title={previewing.original_name}
          description={`${previewing.uploaded_by_name ?? "—"} · ${df.dateTime(previewing.uploaded_at)}`}
          load={() => recordAttachmentObjectUrl(kind, recordId, previewing)}
          previewType={previewing.preview_type}
          filename={previewing.original_name}
          onDownload={() => downloadRecordAttachment(kind, recordId, previewing)}
          onClose={() => setPreviewing(null)}
        />
      )}
    </section>
  );
}
