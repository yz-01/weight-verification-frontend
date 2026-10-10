"use client";

/**
 * 施工准证 (Permit to Work): the pieces the office page and the phone share.
 *
 * The client, 2026-10-10: 「用户使用电脑里原有的施工准证表格（Word/PDF），填写完成
 * 后直接上传系统。填写备注，提交给指定安全经理审批。安全经理可查看文件、沟通、批准
 * 或退回。完成审批后，原文件、审批记录、签名及时间全部保存归档。」 and 「不需要开发
 * 新的电子表格，也不需要提供固定模板」.
 *
 * So there is no form here to fill in - only the company's own file, a remark
 * and the person who approves it. The approver reads the file in the page
 * (Word, PDF or photo: `FilePreview`), talks in the permit's room, and either
 * signs to approve or switches on 退回 and says why. One component for both
 * ends, as the hazard room is.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Check,
  Download,
  Eye,
  FileText,
  FileUp,
  ImageIcon,
  Loader2,
  Lock,
  Printer,
  RotateCcw,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { useClearDraft, useDraftState } from "@/components/field-staff/field-draft";
import { FieldSignaturePad } from "@/components/field-staff/field-signature-pad";
import { useAuth } from "@/components/providers/auth-provider";
import { FilePreviewDialog } from "@/components/shared/file-preview";
import {
  FieldWrapper,
  LoadFailed,
  QueryFailedNote,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { RecordAttachmentsPanel } from "@/components/shared/record-attachments";
import {
  RecordDetailDialog,
  RecordDetailShell,
  RecordRecorder,
  type ShellFact,
  type ShellPhoto,
  type ShellPhotoGroup,
} from "@/components/shared/record-detail-shell";
import { HazardConversationPanel } from "@/components/site-operations/hazard-conversation";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type { Permit, PermitFile, PermitStatus } from "@/interfaces/permit";
import { useDateFormat } from "@/lib/dates";
import { printFile } from "@/lib/file-actions";
import { photoMeta } from "@/lib/photo-meta";
import {
  approvePermit,
  createPermit,
  downloadPermitFile,
  getPermit,
  getPermitApprovers,
  permitFileBlob,
  permitFileObjectUrl,
  resubmitPermit,
  returnPermit,
} from "@/services/permit.service";

/** What a permit form arrives as: Word, Excel, PDF or a photo of it. */
export const PERMIT_FILE_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*";

export const PERMIT_TONE: Record<PermitStatus, "warning" | "danger" | "positive"> = {
  RECTIFICATION_SUBMITTED: "warning",
  RETURNED: "danger",
  VERIFIED: "positive",
  RESOLVED: "positive",
};

export function PermitStatusBadge({ status }: { status: PermitStatus }) {
  const t = useTranslations("permits");
  return <StatusBadge label={t(`status.${status}`)} tone={PERMIT_TONE[status]} />;
}

export function permitKeys(id?: string) {
  return id ? (["permits", "detail", id] as const) : (["permits"] as const);
}

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function failure(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

/* ---------------------------------------------------------------- files */

/**
 * The 准证文件 slot: one place, any number of pages.
 *
 * Two buttons, because the two ends start differently: on the phone the
 * form is often paper, so 拍照 opens the camera; at a desk it is the Word or
 * PDF file, so 选择文件 opens the file picker (which on a phone also offers
 * the gallery and the files app).
 */
export function PermitFilesInput({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const t = useTranslations("permits.files");
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (picked.length) onChange([...files, ...picked]);
  };
  return (
    <div className="space-y-2" data-slot="permit-files">
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="min-h-11" onClick={() => camera.current?.click()}>
          <Camera className="size-4" />
          {t("takePhoto")}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => picker.current?.click()}>
          <FileUp className="size-4" />
          {t("chooseFile")}
        </Button>
      </div>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label={t("takePhoto")}
        onChange={(event) => {
          add(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={picker}
        type="file"
        multiple
        accept={PERMIT_FILE_ACCEPT}
        className="hidden"
        aria-label={t("chooseFile")}
        onChange={(event) => {
          add(event.target.files);
          event.target.value = "";
        }}
      />
      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-3 text-center text-sm text-muted-foreground">
          {t("none")}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
            >
              {file.type.startsWith("image/") ? (
                <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{size(file.size)}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                title={t("remove")}
                aria-label={t("remove")}
                onClick={() => onChange(files.filter((_, at) => at !== index))}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 预览 · 打印 · 下载 for one permit file (client point 7).
 *
 * The preview reads Word, Excel, PDF and photos in the page; a PDF prints
 * straight away, anything else prints from its preview (a photo) or after
 * download (a Word file - the browser cannot print one it did not draw).
 */
export function PermitFileActions({
  permitId,
  file,
  compact = false,
}: {
  permitId: string;
  file: PermitFile;
  compact?: boolean;
}) {
  const t = useTranslations("permits.files");
  const df = useDateFormat();
  const [previewing, setPreviewing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const print = async () => {
    if (file.preview_type === "application/pdf") {
      setPrinting(true);
      try {
        if (await printFile(await permitFileBlob(permitId, file))) return;
      } catch {
        // Told by the request layer; the preview below is the way on.
      } finally {
        setPrinting(false);
      }
    }
    setPreviewing(true);
  };
  const buttonSize = compact ? "size-7" : "size-8";
  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={`${buttonSize} shrink-0`}
        title={t("preview")}
        aria-label={t("preview")}
        onClick={(event) => {
          event.stopPropagation();
          setPreviewing(true);
        }}
      >
        <Eye className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={`${buttonSize} shrink-0`}
        title={t("print")}
        aria-label={t("print")}
        disabled={printing}
        disabledReason={printing ? t("preparing") : undefined}
        onClick={(event) => {
          event.stopPropagation();
          void print();
        }}
      >
        {printing ? <Loader2 className="size-3.5 animate-spin" /> : <Printer className="size-3.5" />}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={`${buttonSize} shrink-0`}
        title={t("download")}
        aria-label={t("download")}
        onClick={(event) => {
          event.stopPropagation();
          void downloadPermitFile(permitId, file);
        }}
      >
        <Download className="size-3.5" />
      </Button>
      {previewing && (
        <FilePreviewDialog
          title={file.original_name}
          description={`${file.uploaded_by_name ?? "—"} · ${df.dateTime(file.uploaded_at)}`}
          load={() => permitFileObjectUrl(permitId, file)}
          previewType={file.preview_type}
          filename={file.original_name}
          onDownload={() => downloadPermitFile(permitId, file)}
          onClose={() => setPreviewing(false)}
        />
      )}
    </>
  );
}

/** `PDF` from `form.pdf`: the badge on a document tile. */
function extension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toUpperCase() : "";
}

const BADGE_TONE: Record<string, string> = {
  PDF: "bg-destructive/12 text-destructive",
  DOC: "bg-info/12 text-info",
  DOCX: "bg-info/12 text-info",
  XLS: "bg-success/12 text-success",
  XLSX: "bg-success/12 text-success",
};

/** A photographed page goes in the gallery; anything else is a document tile. */
export function isPermitPhoto(file: PermitFile): boolean {
  return Boolean(file.photo?.url);
}

/**
 * The permit's photographed pages, for the shell's gallery - the same big
 * viewer and thumbnail strip a material receipt uses, with when and where
 * each was taken (client 2026-10-10 round 2: 「照片全部要跟收货进场一样」).
 * Earlier submissions sit in their own row under the current one.
 */
export function permitPhotos(permit: Permit, submissionLabel: (round: number) => string) {
  const files = [...permit.files]
    .filter(isPermitPhoto)
    .sort((a, b) => b.submission - a.submission);
  const rounds = [...new Set(files.map((file) => file.submission))];
  const photos: ShellPhoto[] = files.map((file) => ({
    id: file.id,
    url: file.photo!.url,
    thumbnailUrl: file.photo!.thumbnail_url,
    label: file.original_name,
    ...photoMeta(file.photo!),
    group: rounds.length > 1 ? `round-${file.submission}` : undefined,
  }));
  const groups: ShellPhotoGroup[] | undefined =
    rounds.length > 1
      ? rounds.map((round) => ({ key: `round-${round}`, label: submissionLabel(round) }))
      : undefined;
  return { photos, groups };
}

/**
 * The permit's Word, Excel and PDF files as tiles: tap one and it opens in
 * the page (PDF, Word, Excel and photos all read there - a phone that cannot
 * open the raw file still reads it), with print and download beside it.
 * This submission first; the files it was returned over beneath, kept.
 */
export function PermitDocuments({ permit }: { permit: Permit }) {
  const t = useTranslations("permits.files");
  const df = useDateFormat();
  const [previewing, setPreviewing] = useState<PermitFile | null>(null);
  const documents = permit.files.filter((file) => !isPermitPhoto(file));
  const hasPhotos = permit.files.some(isPermitPhoto);
  if (documents.length === 0 && hasPhotos) return null;
  const current = documents.filter((file) => file.is_current);
  const earlier = documents.filter((file) => !file.is_current);
  const tiles = (files: PermitFile[]) => (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {files.map((file) => {
        const ext = extension(file.original_name);
        return (
          <li key={file.id} className="flex min-w-0 items-stretch gap-2 rounded-lg border p-2" data-permit-document>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              title={t("preview")}
              onClick={() => setPreviewing(file)}
            >
              <span
                className={`grid size-12 shrink-0 place-items-center rounded-md text-xs font-bold ${
                  BADGE_TONE[ext] ?? "bg-muted text-muted-foreground"
                }`}
              >
                {ext || <FileText className="size-5" />}
              </span>
              <span className="min-w-0">
                <span className="line-clamp-2 break-all text-sm font-medium">{file.original_name}</span>
                <span className="block truncate text-2xs text-muted-foreground">
                  {size(file.byte_size)} · {file.uploaded_by_name ?? "—"} · {df.dateTime(file.uploaded_at)}
                </span>
              </span>
            </button>
            <div className="flex shrink-0 flex-col justify-center">
              <PermitFileActions permitId={permit.id} file={file} compact />
            </div>
          </li>
        );
      })}
    </ul>
  );
  return (
    <section className="surface-panel space-y-3 rounded-xl p-4" data-slot="permit-file-list">
      <h3 className="panel-title">{t("documents")}</h3>
      {documents.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("noneOnRecord")}</p>
      ) : (
        <>
          {permit.submission > 1 && current.length > 0 && (
            <p className="text-xs font-medium">{t("submission", { round: permit.submission })}</p>
          )}
          {tiles(current)}
          {earlier.length > 0 && (
            <div className="space-y-1.5 border-t pt-3">
              <p className="text-xs text-muted-foreground">{t("earlier")}</p>
              {tiles(earlier)}
            </div>
          )}
        </>
      )}
      {previewing && (
        <FilePreviewDialog
          title={previewing.original_name}
          description={`${previewing.uploaded_by_name ?? "—"} · ${df.dateTime(previewing.uploaded_at)}`}
          load={() => permitFileObjectUrl(permit.id, previewing)}
          previewType={previewing.preview_type}
          filename={previewing.original_name}
          onDownload={() => downloadPermitFile(permit.id, previewing)}
          onClose={() => setPreviewing(null)}
        />
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- apply */

/**
 * 新申请: the project, the form's files, a remark and the safety manager.
 *
 * Kept in the draft (the caller wraps it in `FieldDraft`), so a worker who is
 * called away keeps the pages they photographed.
 */
export function PermitApplyForm({
  initialProject = "",
  onSaved,
  onCancel,
}: {
  initialProject?: string;
  onSaved: (permit: Permit) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("permits");
  const queryClient = useQueryClient();
  const clearDraft = useClearDraft();
  const [project, setProject] = useDraftState("project", initialProject);
  const [approver, setApprover] = useDraftState("approver", "");
  const [note, setNote] = useDraftState("note", "");
  const [files, setFiles] = useDraftState<File[]>("files", []);
  const [error, setError] = useState("");
  const approvers = useQuery({
    queryKey: ["permits", "approvers", project],
    queryFn: () => getPermitApprovers(project),
    enabled: Boolean(project),
  });
  const choices = approvers.data ?? [];
  // A name from another project, or one who can no longer approve, is not a
  // choice: the server would refuse it.
  const chosen = choices.some((person) => person.id === approver) ? approver : "";
  const submit = useMutation({
    mutationFn: () =>
      createPermit({
        project,
        approver: chosen,
        note: note.trim(),
        files,
        client_event_id: crypto.randomUUID(),
      }),
    onSuccess: (permit) => {
      setError("");
      clearDraft();
      void queryClient.invalidateQueries({ queryKey: permitKeys() });
      onSaved(permit);
    },
    onError: (reason) => setError(failure(reason, t("failed"))),
  });

  return (
    <div className="space-y-4" data-slot="permit-apply">
      <p className="rounded-lg border border-info/25 bg-info/5 p-3 text-sm leading-6">{t("newHelp")}</p>
      <FieldWrapper label={t("field.project")} required>
        <ProjectPicker
          value={project}
          onValueChange={(next) => {
            setProject(next);
            setApprover("");
          }}
          placeholder={t("chooseProject")}
          className="w-full"
        />
      </FieldWrapper>
      <FieldWrapper label={t("field.files")} required>
        <PermitFilesInput files={files} onChange={setFiles} />
      </FieldWrapper>
      <FieldWrapper label={t("field.note")} optional={t("optional")}>
        <Textarea
          rows={3}
          value={note}
          placeholder={t("notePlaceholder")}
          onChange={(event) => setNote(event.target.value)}
        />
      </FieldWrapper>
      <FieldWrapper label={t("field.approver")} required>
        <Select value={chosen || undefined} onValueChange={setApprover} disabled={!project}>
          <SelectTrigger className="w-full" aria-label={t("field.approver")}>
            <SelectValue placeholder={t("chooseApprover")} />
          </SelectTrigger>
          <SelectContent>
            {choices.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.role_name ? `${person.full_name} · ${person.role_name}` : person.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1.5 text-xs text-muted-foreground">{t("approverHint")}</p>
        <QueryFailedNote className="mt-2" query={approvers} what={t("what.approvers")} />
        {project && approvers.isSuccess && choices.length === 0 && (
          <p className="mt-2 text-xs text-destructive">{t("noApprovers")}</p>
        )}
      </FieldWrapper>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="outline" className="min-h-11" onClick={onCancel}>
            {t("cancel")}
          </Button>
        )}
        <Button
          className="min-h-11"
          requires={[
            [project, t("field.project")],
            [files.length > 0, t("field.files")],
            [chosen, t("field.approver")],
          ]}
          disabled={submit.isPending}
          onClick={() => submit.mutate()}
        >
          {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {t("submit")}
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- decide */

function DecisionPanel({ permit }: { permit: Permit }) {
  const t = useTranslations("permits");
  const queryClient = useQueryClient();
  const [signature, setSignature] = useState<File | undefined>();
  const [note, setNote] = useState("");
  const [returnArmed, setReturnArmed] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const settle = () => {
    setError("");
    void queryClient.invalidateQueries({ queryKey: permitKeys() });
    void queryClient.invalidateQueries({ queryKey: ["hazard-conversation", permit.id] });
  };
  const approve = useMutation({
    mutationFn: () => approvePermit(permit.id, signature!, note.trim()),
    onSuccess: settle,
    onError: (reasonError) => setError(failure(reasonError, t("failed"))),
  });
  const sendBack = useMutation({
    mutationFn: () => returnPermit(permit.id, reason.trim()),
    onSuccess: () => {
      setReturnArmed(false);
      setReason("");
      settle();
    },
    onError: (reasonError) => setError(failure(reasonError, t("failed"))),
  });
  const busy = approve.isPending || sendBack.isPending;
  return (
    <div className="space-y-3" data-slot="permit-decision">
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t("approveHelp")}</p>
      <FieldWrapper label={t("field.approvalNote")} optional={t("optional")}>
        <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </FieldWrapper>
      <FieldSignaturePad
        label={t("field.signature")}
        clearLabel={t("clearSignature")}
        required
        value={signature}
        onChange={setSignature}
      />
      <Button
        className="min-h-11 w-full"
        requires={[[signature, t("field.signature")]]}
        disabled={busy}
        onClick={() => approve.mutate()}
      >
        {approve.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {t("approve")}
      </Button>
      {/* 退回 behind a switch, not a confirm box (spec rule 8). */}
      <label className="flex items-center gap-2 rounded-md border px-2 py-1.5">
        <Switch
          checked={returnArmed}
          onCheckedChange={(next) => {
            setReturnArmed(next);
            if (!next) setReason("");
          }}
          aria-label={t("armReturn")}
        />
        <span className="text-xs text-muted-foreground">{t("armReturnHelp")}</span>
      </label>
      {returnArmed && (
        <FieldWrapper label={t("field.returnReason")} required>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
          <Button
            className="mt-2 min-h-11 w-full"
            variant="destructive"
            requires={[[reason.trim(), t("field.returnReason")]]}
            disabled={busy}
            onClick={() => sendBack.mutate()}
          >
            {sendBack.isPending ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
            {t("return")}
          </Button>
        </FieldWrapper>
      )}
    </div>
  );
}

function ResubmitPanel({ permit }: { permit: Permit }) {
  const t = useTranslations("permits");
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const send = useMutation({
    mutationFn: () => resubmitPermit(permit.id, files, note.trim()),
    onSuccess: () => {
      setFiles([]);
      setNote("");
      setError("");
      void queryClient.invalidateQueries({ queryKey: permitKeys() });
      void queryClient.invalidateQueries({ queryKey: ["hazard-conversation", permit.id] });
    },
    onError: (reason) => setError(failure(reason, t("failed"))),
  });
  return (
    <div className="space-y-3" data-slot="permit-resubmit">
      <p className="text-sm font-medium">{t("resubmitTitle")}</p>
      <p className="text-xs text-muted-foreground">{t("resubmitHelp")}</p>
      <FieldWrapper label={t("field.files")} required>
        <PermitFilesInput files={files} onChange={setFiles} />
      </FieldWrapper>
      <FieldWrapper label={t("field.note")} optional={t("optional")}>
        <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </FieldWrapper>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
      <Button
        className="min-h-11 w-full"
        requires={[[files.length > 0, t("field.files")]]}
        disabled={send.isPending}
        onClick={() => send.mutate()}
      >
        {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
        {t("resubmit")}
      </Button>
    </div>
  );
}

/** What the reader can do on the permit now, or whose move it is. */
function PermitActions({ permit }: { permit: Permit }) {
  const t = useTranslations("permits");
  const { user } = useAuth();
  const mine = permit.applicant === user?.id;
  if (permit.is_closed) {
    return (
      <p className="flex items-start gap-2 rounded-md border border-success/25 bg-success/5 px-2 py-1.5 text-xs">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        {t("archived")}
      </p>
    );
  }
  if (permit.status === "RECTIFICATION_SUBMITTED") {
    if (permit.can_decide) return <DecisionPanel permit={permit} />;
    const name = permit.approver_name;
    return (
      <p className="rounded-md border border-warning/25 bg-warning/5 px-2 py-1.5 text-xs">
        {name
          ? t(mine ? "ownWaiting" : "waitingFor", { name })
          : t("waitingLegacy")}
      </p>
    );
  }
  // Returned: the applicant answers it on the same record.
  return (
    <div className="space-y-3">
      <p className="rounded-md border border-destructive/25 bg-destructive/5 px-2 py-1.5 text-xs">
        {t("returnedNotice", { reason: permit.review_note || "—" })}
      </p>
      {permit.can_resubmit ? (
        <ResubmitPanel permit={permit} />
      ) : (
        <p className="text-xs text-muted-foreground">{t("waitingApplicant")}</p>
      )}
    </div>
  );
}

/**
 * One permit: its files, what was decided and by whom, the decision buttons
 * and its conversation. The same on the phone (`inline`, inside the phone's
 * own frame) and in the office (the record popup).
 */
export function PermitDetail({
  id,
  presentation,
  onClose,
}: {
  id: string;
  presentation: "dialog" | "inline";
  onClose?: () => void;
}) {
  const t = useTranslations("permits");
  const df = useDateFormat();
  const detail = useQuery({ queryKey: permitKeys(id), queryFn: () => getPermit(id) });
  const permit = detail.data;
  let body: React.ReactNode;
  if (!permit) {
    body = detail.isError ? (
      <LoadFailed what={t("what.detail")} onRetry={() => void detail.refetch()} />
    ) : (
      <div className="grid min-h-32 place-items-center">
        <Loader2 className="size-7 animate-spin text-primary" />
      </div>
    );
  } else {
    const decided = permit.status !== "RECTIFICATION_SUBMITTED" && Boolean(permit.decided_by_name);
    const facts: ShellFact[] = [
      { label: t("field.status"), value: <PermitStatusBadge status={permit.status} /> },
      { label: t("field.project"), value: permit.project_name },
      {
        label: t("field.applicant"),
        value: [permit.applicant_name, permit.applicant_title].filter(Boolean).join(" · ") || "—",
      },
      { label: t("field.appliedAt"), value: df.dateTime(permit.applied_at) },
      { label: t("field.approver"), value: permit.approver_name || t("legacyApprover") },
      ...(decided
        ? [
            {
              label: t(permit.status === "RETURNED" ? "field.returnedBy" : "field.approvedBy"),
              value: [permit.decided_by_name, permit.decided_by_title].filter(Boolean).join(" · "),
            },
            {
              label: t("field.decidedAt"),
              value: permit.decided_at ? df.dateTime(permit.decided_at) : "—",
            },
          ]
        : []),
      { label: t("field.note"), value: permit.note || t("noNote"), wide: true },
      ...(permit.review_note
        ? [
            {
              label: t(permit.status === "RETURNED" ? "field.returnReason" : "field.approvalNote"),
              value: permit.review_note,
              wide: true,
            },
          ]
        : []),
    ];
    const gallery = permitPhotos(permit, (round) => t("files.submission", { round }));
    body = (
      <RecordDetailShell
        reference={permit.incident_no}
        // 记录人 (E8): who applied, with a number to call.
        recorder={<RecordRecorder record={permit} />}
        facts={facts}
        // One record, everything in one place (client 2026-10-10 round 2:
        // 「照片全部要跟收货进场一样，记录也全部要绑定」): the photographed
        // pages in the gallery, the Word / Excel / PDF files as tiles, the
        // decision with its signature, the attachments and the conversation.
        photos={gallery.photos.length > 0 ? gallery.photos : undefined}
        photoGroups={gallery.groups}
        heroFromThumbnail={presentation === "inline"}
        panel={<PermitDocuments permit={permit} />}
        actions={<PermitActions permit={permit} />}
        aside={
          // 附件 (「后台没有附件上传」): the office adds supporting files on the
          // permit's own record ID until the approval archives it; the phone
          // reads and opens them, with nothing to add there.
          <RecordAttachmentsPanel
            kind="HAZARD"
            recordId={permit.id}
            readOnly={presentation === "inline"}
          />
        }
        signatures={
          permit.signature ? [{ label: t("field.signature"), url: permit.signature }] : []
        }
        chat={<HazardConversationPanel incidentId={permit.id} />}
      />
    );
  }
  if (presentation === "inline") return <>{body}</>;
  return (
    <RecordDetailDialog
      title={permit?.incident_no ?? t("title")}
      description={permit ? `${permit.project_name} · ${permit.title}` : undefined}
      status={permit ? <PermitStatusBadge status={permit.status} /> : undefined}
      // 完整证据 PDF (2026-10-10, 审批证据完整性): the permit's details, its
      // form files' content, the safety manager's signed decision and its
      // conversation as one document - archived or not.
      exportRecord={permit ? { kind: "HAZARD", recordId: permit.id, reference: permit.incident_no } : null}
      onClose={onClose ?? (() => undefined)}
    >
      {body}
    </RecordDetailDialog>
  );
}
