"use client";

/**
 * B. 顾问自有表格 - the consultant's own form (client, 2026-10-10).
 *
 * 「现有 RFI 表格模板不需要另外开新模块，直接增加两种表格来源」: A, the form
 * MSE Trace draws (unchanged, the default), and B, the consultant's own PDF /
 * Word / Excel form. Everything B needs lives in this one file and is drawn
 * inside the screens that already exist:
 *
 * - `ConsultantOwnFormsSection` - the B list in 「RFI 表格模板」: upload,
 *   bind to a project (or every project) / consultant firm / application
 *   type, new versions, switch off;
 * - `ConsultantFormSourceField` - 「表格来源」 on the application form, shown
 *   only when the chosen consultant has a form for this project and type;
 * - `ApplicationConsultantFormPanel` - on the application: the blank form to
 *   download, the filled form to upload (required before sending), the
 *   consultant's signed final version - each previewed in the page;
 * - `signingChoices` / `signingNeeds` - what the decision dialog asks for.
 *
 * The form's own pages are never re-headed: the backend appends them to the
 * complete evidence PDF as they are (「必须保留原来的公司表头和格式」).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Eye,
  FilePlus2,
  FileSignature,
  History,
  Loader2,
  Pencil,
  Save,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { LockedNote } from "@/components/consultant-workflow/application-draft-edit";
import { FilePreviewDialog } from "@/components/shared/file-preview";
import {
  FieldWrapper,
  LoadFailed,
  QueryFailedNote,
  StatusBadge,
} from "@/components/shared/page-primitives";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type {
  ApplicationFormFile,
  ConsultantApplication,
  ConsultantFormTemplate,
  ConsultantFormTemplateVersion,
} from "@/interfaces/consultant-workflow";
import { useDateFormat } from "@/lib/dates";
import {
  addConsultantFormVersion,
  applicationFormFileObjectUrl,
  consultantFormObjectUrl,
  createConsultantForm,
  downloadApplicationFormFile,
  downloadConsultantForm,
  getApplicationOptions,
  getConsultantFormChoices,
  getConsultantFormOrganizations,
  getConsultantForms,
  updateConsultantForm,
  uploadApplicationFormFile,
  type ApplicationFormFileRef,
} from "@/services/consultant-workflow.service";

/** What a consultant's form may be: the same list the server accepts. */
export const FORM_FILE_SUFFIXES = [".pdf", ".docx", ".doc", ".xlsx", ".xls", ".jpg", ".jpeg", ".png"] as const;
export const FORM_FILE_ACCEPT = FORM_FILE_SUFFIXES.join(",");

export function isFormFile(name: string): boolean {
  const lower = name.toLowerCase();
  return FORM_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

export type Signing = "ESIGNATURE" | "SIGNED_FORM";

/**
 * How the consultant may sign a decision. The standard form is signed only
 * with the e-signature, as before. The consultant's own form may also be
 * signed by hand and uploaded - the only way for someone with no e-signature.
 */
export function signingChoices(hasOwnForm: boolean, hasCredential: boolean): Signing[] {
  if (!hasOwnForm) return ["ESIGNATURE"];
  return hasCredential ? ["ESIGNATURE", "SIGNED_FORM"] : ["SIGNED_FORM"];
}

/** What the decision dialog must have before it can send, as the server checks it. */
export function signingNeeds(signing: Signing, hasCredential: boolean): { pin: boolean; file: boolean } {
  return {
    // The e-signature is applied on the PIN; a signed form is confirmed with
    // it whenever the consultant has one set up.
    pin: signing === "ESIGNATURE" || hasCredential,
    file: signing === "SIGNED_FORM",
  };
}

const STANDARD = "STANDARD";

// ---------------------------------------------------------------------------
// 「RFI 表格模板」: the B list
// ---------------------------------------------------------------------------

type Preview = { title: string; filename: string; previewType: string | null; load: () => Promise<string>; save: () => Promise<void> };

export function ConsultantOwnFormsSection({ project, canConfigure }: { project: string; canConfigure: boolean }) {
  const t = useTranslations("consultantWorkflow.ownForm");
  const df = useDateFormat();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ConsultantFormTemplate | null>(null);
  const [versioning, setVersioning] = useState<ConsultantFormTemplate | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const forms = useQuery({
    queryKey: ["consultant-own-forms", project],
    queryFn: () => getConsultantForms({ project, active: "false", page_size: 200 }),
    enabled: Boolean(project),
  });
  const types = useQuery({
    queryKey: ["consultant-options", project, "APPLICATION_TYPE"],
    queryFn: () => getApplicationOptions(project, "APPLICATION_TYPE"),
    enabled: Boolean(project),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["consultant-own-forms", project] });
  const typeLabel = (code: string) =>
    code ? (types.data?.results.find((row) => row.code === code)?.label ?? code) : t("allTypes");
  const show = (form: ConsultantFormTemplate, version: ConsultantFormTemplateVersion) =>
    setPreview({
      title: `${form.name} · v${version.version}`,
      filename: version.original_name,
      previewType: version.preview_type,
      load: () => consultantFormObjectUrl(form.id, version.id),
      save: () => downloadConsultantForm(form.id, version.id, version.original_name),
    });

  return (
    <section className="space-y-3" data-testid="consultant-own-forms">
      <h2 className="panel-title">{t("sectionConsultant")}</h2>
      <QueryFailedNote query={types} what={t("applicationType")} />
      {forms.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("loading")}</p>
      ) : forms.isError ? (
        <LoadFailed what={t("sectionConsultant")} onRetry={() => forms.refetch()} />
      ) : !forms.data?.count ? (
        <p className="rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground">{t("emptyConsultant")}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {forms.data.results.map((form) => {
            const current = form.versions.find((version) => version.version === form.current_version);
            const older = form.versions.filter((version) => version.version !== form.current_version);
            return (
              <article key={form.id} className="surface-panel rounded-xl p-4 sm:p-6" data-form-source="CONSULTANT">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <FileSignature className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words font-semibold">{form.name}</h3>
                      <StatusBadge label={form.is_active ? t("active") : t("inactive")} tone={form.is_active ? "positive" : "neutral"} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{t("sourceConsultant")}</p>
                  </div>
                  <span className="rounded-lg bg-muted px-2 py-1 text-xs font-semibold">v{form.current_version}</span>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">{form.description || t("noDescription")}</p>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <Info label={t("consultant")} value={form.consultant_organization_name} />
                  <Info label={t("project")} value={form.project_name ?? t("allProjects")} />
                  <Info label={t("applicationType")} value={typeLabel(form.application_type_code)} />
                  <Info label={t("file")} value={current?.original_name ?? "-"} />
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">{t("usedBy", { count: form.application_count })}</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {current ? (
                    <Button variant="outline" onClick={() => show(form, current)}><Eye />{t("preview")}</Button>
                  ) : null}
                  {canConfigure ? (
                    <>
                      <Button variant="outline" onClick={() => setEditing(form)}><Pencil />{t("editDetails")}</Button>
                      <Button variant="outline" onClick={() => setVersioning(form)}><History />{t("newVersion")}</Button>
                    </>
                  ) : null}
                </div>
                {older.length ? (
                  <details className="mt-3 rounded-lg border bg-muted/20 px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium">{t("versionHistory", { count: older.length })}</summary>
                    <ul className="mt-2 space-y-2">
                      {older.map((version) => (
                        <li key={version.id} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold">v{version.version}</span>
                          <span className="min-w-0 flex-1 break-all">{version.original_name}</span>
                          <span className="text-muted-foreground">{df.dateTime(version.created_at)}</span>
                          <Button size="sm" variant="ghost" onClick={() => show(form, version)}><Eye />{t("preview")}</Button>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {editing ? (
        <ConsultantFormEditDialog
          form={editing}
          project={project}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void refresh();
            setEditing(null);
          }}
        />
      ) : null}
      {versioning ? (
        <ConsultantFormVersionDialog
          form={versioning}
          onClose={() => setVersioning(null)}
          onSaved={() => {
            void refresh();
            setVersioning(null);
          }}
        />
      ) : null}
      {preview ? (
        <FilePreviewDialog
          title={preview.title}
          onClose={() => setPreview(null)}
          load={preview.load}
          previewType={preview.previewType}
          filename={preview.filename}
          onDownload={preview.save}
        />
      ) : null}
    </section>
  );
}

/** A form file chosen in a dialog, checked against the list the server accepts. */
function useFormFile() {
  const [file, setFile] = useState<File | null>(null);
  const [wrongType, setWrongType] = useState(false);
  const choose = (next: File | null) => {
    setWrongType(Boolean(next) && !isFormFile(next?.name ?? ""));
    setFile(next && isFormFile(next.name) ? next : null);
  };
  return { file, wrongType, choose };
}

/** The two scopes a form may be bound to from this page: every project, or this one. */
function ProjectScopeSelect({ project, value, onChange }: { project: string; value: string | null; onChange: (value: string | null) => void }) {
  const t = useTranslations("consultantWorkflow.ownForm");
  return (
    <Select value={value ?? "ALL"} onValueChange={(next) => onChange(next === "ALL" ? null : next)}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">{t("allProjects")}</SelectItem>
        <SelectItem value={project}>{t("onlyThisProject")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function TypeSelect({ project, value, onChange }: { project: string; value: string; onChange: (value: string) => void }) {
  const t = useTranslations("consultantWorkflow.ownForm");
  const types = useQuery({
    queryKey: ["consultant-options", project, "APPLICATION_TYPE"],
    queryFn: () => getApplicationOptions(project, "APPLICATION_TYPE"),
    enabled: Boolean(project),
  });
  const known = (types.data?.results ?? []).some((row) => row.code === value);
  return (
    <>
      <Select value={value || "ALL"} onValueChange={(next) => onChange(next === "ALL" ? "" : next)}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">{t("allTypes")}</SelectItem>
          {value && !known ? <SelectItem value={value}>{value}</SelectItem> : null}
          {(types.data?.results ?? []).map((row) => <SelectItem key={row.id} value={row.code}>{row.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <QueryFailedNote query={types} what={t("applicationType")} />
    </>
  );
}

function FirmSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations("consultantWorkflow");
  const firms = useQuery({ queryKey: ["consultant-form-firms"], queryFn: getConsultantFormOrganizations });
  return (
    <>
      <Select value={value || undefined} onValueChange={onChange} disabled={firms.isLoading}>
        <SelectTrigger className="w-full"><SelectValue placeholder={t("ownForm.chooseConsultant")} /></SelectTrigger>
        <SelectContent>
          {(firms.data ?? []).map((firm) => <SelectItem key={firm.id} value={firm.id}>{firm.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <QueryFailedNote query={firms} what={t("what.consultantFirms")} />
      {firms.data && !firms.data.length ? <p className="text-xs text-warning">{t("ownForm.noFirms")}</p> : null}
    </>
  );
}

export function ConsultantFormCreateDialog({ project, onClose, onSaved }: { project: string; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("consultantWorkflow.ownForm");
  const [name, setName] = useState("");
  const [firm, setFirm] = useState("");
  const [scope, setScope] = useState<string | null>(null);
  const [typeCode, setTypeCode] = useState("RFI");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const upload = useFormFile();
  const save = useMutation({
    mutationFn: () =>
      createConsultantForm({
        name: name.trim(),
        project: scope,
        consultant_organization: firm,
        application_type_code: typeCode,
        description: description.trim(),
        change_note: note.trim(),
        file: upload.file as File,
      }),
    onSuccess: onSaved,
  });
  const error = save.error instanceof ApiError ? save.error.message : "";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("name")} required className="sm:col-span-2">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("consultant")} required>
            <FirmSelect value={firm} onChange={setFirm} />
          </FieldWrapper>
          <FieldWrapper label={t("project")}>
            <ProjectScopeSelect project={project} value={scope} onChange={setScope} />
          </FieldWrapper>
          <FieldWrapper label={t("applicationType")}>
            <TypeSelect project={project} value={typeCode} onChange={setTypeCode} />
          </FieldWrapper>
          <FieldWrapper label={t("file")} required hint={t("fileHint")} error={upload.wrongType ? t("fileTypeWrong") : undefined}>
            <Input type="file" accept={FORM_FILE_ACCEPT} onChange={(event) => upload.choose(event.target.files?.[0] ?? null)} />
          </FieldWrapper>
          <FieldWrapper label={t("description")} className="sm:col-span-2">
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("changeNote")} className="sm:col-span-2">
            <Input value={note} onChange={(event) => setNote(event.target.value)} />
          </FieldWrapper>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button
            requires={[[name.trim(), t("name")], [firm, t("consultant")], [upload.file, t("file")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConsultantFormEditDialog({ form, project, onClose, onSaved }: { form: ConsultantFormTemplate; project: string; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("consultantWorkflow.ownForm");
  const [name, setName] = useState(form.name);
  const [firm, setFirm] = useState(form.consultant_organization);
  // A form bound to another project than the page's stays bound to it
  // unless this page's project or 「every project」 is chosen.
  const [scope, setScope] = useState<string | null>(form.project);
  const [typeCode, setTypeCode] = useState(form.application_type_code);
  const [description, setDescription] = useState(form.description);
  const [isActive, setIsActive] = useState(form.is_active);
  const save = useMutation({
    mutationFn: () =>
      updateConsultantForm(form.id, {
        name: name.trim(),
        consultant_organization: firm,
        project: scope,
        application_type_code: typeCode,
        description: description.trim(),
        is_active: isActive,
      }),
    onSuccess: onSaved,
  });
  const error = save.error instanceof ApiError ? save.error.message : "";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("editTitle", { name: form.name })}</DialogTitle>
          <DialogDescription>{t("editHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("name")} required className="sm:col-span-2">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("consultant")} required>
            <FirmSelect value={firm} onChange={setFirm} />
          </FieldWrapper>
          <FieldWrapper label={t("project")}>
            {scope && scope !== project ? (
              <p className="rounded-lg border bg-muted/30 p-3 text-sm">{form.project_name}</p>
            ) : (
              <ProjectScopeSelect project={project} value={scope} onChange={setScope} />
            )}
          </FieldWrapper>
          <FieldWrapper label={t("applicationType")}>
            <TypeSelect project={project} value={typeCode} onChange={setTypeCode} />
          </FieldWrapper>
          <FieldWrapper label={t("description")} className="sm:col-span-2">
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </FieldWrapper>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <span>
            <span className="block font-medium">{t("stillOffered")}</span>
            <span className="text-xs text-muted-foreground">{t("stillOfferedHelp")}</span>
          </span>
          <Checkbox checked={isActive} onCheckedChange={(checked) => setIsActive(Boolean(checked))} />
        </label>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button requires={[[name.trim(), t("name")], [firm, t("consultant")]]} disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConsultantFormVersionDialog({ form, onClose, onSaved }: { form: ConsultantFormTemplate; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("consultantWorkflow.ownForm");
  const [note, setNote] = useState("");
  const upload = useFormFile();
  const save = useMutation({
    mutationFn: () => addConsultantFormVersion(form.id, upload.file as File, note.trim()),
    onSuccess: onSaved,
  });
  const error = save.error instanceof ApiError ? save.error.message : "";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("versionTitle", { name: form.name, version: form.current_version + 1 })}</DialogTitle>
          <DialogDescription>{t("versionHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={t("file")} required hint={t("fileHint")} error={upload.wrongType ? t("fileTypeWrong") : undefined}>
            <Input type="file" accept={FORM_FILE_ACCEPT} onChange={(event) => upload.choose(event.target.files?.[0] ?? null)} />
          </FieldWrapper>
          <FieldWrapper label={t("changeNote")} required>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </FieldWrapper>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button requires={[[upload.file, t("file")], [note.trim(), t("changeNote")]]} disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
            {t("saveVersion")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 「新增模板」 asks first which of the two sources: A opens the standard
 * template dialog exactly as before, B the consultant form dialog.
 */
export function TemplateSourceChooser({ onChoose, onClose }: { onChoose: (source: "STANDARD" | "CONSULTANT") => void; onClose: () => void }) {
  const t = useTranslations("consultantWorkflow.ownForm");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("chooseSourceTitle")}</DialogTitle>
          <DialogDescription>{t("chooseSourceHelp")}</DialogDescription>
        </DialogHeader>
        <TemplateSourceOptions onChoose={onChoose} />
      </DialogContent>
    </Dialog>
  );
}

/** The two sources, each a card to press. */
export function TemplateSourceOptions({ onChoose }: { onChoose: (source: "STANDARD" | "CONSULTANT") => void }) {
  const t = useTranslations("consultantWorkflow.ownForm");
  return (
    <div className="grid gap-3">
      {(["STANDARD", "CONSULTANT"] as const).map((source) => (
        <button
          key={source}
          type="button"
          className="flex items-start gap-3 rounded-xl border p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
          onClick={() => onChoose(source)}
          data-template-source={source}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            {source === "STANDARD" ? <FilePlus2 className="size-5" /> : <FileSignature className="size-5" />}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">{t(source === "STANDARD" ? "sourceStandard" : "sourceConsultant")}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{t(source === "STANDARD" ? "sourceStandardHelp" : "sourceConsultantHelp")}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The application form: 「表格来源」
// ---------------------------------------------------------------------------

/**
 * Offered only when the chosen consultant has their own form for this
 * project and type; otherwise nothing is drawn and the application is on
 * the standard form, exactly as before.
 */
export function ConsultantFormSourceField({
  project,
  consultantOrganization,
  applicationType,
  value,
  kept,
  onChange,
}: {
  project: string;
  consultantOrganization: string;
  applicationType: string;
  value: string | null;
  /** The draft's own choice, shown even if the form is no longer offered. */
  kept?: { version_id: string; name: string; version: number } | null;
  onChange: (value: string | null) => void;
}) {
  const t = useTranslations("consultantWorkflow");
  const [preview, setPreview] = useState<Preview | null>(null);
  const ready = Boolean(project && consultantOrganization && applicationType);
  const choices = useQuery({
    queryKey: ["consultant-form-choices", project, consultantOrganization, applicationType],
    queryFn: () =>
      getConsultantFormChoices({
        project,
        consultant_organization: consultantOrganization,
        application_type: applicationType,
      }),
    enabled: ready,
  });
  const rows = choices.data ?? [];
  const keptRow = kept && value === kept.version_id && !rows.some((row) => row.version_id === kept.version_id) ? kept : null;
  if (!ready) return null;
  if (choices.isError) return <QueryFailedNote query={choices} what={t("what.consultantForms")} className="sm:col-span-2" />;
  if (!rows.length && !keptRow) return null;
  const chosen = rows.find((row) => row.version_id === value);
  return (
    <FieldWrapper label={t("ownForm.formSource")} hint={t("ownForm.formSourceHelp")} className="sm:col-span-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center" data-testid="consultant-form-source">
        <Select value={value ?? STANDARD} onValueChange={(next) => onChange(next === STANDARD ? null : next)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={STANDARD}>{t("ownForm.useStandard")}</SelectItem>
            {keptRow ? (
              <SelectItem value={keptRow.version_id}>{t("ownForm.useConsultant", { name: keptRow.name, version: keptRow.version })}</SelectItem>
            ) : null}
            {rows.map((row) => (
              <SelectItem key={row.version_id} value={row.version_id}>
                {t("ownForm.useConsultant", { name: row.name, version: row.version })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {chosen ? (
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() =>
              setPreview({
                title: chosen.name,
                filename: chosen.original_name,
                previewType: chosen.preview_type,
                load: () => consultantFormObjectUrl(chosen.form_id, chosen.version_id),
                save: () => downloadConsultantForm(chosen.form_id, chosen.version_id, chosen.original_name),
              })
            }
          >
            <Eye />{t("ownForm.blankForm")}
          </Button>
        ) : null}
      </div>
      {preview ? (
        <FilePreviewDialog
          title={preview.title}
          onClose={() => setPreview(null)}
          load={preview.load}
          previewType={preview.previewType}
          filename={preview.filename}
          onDownload={preview.save}
        />
      ) : null}
    </FieldWrapper>
  );
}

// ---------------------------------------------------------------------------
// The application: blank form, filled form, signed final version
// ---------------------------------------------------------------------------

export function ApplicationConsultantFormPanel({
  application,
  editable,
  reviewer,
  locked,
  onChanged,
}: {
  application: ConsultantApplication;
  /** A draft the reader may fill in: the filled form can be uploaded. */
  editable: boolean;
  /** The reader decides it: the help says how to sign. */
  reviewer: boolean;
  /** Submitted, and the reader is the applicant's side: say why nothing changes. */
  locked?: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("consultantWorkflow");
  const df = useDateFormat();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [wrongType, setWrongType] = useState(false);
  const upload = useMutation({
    mutationFn: (file: File) => uploadApplicationFormFile(application.id, file),
    onSuccess: onChanged,
  });
  const form = application.consultant_form;
  if (!form) return null;
  const files = application.form_files ?? [];
  const filled = files.find((row) => row.kind === "FILLED") ?? null;
  const signed = files.filter((row) => row.kind === "SIGNED");
  const open = (title: string, ref: ApplicationFormFileRef, filename: string, previewType: string | null) =>
    setPreview({
      title,
      filename,
      previewType,
      load: () => applicationFormFileObjectUrl(application.id, ref),
      save: () => downloadApplicationFormFile(application.id, ref, filename),
    });
  const fileRow = (row: ApplicationFormFile, label: string) => (
    <FormFileRow
      key={row.id}
      label={label}
      name={row.original_name}
      detail={t("ownForm.uploadedBy", { name: row.uploaded_by_name ?? "-", when: df.dateTime(row.created_at) })}
      onPreview={() => open(label, { file: row.id }, row.original_name, row.preview_type)}
      onDownload={() => downloadApplicationFormFile(application.id, { file: row.id }, row.original_name)}
    />
  );

  return (
    <section className="surface-panel space-y-3 rounded-xl p-4" data-testid="application-consultant-form">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold">{t("ownForm.panelTitle")} · {form.name}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {reviewer ? t("ownForm.panelHelpReviewer") : t("ownForm.panelHelpApplicant")}
          </p>
        </div>
        {locked ? <LockedNote /> : null}
      </div>
      <div className="divide-y rounded-lg border">
        <FormFileRow
          label={`${t("ownForm.blankForm")} (v${form.version})`}
          name={form.original_name}
          detail={form.newer_version ? t("ownForm.newerVersion", { version: form.newer_version }) : ""}
          onPreview={() => open(t("ownForm.blankForm"), { blank: true }, form.original_name, form.preview_type)}
          onDownload={() => downloadApplicationFormFile(application.id, { blank: true }, form.original_name)}
        />
        {filled ? (
          fileRow(filled, t("ownForm.filledForm"))
        ) : (
          <div className="flex flex-wrap items-center gap-2 p-3 text-sm">
            <span className="font-medium">{t("ownForm.filledForm")}</span>
            <span className="text-warning">{t("ownForm.filledMissing")}</span>
          </div>
        )}
        {signed.map((row) => fileRow(row, t("ownForm.signedForms")))}
      </div>
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept={FORM_FILE_ACCEPT}
            className="sr-only"
            aria-label={t("ownForm.uploadFilled")}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (!isFormFile(file.name)) {
                setWrongType(true);
                return;
              }
              setWrongType(false);
              upload.mutate(file);
            }}
          />
          <Button size="sm" variant={filled ? "outline" : "default"} disabled={upload.isPending} onClick={() => input.current?.click()}>
            {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
            {filled ? t("ownForm.replaceFilled") : t("ownForm.uploadFilled")}
          </Button>
          {wrongType ? <p role="alert" className="text-sm text-destructive">{t("ownForm.fileTypeWrong")}</p> : null}
        </div>
      ) : null}
      {preview ? (
        <FilePreviewDialog
          title={preview.title}
          onClose={() => setPreview(null)}
          load={preview.load}
          previewType={preview.previewType}
          filename={preview.filename}
          onDownload={preview.save}
        />
      ) : null}
    </section>
  );
}

function FormFileRow({ label, name, detail, onPreview, onDownload }: { label: string; name: string; detail: string; onPreview: () => void; onDownload: () => Promise<void> }) {
  const t = useTranslations("consultantWorkflow.ownForm");
  const save = useMutation({ mutationFn: onDownload });
  return (
    <div className="flex flex-wrap items-center gap-3 p-3" data-form-file={label}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
        <p className="break-all text-sm font-medium">{name}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="ghost" onClick={onPreview}><Eye />{t("preview")}</Button>
        <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Download />}
          {t("download")}
        </Button>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/30 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}
