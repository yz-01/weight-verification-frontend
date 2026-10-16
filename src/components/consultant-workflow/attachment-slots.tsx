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
  linkApplicationDocumentAttachments,
} from "@/services/consultant-workflow.service";
import { getDocumentCategories } from "@/services/document-workflow.service";

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
        <ul className="mt-1 space-y-0.5 text-xs text-foreground">
          {mine.map((attachment) => <li key={attachment.id} className="truncate">{attachment.original_name}</li>)}
        </ul>
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
  const categories = useQuery({
    queryKey: ["application-document-categories"],
    queryFn: () => getDocumentCategories({ page_size: 100, is_active: true }),
    enabled: libraryOpen,
  });
  const documents = useQuery({
    queryKey: ["application-document-candidates", application.project, search, libraryCategory],
    queryFn: () => getApplicationDocumentCandidates(application.project, search || undefined, libraryCategory || undefined),
    enabled: libraryOpen,
  });
  const save = useMutation({
    mutationFn: () => addApplicationAttachments(application.id, files, category, note),
    onSuccess: (result) => {
      setFiles(remainingAfter(result));
      if (!result.failed.length) onSaved();
    },
    onSettled: onChanged,
  });
  const link = useMutation({
    mutationFn: () => linkApplicationDocumentAttachments(application.id, picked, category, note),
    onSuccess: (result) => {
      setPicked(remainingAfter(result));
      if (!result.failed.length) onSaved();
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
                    {(categories.data?.results ?? []).map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {categories.isError && <LoadFailed what={t("what.archiveCategories")} onRetry={() => categories.refetch()} />}
              {documents.isLoading ? (
                <Loader2 className="animate-spin" />
              ) : documents.isError ? (
                <LoadFailed what={t("what.archiveDocuments")} onRetry={() => documents.refetch()} />
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {(documents.data?.results ?? []).filter((doc) => doc.latest_version).map((doc) => {
                    const version = doc.latest_version?.id ?? "";
                    return (
                      <label key={doc.id} className="flex w-full cursor-pointer items-center gap-3 rounded border p-2 hover:bg-muted/30">
                        <Checkbox checked={picked.includes(version)} onCheckedChange={() => toggle(version)} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{doc.document_no} · {doc.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{doc.category_name} {doc.subcategory_name ? `· ${doc.subcategory_name}` : ""} · {doc.latest_version?.original_name}</span>
                        </span>
                      </label>
                    );
                  })}
                  {!documents.data?.results?.length && <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t("attachment.noArchive")}</div>}
                </div>
              )}
              <Button type="button" disabled={!picked.length || busy} onClick={() => link.mutate()}>
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
