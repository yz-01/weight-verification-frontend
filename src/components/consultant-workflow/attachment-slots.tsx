"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Loader2, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { ATTACHMENT_TYPES } from "@/components/consultant-workflow/application-draft-edit";
import { AttachmentPicker } from "@/components/shared/attachment-picker";
import { useAllowedTypeRefusal } from "@/components/shared/attachment-refusal";
import { FieldWrapper, LoadFailed } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDebounce } from "@/hooks/use-debounce";
import type { ConsultantApplication } from "@/interfaces/consultant-workflow";
import { remainingAfter } from "@/lib/attachment-batch";
import type { AttachmentRule } from "@/lib/attachment-picker";
import { ATTACHMENT_ACCEPT } from "@/lib/attachment-whitelist";
import {
  addApplicationAttachments,
  getApplicationDocumentCandidates,
  linkApplicationDocuments,
} from "@/services/consultant-workflow.service";
import { FileThumbs, stampedPicture } from "@/components/shared/file-thumbs";

/** The server's limits (`utils/attachment_files.py`): 10 files, 50 MB each. */
const RULE: AttachmentRule = {
  accept: ATTACHMENT_ACCEPT,
  maxFiles: 10,
  maxBytes: 50 * 1024 * 1024,
  multiple: true,
};

const ALL = "__all__";

/**
 * One 「必须上传」 slot (I40): the tile is the upload button. Click it to
 * choose files (several at once), drop files on it, or paste; the type is
 * already the tile's. It then says 「已上传 N 个」 with the file names.
 * 「从文件管理选择」 picks files already in the archive instead (only with
 * the archive's read permission).
 *
 * A file the server refuses stays in the list, the ones that went up leave
 * it, and the page refreshes either way - so pressing again can never save
 * the same file twice.
 */
export function RequiredAttachmentTile({
  application,
  code,
  editable,
  canArchive,
  onChanged,
  onPickFromArchive,
}: {
  application: ConsultantApplication;
  code: string;
  editable: boolean;
  canArchive: boolean;
  onChanged: () => void;
  onPickFromArchive: () => void;
}) {
  const t = useTranslations("consultantWorkflow");
  const refusalText = useAllowedTypeRefusal(ATTACHMENT_ACCEPT);
  const zone = useRef<HTMLDivElement>(null);
  const [queue, setQueue] = useState<File[]>([]);
  const mine = application.attachments.filter((attachment) => attachment.category === code);
  const attached = mine.length > 0;
  const upload = useMutation({
    mutationFn: (files: File[]) => addApplicationAttachments(application.id, files, code),
    onSuccess: (result) => setQueue((current) => current.filter((file) => !result.saved.includes(file))),
    onSettled: onChanged,
  });
  const tone = attached ? "border-success/30 bg-success/5 text-success" : "border-warning/30 bg-warning/5 text-warning";
  return (
    <div data-attachment-tile={code} className={`rounded-lg border p-3 text-sm ${tone}`}>
      <button
        type="button"
        disabled={!editable || upload.isPending}
        className="flex min-h-9 w-full items-center gap-2 text-left disabled:cursor-default"
        aria-label={editable ? t("attachment.tileUpload", { type: t(`attachmentType.${code}`) }) : undefined}
        onClick={() => zone.current?.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')?.click()}
      >
        {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : attached ? <CheckCircle2 className="size-4" /> : <Paperclip className="size-4" />}
        <span className="font-medium">{t(`attachmentType.${code}`)}</span>
        <span className="ml-auto text-xs">{attached ? t("attachment.uploadedCount", { count: mine.length }) : t("attachment.required")}</span>
      </button>
      {attached && (
        // What is in the slot as pictures, never names (J34-11).
        <FileThumbs
          all
          className="mt-1"
          files={mine.map((attachment) => ({
            id: attachment.id,
            name: attachment.original_name,
            thumbnail_url: stampedPicture(attachment.content_type, attachment.watermarked_file),
            href: attachment.watermarked_file || attachment.file,
          }))}
        />
      )}
      {editable && (
        <div ref={zone} className="mt-2 text-foreground">
          <AttachmentPicker
            files={queue}
            onChange={(next) => {
              const fresh = next.filter((file) => !queue.includes(file));
              setQueue(next);
              if (fresh.length) upload.mutate(fresh);
            }}
            rule={RULE}
            camera={false}
            showLimits={false}
            refusalText={refusalText}
            disabled={upload.isPending}
          />
          {canArchive && (
            <Button type="button" size="sm" variant="ghost" className="mt-1 h-8 px-2 text-xs" onClick={onPickFromArchive}>
              <ClipboardCheck />
              {t("attachment.fromArchiveShort")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 添加附件: upload several files, or tick files already in the archive. From
 * a tile the type is preset. Whatever went up is dropped from the list and the
 * page is refreshed even when some failed (see the tile).
 */
export function AttachmentDialog({
  application,
  preset,
  openArchive = false,
  canArchive,
  onClose,
  onChanged,
  onSaved,
}: {
  application: ConsultantApplication;
  preset?: string;
  openArchive?: boolean;
  canArchive: boolean;
  onClose: () => void;
  onChanged: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("consultantWorkflow");
  const refusalText = useAllowedTypeRefusal(ATTACHMENT_ACCEPT);
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState(preset ?? "OTHER");
  const [note, setNote] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(openArchive && canArchive);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryCategory, setLibraryCategory] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const search = useDebounce(librarySearch, 300);
  // The application's own project, no 查看文件 permission (J22, Q22-1).
  const documents = useQuery({
    queryKey: ["application-document-candidates", application.id, search],
    queryFn: () => getApplicationDocumentCandidates(application.id, search || undefined),
    enabled: libraryOpen,
  });
  const archiveCategories = [...new Set((documents.data?.results ?? []).map((doc) => doc.category_name).filter(Boolean))];
  const shownDocuments = (documents.data?.results ?? []).filter(
    (doc) => !libraryCategory || doc.category_name === libraryCategory,
  );
  const save = useMutation({
    mutationFn: () => addApplicationAttachments(application.id, files, category, note),
    onSuccess: (result) => {
      setFiles(remainingAfter(result));
      if (!result.failed.length) onSaved();
    },
    onSettled: onChanged,
  });
  const link = useMutation({
    mutationFn: () => linkApplicationDocuments(application.id, picked, category, note),
    onSuccess: () => {
      setPicked([]);
      onSaved();
    },
    onSettled: onChanged,
  });
  const toggle = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  const busy = save.isPending || link.isPending;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("attachment.title")}</DialogTitle>
          <DialogDescription>{t("attachment.help")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {canArchive && (
            <Button type="button" variant="outline" onClick={() => setLibraryOpen((value) => !value)}>
              <ClipboardCheck />
              {t("attachment.fromArchive")}
            </Button>
          )}
          {libraryOpen && canArchive && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder={t("attachment.searchArchive")} value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} />
                <Select value={libraryCategory || ALL} onValueChange={(value) => setLibraryCategory(value === ALL ? "" : value)}>
                  <SelectTrigger className="w-full" aria-label={t("attachment.archiveCategory")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t("attachment.allArchiveCategories")}</SelectItem>
                    {archiveCategories.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {documents.isLoading ? (
                <Loader2 className="animate-spin" />
              ) : documents.isError ? (
                <LoadFailed what={t("what.archiveDocuments")} onRetry={() => documents.refetch()} />
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {shownDocuments.map((doc) => {
                    // A file the system filed names the record it holds
                    // (JB7): that record comes with it, whole.
                    const records = [...new Set(doc.system_files.map((file) => file.record?.reference).filter(Boolean))];
                    return (
                      <label key={doc.id} className="flex w-full cursor-pointer items-center gap-3 rounded border p-2 hover:bg-muted/30">
                        <Checkbox checked={picked.includes(doc.id)} onCheckedChange={() => toggle(doc.id)} />
                        {doc.latest_version ? (
                          <FileThumbs
                            files={[
                              {
                                id: doc.latest_version.id,
                                name: doc.latest_version.original_name,
                              },
                            ]}
                          />
                        ) : null}
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{doc.document_no} · {doc.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {doc.category_name} {doc.subcategory_name ? `· ${doc.subcategory_name}` : ""}
                            {records.length ? ` · ${t("attachment.wholeRecord", { records: records.join("、") })}` : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                  {!shownDocuments.length && <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t("attachment.noArchive")}</div>}
                </div>
              )}
              <Button type="button" disabled={!picked.length || busy} disabledReason={!picked.length ? t("attachment.tickFirst") : undefined} onClick={() => link.mutate()}>
                {link.isPending ? <Loader2 className="animate-spin" /> : <Paperclip />}
                {t("attachment.addPicked", { count: picked.length })}
              </Button>
            </div>
          )}
          <FieldWrapper label={t("attachment.file")} required>
            <AttachmentPicker files={files} onChange={setFiles} rule={RULE} refusalText={refusalText} disabled={busy} />
          </FieldWrapper>
          <FieldWrapper label={t("attachment.category")}>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ATTACHMENT_TYPES.map((value) => <SelectItem key={value} value={value}>{t(`attachmentType.${value}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("attachment.note")}>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </FieldWrapper>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button>
          <Button requires={[[files.length, t("attachment.file")]]} disabled={busy} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Paperclip />}
            {t("attachment.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
