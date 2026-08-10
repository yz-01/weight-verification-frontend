"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCog, History, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ConsultantProjectPicker } from "@/components/consultant-workflow/project-scope-picker";
import { FieldWrapper, ListHeader, StatusBadge } from "@/components/shared/page-primitives";
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
  ApplicationTemplate,
  ApplicationTemplateVersion,
} from "@/interfaces/consultant-workflow";
import {
  createApplicationTemplate,
  createApplicationTemplateVersion,
  getApplicationOptions,
  getApplicationTemplates,
} from "@/services/consultant-workflow.service";

type FieldDefinition = ApplicationTemplateVersion["field_schema"][number];

const EMPTY_FIELDS: FieldDefinition[] = [];

export function ApplicationTemplateWorkspace() {
  const t = useTranslations("consultantWorkflow.templateManager");
  const qc = useQueryClient();
  const [project, setProject] = useState("");
  const [creating, setCreating] = useState(false);
  const [versioning, setVersioning] = useState<ApplicationTemplate | null>(null);
  const templates = useQuery({
    queryKey: ["consultant-templates", project],
    queryFn: () => getApplicationTemplates({ project, active: "false", page_size: 200 }),
    enabled: Boolean(project),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["consultant-templates", project] });

  return (
    <div className="space-y-5">
      <ListHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <Button disabled={!project} onClick={() => setCreating(true)}>
            <Plus />{t("new")}
          </Button>
        }
      />
      <div className="max-w-md">
        <ConsultantProjectPicker value={project} onChange={setProject} />
      </div>
      {!project ? (
        <State text={t("chooseProject")} />
      ) : templates.isLoading ? (
        <State icon={<Loader2 className="animate-spin" />} text={t("loading")} />
      ) : templates.isError ? (
        <State text={t("loadError")} />
      ) : !templates.data?.count ? (
        <State text={t("empty")} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {templates.data.results.map((template) => {
            const current = template.versions.find(
              (version) => version.version === template.current_version,
            );
            return (
              <article key={template.id} className="rounded-lg border bg-card p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <FileCog className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{template.name}</h2>
                      <StatusBadge
                        label={template.is_active ? t("active") : t("inactive")}
                        tone={template.is_active ? "positive" : "neutral"}
                      />
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{template.code}</p>
                  </div>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold">
                    v{template.current_version}
                  </span>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  {template.description || t("noDescription")}
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <Info label={t("applicationType")} value={template.application_type_label || t("allTypes")} />
                  <Info label={t("numbering")} value={template.numbering_pattern} mono />
                  <Info
                    label={t("requiredFiles")}
                    value={current?.required_attachment_codes.join(", ") || t("none")}
                  />
                  <Info
                    label={t("customFields")}
                    value={String(current?.field_schema.length ?? 0)}
                  />
                </dl>
                <Button className="mt-4 w-full" variant="outline" onClick={() => setVersioning(template)}>
                  <History />{t("newVersion")}
                </Button>
              </article>
            );
          })}
        </div>
      )}

      {creating ? (
        <TemplateDialog
          project={project}
          onClose={() => setCreating(false)}
          onSaved={() => {
            void refresh();
            setCreating(false);
          }}
        />
      ) : null}
      {versioning ? (
        <VersionDialog
          template={versioning}
          onClose={() => setVersioning(null)}
          onSaved={() => {
            void refresh();
            setVersioning(null);
          }}
        />
      ) : null}
    </div>
  );
}

function TemplateDialog({ project, onClose, onSaved }: { project: string; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("consultantWorkflow.templateManager");
  const options = useQuery({
    queryKey: ["consultant-options", project, "APPLICATION_TYPE"],
    queryFn: () => getApplicationOptions(project, "APPLICATION_TYPE"),
  });
  const attachments = useQuery({
    queryKey: ["consultant-options", project, "ATTACHMENT_TYPE"],
    queryFn: () => getApplicationOptions(project, "ATTACHMENT_TYPE"),
  });
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [pattern, setPattern] = useState("{project}-{discipline}-{type}-{sequence}");
  const [required, setRequired] = useState<string[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>(EMPTY_FIELDS);
  const [layout, setLayout] = useState("RFI FORM");
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () => createApplicationTemplate({
      project,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description.trim(),
      application_type: type,
      numbering_pattern: pattern,
      field_schema: cleanFields(fields),
      required_attachment_codes: required,
      report_mapping: { layout },
      change_note: note.trim(),
      is_active: true,
    }),
    onSuccess: onSaved,
  });
  const error = save.error instanceof ApiError ? save.error.message : "";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("code")} required><Input value={code} onChange={(event) => setCode(event.target.value)} /></FieldWrapper>
          <FieldWrapper label={t("name")} required><Input value={name} onChange={(event) => setName(event.target.value)} /></FieldWrapper>
          <FieldWrapper label={t("applicationType")}><Select value={type || "ALL"} onValueChange={(value) => setType(value === "ALL" ? null : value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t("allTypes")}</SelectItem>{(options.data?.results ?? []).map((row) => <SelectItem key={row.id} value={row.id}>{row.label}</SelectItem>)}</SelectContent></Select></FieldWrapper>
          <FieldWrapper label={t("reportLayout")}><Input value={layout} onChange={(event) => setLayout(event.target.value)} /></FieldWrapper>
          <FieldWrapper label={t("description")} className="sm:col-span-2"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></FieldWrapper>
          <FieldWrapper label={t("numbering")} required hint={t("numberingHelp")} className="sm:col-span-2"><Input value={pattern} onChange={(event) => setPattern(event.target.value)} /></FieldWrapper>
        </div>
        <OptionChecks
          title={t("requiredFiles")}
          options={(attachments.data?.results ?? []).map((row) => ({ code: row.code, label: row.label }))}
          selected={required}
          onChange={setRequired}
        />
        <CustomFields fields={fields} onChange={setFields} />
        <FieldWrapper label={t("changeNote")} required><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></FieldWrapper>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={!code.trim() || !name.trim() || !pattern.includes("{sequence}") || !note.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Save />}{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VersionDialog({ template, onClose, onSaved }: { template: ApplicationTemplate; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("consultantWorkflow.templateManager");
  const latest = useMemo(
    () => template.versions.find((item) => item.version === template.current_version),
    [template],
  );
  const attachments = useQuery({
    queryKey: ["consultant-options", template.project, "ATTACHMENT_TYPE"],
    queryFn: () => getApplicationOptions(template.project, "ATTACHMENT_TYPE"),
  });
  const [required, setRequired] = useState<string[]>(latest?.required_attachment_codes ?? []);
  const [fields, setFields] = useState<FieldDefinition[]>(latest?.field_schema ?? []);
  const [layout, setLayout] = useState(latest?.report_mapping.layout ?? "RFI FORM");
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () => createApplicationTemplateVersion(template.id, {
      field_schema: cleanFields(fields),
      required_attachment_codes: required,
      report_mapping: { layout },
      change_note: note.trim(),
    }),
    onSuccess: onSaved,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("versionTitle", { name: template.name, version: template.current_version + 1 })}</DialogTitle>
          <DialogDescription>{t("versionHelp")}</DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("reportLayout")}><Input value={layout} onChange={(event) => setLayout(event.target.value)} /></FieldWrapper>
        <OptionChecks title={t("requiredFiles")} options={(attachments.data?.results ?? []).map((row) => ({ code: row.code, label: row.label }))} selected={required} onChange={setRequired} />
        <CustomFields fields={fields} onChange={setFields} />
        <FieldWrapper label={t("changeNote")} required><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></FieldWrapper>
        <DialogFooter><Button variant="outline" onClick={onClose}>{t("cancel")}</Button><Button disabled={!note.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Save />}{t("saveVersion")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OptionChecks({ title, options, selected, onChange }: { title: string; options: Array<{ code: string; label: string }>; selected: string[]; onChange: (next: string[]) => void }) {
  return <section className="space-y-2"><h3 className="text-sm font-semibold">{title}</h3><div className="grid gap-2 sm:grid-cols-2">{options.map((option) => <label key={option.code} className="flex items-center gap-3 rounded-lg border p-3 text-sm"><Checkbox checked={selected.includes(option.code)} onCheckedChange={(checked) => onChange(checked ? [...selected, option.code] : selected.filter((item) => item !== option.code))} /><span>{option.label}</span></label>)}</div></section>;
}

function CustomFields({ fields, onChange }: { fields: FieldDefinition[]; onChange: (next: FieldDefinition[]) => void }) {
  const t = useTranslations("consultantWorkflow.templateManager");
  return <section className="space-y-3"><div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">{t("customFields")}</h3><p className="text-xs text-muted-foreground">{t("customFieldsHelp")}</p></div><Button type="button" size="sm" variant="outline" onClick={() => onChange([...fields, { key: "", label: "", required: false, type: "text" }])}><Plus />{t("addField")}</Button></div>{fields.map((field, index) => <div key={`${index}-${field.key}`} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto_auto]"><Input value={field.label} placeholder={t("fieldLabel")} onChange={(event) => updateField(fields, index, { label: event.target.value }, onChange)} /><Input value={field.key} placeholder={t("fieldKey")} onChange={(event) => updateField(fields, index, { key: event.target.value.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() }, onChange)} /><label className="flex items-center gap-2 text-sm"><Checkbox checked={Boolean(field.required)} onCheckedChange={(checked) => updateField(fields, index, { required: Boolean(checked) }, onChange)} />{t("required")}</label><Button type="button" size="icon" variant="ghost" title={t("removeField")} onClick={() => onChange(fields.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></Button></div>)}</section>;
}

function updateField(fields: FieldDefinition[], index: number, patch: Partial<FieldDefinition>, onChange: (next: FieldDefinition[]) => void) {
  onChange(fields.map((field, itemIndex) => itemIndex === index ? { ...field, ...patch } : field));
}

function cleanFields(fields: FieldDefinition[]) {
  return fields.filter((field) => field.key.trim() && field.label.trim());
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 rounded-md bg-muted/40 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className={`mt-1 break-words font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</dd></div>;
}

function State({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return <div className="grid min-h-52 place-items-center rounded-lg border border-dashed bg-muted/10 text-center text-sm text-muted-foreground"><div>{icon}<p className="mt-2">{text}</p></div></div>;
}
