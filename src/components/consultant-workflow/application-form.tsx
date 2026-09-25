"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardPen, Images, Loader2, MapPin, Plus, Save } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ConsultantProjectPicker } from "@/components/consultant-workflow/project-scope-picker";
import { useAuth } from "@/components/providers/auth-provider";
import { useFormSurface } from "@/components/shared/form-surface";
import {
  DetailHeader,
  FieldWrapper,
  QueryFailedNote,
  SectionHeader,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
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
  ConsultantApplication,
  ConsultantApplicationPayload,
  ProjectApplicationOption,
  ProjectOptionCategory,
} from "@/interfaces/consultant-workflow";
import {
  createApplicationOption,
  createConsultantApplication,
  getApplicationOptions,
  getApplicationTemplates,
  getConsultantApplication,
  getConsultantGrants,
  getConsultantWorkflows,
  updateConsultantApplication,
} from "@/services/consultant-workflow.service";
import { getFieldTask } from "@/services/contractor-ops.service";
import { getScheduleTasks } from "@/services/schedule-planning.service";

const emptyForm: ConsultantApplicationPayload = {
  project: "",
  workflow: "",
  template_version: null,
  schedule_task: null,
  source_field_task: null,
  application_type: "",
  discipline: "",
  work_type: "",
  additional_disciplines: [],
  additional_work_types: [],
  priority: "",
  consultant_organization: "",
  consultant: "",
  location: "",
  component: "",
  description: "",
  remarks: "",
  required_at: null,
  inspection_start_at: null,
  inspection_end_at: null,
  drawing_no: "",
  drawing_revision: "",
  itp_no: "",
  checklist_reference: "",
  inspection_category: "",
  custom_fields: {},
};

const BUILT_IN_CUSTOM_FIELD_KEYS = new Set([
  "inspection_activity",
  "acceptance_requirement",
]);

function payloadFromApplication(
  row: ConsultantApplication,
): ConsultantApplicationPayload {
  return {
    project: row.project,
    workflow: row.workflow ?? "",
    template_version: row.template_version,
    schedule_task: row.schedule_task,
    source_field_task: row.source_field_task,
    application_type: row.application_type,
    application_type_custom: row.application_type_custom,
    discipline: row.discipline,
    discipline_custom: row.discipline_custom,
    additional_disciplines: row.additional_disciplines,
    work_type: row.work_type,
    work_type_custom: row.work_type_custom,
    additional_work_types: row.additional_work_types,
    priority: row.priority,
    priority_custom: row.priority_custom,
    consultant_organization: row.consultant_organization,
    consultant: row.consultant,
    location: row.location,
    component: row.component,
    description: row.description,
    remarks: row.remarks,
    required_at: row.required_at,
    inspection_start_at: row.inspection_start_at,
    inspection_end_at: row.inspection_end_at,
    drawing_no: row.drawing_no,
    drawing_revision: row.drawing_revision,
    itp_no: row.itp_no,
    checklist_reference: row.checklist_reference,
    inspection_category: row.inspection_category,
    custom_fields: row.custom_fields,
  };
}

export function ConsultantApplicationForm({
  id,
  sourceFieldTaskId = "",
}: {
  id?: string;
  sourceFieldTaskId?: string;
}) {
  const t = useTranslations("consultantWorkflow");
  const existing = useQuery({
    queryKey: ["consultant-application", id],
    queryFn: () => getConsultantApplication(id as string),
    enabled: Boolean(id),
  });
  if (id && existing.isLoading) {
    return <div className="grid min-h-72 place-items-center"><Loader2 className="size-7 animate-spin text-primary" /></div>;
  }
  if (id && (existing.isError || !existing.data || existing.data.status !== "DRAFT")) {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-10 text-center text-sm text-destructive">{t("state.draftUnavailable")}</div>;
  }
  return (
    <ConsultantApplicationEditor
      key={id ?? "new"}
      id={id}
      initial={existing.data}
      sourceFieldTaskId={sourceFieldTaskId}
    />
  );
}

function ConsultantApplicationEditor({
  id,
  initial,
  sourceFieldTaskId,
}: {
  id?: string;
  initial?: ConsultantApplication;
  sourceFieldTaskId: string;
}) {
  const t = useTranslations("consultantWorkflow");
  const { can } = useAuth();
  const router = useRouter();
  const surface = useFormSurface();
  const qc = useQueryClient();
  const [form, setForm] = useState<ConsultantApplicationPayload>(() =>
    initial ? payloadFromApplication(initial) : emptyForm,
  );
  const [sourceApplied, setSourceApplied] = useState(Boolean(initial));
  const sourceTask = useQuery({
    queryKey: ["consultant-field-source", sourceFieldTaskId],
    queryFn: () => getFieldTask(sourceFieldTaskId),
    enabled: !id && Boolean(sourceFieldTaskId),
    retry: false,
  });
  const [requiredAt, setRequiredAt] = useState(() =>
    initial?.required_at
      ? new Date(initial.required_at).toISOString().slice(0, 16)
      : "",
  );
  const [inspectionStartAt, setInspectionStartAt] = useState(() =>
    initial?.inspection_start_at
      ? new Date(initial.inspection_start_at).toISOString().slice(0, 16)
      : "",
  );
  const [inspectionEndAt, setInspectionEndAt] = useState(() =>
    initial?.inspection_end_at
      ? new Date(initial.inspection_end_at).toISOString().slice(0, 16)
      : "",
  );
  const onProjectChange = useCallback((project: string) => {
    setForm((old) => ({
      ...emptyForm,
      project,
      location: old.project === project ? old.location : "",
    }));
  }, []);
  useEffect(() => {
    if (id || sourceApplied || !sourceTask.data) return;
    const source = sourceTask.data;
    const timer = window.setTimeout(() => {
      setForm((old) => ({
        ...old,
        project: source.project,
        source_field_task: source.id,
        location: source.work_location || old.location,
        component: source.category_name || old.component,
        description: source.instructions || old.description,
      }));
      setSourceApplied(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [id, sourceApplied, sourceTask.data]);
  const options = useQuery({
    queryKey: ["consultant-options", form.project],
    queryFn: () => getApplicationOptions(form.project),
    enabled: Boolean(form.project),
  });
  const workflows = useQuery({
    queryKey: ["consultant-workflows", form.project],
    queryFn: () =>
      getConsultantWorkflows({ project: form.project, page_size: 200 }),
    enabled: Boolean(form.project),
  });
  const templates = useQuery({
    queryKey: ["consultant-templates", form.project],
    queryFn: () => getApplicationTemplates({ project: form.project, page_size: 200 }),
    enabled: Boolean(form.project),
  });
  const scheduleTasks = useQuery({
    queryKey: ["consultant-schedule-tasks", form.project],
    queryFn: () => getScheduleTasks({ project: form.project, page_size: 300 }),
    // Only people who may read the schedule ask for it, so a failure here is a real one.
    enabled: Boolean(form.project) && can("schedule.view"),
    retry: false,
  });
  const grants = useQuery({
    queryKey: ["consultant-grant-options", form.project],
    queryFn: () => getConsultantGrants(form.project),
    enabled: Boolean(form.project),
  });
  const grouped = useMemo(() => {
    const result = new Map<ProjectOptionCategory, ProjectApplicationOption[]>();
    for (const row of options.data?.results ?? []) {
      result.set(row.category, [...(result.get(row.category) ?? []), row]);
    }
    return result;
  }, [options.data]);
  useEffect(() => {
    const source = sourceTask.data;
    if (!source || !options.data?.results.length || form.application_type) return;
    const expected = source.submission_category.trim().toLowerCase();
    const applicationOptions = options.data.results.filter(
      (row) => row.category === "APPLICATION_TYPE" && row.is_active,
    );
    const matched = applicationOptions.find(
      (row) => row.code.trim().toLowerCase() === expected || row.label.trim().toLowerCase() === expected,
    );
    const fallback = applicationOptions.find((row) => row.code === "OTHER");
    if (!matched && (!fallback || !source.submission_category)) return;
    const timer = window.setTimeout(() => {
      if (matched) {
        setForm((old) => ({ ...old, application_type: matched.id }));
      } else if (fallback) {
        setForm((old) => ({
          ...old,
          application_type: fallback.id,
          application_type_custom: source.submission_category,
        }));
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [form.application_type, options.data, sourceTask.data]);

  const preferredWorkflow =
    workflows.data?.results.find((workflow) => workflow.is_default) ??
    workflows.data?.results[0];
  const selectedWorkflow = form.workflow || preferredWorkflow?.id || "";
  const selectedTemplate = (templates.data?.results ?? []).find((template) =>
    template.versions.some((version) => version.id === form.template_version),
  );
  const selectedTemplateVersion = selectedTemplate?.versions.find(
    (version) => version.id === form.template_version,
  );
  const templateFields = selectedTemplateVersion?.field_schema ?? [];
  // Named field by field: each of them carries its own required marker below,
  // and "template" was the wrong thing to point at once the template picker
  // became optional (T-373).
  const missingTemplateFields = templateFields
    .filter((field) => field.required && !form.custom_fields?.[field.key]?.trim())
    .map((field) => field.label)
    .join(", ");
  const requiredTemplateFieldsComplete = templateFields
    .filter((field) => field.required)
    .every((field) => Boolean(form.custom_fields?.[field.key]?.trim()));

  const save = useMutation({
    mutationFn: () =>
      id
        ? updateConsultantApplication(id, {
            ...form,
            workflow: selectedWorkflow,
            required_at: requiredAt ? new Date(requiredAt).toISOString() : null,
            inspection_start_at: inspectionStartAt ? new Date(inspectionStartAt).toISOString() : null,
            inspection_end_at: inspectionEndAt ? new Date(inspectionEndAt).toISOString() : null,
          })
        : createConsultantApplication({
            ...form,
            workflow: selectedWorkflow,
            required_at: requiredAt ? new Date(requiredAt).toISOString() : null,
            inspection_start_at: inspectionStartAt ? new Date(inspectionStartAt).toISOString() : null,
            inspection_end_at: inspectionEndAt ? new Date(inspectionEndAt).toISOString() : null,
          }),
    onSuccess: (row) => router.push(`/consultant-applications/${row.id}`),
  });
  const saveReusableOption = useMutation({
    mutationFn: ({
      category,
      label,
    }: {
      category: Exclude<ProjectOptionCategory, "ATTACHMENT_TYPE">;
      label: string;
    }) =>
      createApplicationOption({
        project: form.project,
        category,
        code: `CUSTOM_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        label: label.trim(),
        is_active: true,
        sort_order: (grouped.get(category)?.length ?? 0) + 100,
      }),
    onSuccess: async (row, { category }) => {
      setForm((old) => {
        switch (category) {
          case "APPLICATION_TYPE":
            return { ...old, application_type: row.id, application_type_custom: "" };
          case "DISCIPLINE":
            return { ...old, discipline: row.id, discipline_custom: "" };
          case "WORK_TYPE":
            return { ...old, work_type: row.id, work_type_custom: "" };
          case "PRIORITY":
            return { ...old, priority: row.id, priority_custom: "" };
        }
      });
      await qc.invalidateQueries({ queryKey: ["consultant-options", form.project] });
    },
  });
  const set = <K extends keyof ConsultantApplicationPayload>(
    key: K,
    value: ConsultantApplicationPayload[K],
  ) => setForm((old) => ({ ...old, [key]: value }));
  const setCustom = (key: string, value: string) =>
    setForm((old) => ({
      ...old,
      custom_fields: { ...(old.custom_fields ?? {}), [key]: value },
    }));
  const selectedGrant = grants.data?.find(
    (grant) => grant.consultant === form.consultant,
  );
  const chooseConsultant = (consultantId: string) => {
    const grant = grants.data?.find((row) => row.consultant === consultantId);
    setForm((old) => ({
      ...old,
      consultant: consultantId,
      consultant_organization: grant?.organization ?? "",
    }));
  };
  const saveError = save.isError
    ? save.error instanceof ApiError
      ? save.error.message
      : t("form.saveError")
    : "";

  const body = (
    <>
      {sourceTask.isLoading ? (
        <div className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("form.sourceLoading")}
        </div>
      ) : sourceTask.isError ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {t("form.sourceLoadError")}
        </p>
      ) : sourceTask.data ? (
        <section className="rounded-lg border border-primary/20 bg-primary/5 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Images className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{t("form.sourceTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("form.sourceHelp")}</p>
              <div className="mt-3 grid gap-1 text-sm">
                <p><strong>{sourceTask.data.project_name}</strong></p>
                {sourceTask.data.submission_category && <p>{sourceTask.data.submission_category}</p>}
                {sourceTask.data.work_location && <p>{sourceTask.data.work_location}</p>}
                {sourceTask.data.submitted_at && <p className="text-muted-foreground">{t("form.sourceSubmittedAt", { value: new Date(sourceTask.data.submitted_at).toLocaleString() })}</p>}
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {sourceTask.data.photos.map((photo) => (
              <a key={photo.id} href={photo.watermarked || photo.image} target="_blank" rel="noreferrer">
                <Image src={photo.watermarked || photo.image} alt="" width={240} height={240} unoptimized className="aspect-square w-full rounded-lg object-cover" />
              </a>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{t("form.sourcePhotosLinked", { count: sourceTask.data.photos.length })}</span>
            {sourceTask.data.photos[0]?.latitude && sourceTask.data.photos[0]?.longitude ? (
              <a
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                href={`https://www.google.com/maps?q=${sourceTask.data.photos[0].latitude},${sourceTask.data.photos[0].longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                <MapPin className="size-3.5" />{t("form.sourceGps")}
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      <FormSection title={t("form.section.project")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("field.project")} required>
            {id || sourceTask.data ? <Input value={initial?.project_name ?? sourceTask.data?.project_name ?? ""} readOnly className="bg-muted/40" /> : <ConsultantProjectPicker value={form.project} onChange={onProjectChange} />}
          </FieldWrapper>
          {/*
            Folded away (T-373, D-254). Neither has to be chosen: every project
            now has a default one-step route - to the consultant this
            application is addressed to - and a template is optional. Showing
            them as the first two required fields is what made the form
            impossible to start.
          */}
          <details className="rounded-lg border bg-muted/20 px-3 py-2 sm:col-span-2">
            <summary className="cursor-pointer text-sm font-medium">{t("form.advanced")}</summary>
            <p className="mt-1 text-xs text-muted-foreground">{t("form.advancedHelp")}</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <FieldWrapper label={t("field.workflow")}>
              <Select
                value={selectedWorkflow || undefined}
                onValueChange={(value) => set("workflow", value)}
                disabled={!form.project || workflows.isLoading}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder={t("field.chooseWorkflow")} /></SelectTrigger>
                <SelectContent>
                  {(workflows.data?.results ?? []).map((row) => (
                    <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <QueryFailedNote query={workflows} what={t("what.workflows")} />
            </FieldWrapper>
            <FieldWrapper label={t("field.template")}>
              <Select
                value={form.template_version || "NONE"}
                onValueChange={(value) => {
                  if (value === "NONE") {
                    set("template_version", null);
                    return;
                  }
                  const template = (templates.data?.results ?? []).find((row) =>
                    row.versions.some((version) => version.id === value),
                  );
                  setForm((old) => ({
                    ...old,
                    template_version: value,
                    application_type: template?.application_type || old.application_type,
                  }));
                }}
                disabled={!form.project || templates.isLoading}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder={t("field.chooseTemplate")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">{t("field.noTemplate")}</SelectItem>
                  {(templates.data?.results ?? []).map((template) => {
                    const version = template.versions.find((item) => item.version === template.current_version);
                    return version ? (
                      <SelectItem key={version.id} value={version.id}>
                        {template.code} - {template.name} (v{version.version})
                      </SelectItem>
                    ) : null;
                  })}
                </SelectContent>
              </Select>
              <QueryFailedNote query={templates} what={t("what.templates")} />
            </FieldWrapper>
            </div>
          </details>
          <FieldWrapper label={t("field.scheduleTask")}>
            <Select value={form.schedule_task || "NONE"} onValueChange={(value) => set("schedule_task", value === "NONE" ? null : value)} disabled={!form.project || scheduleTasks.isLoading || scheduleTasks.isError}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t("field.chooseScheduleTask")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">{t("field.noScheduleTask")}</SelectItem>
                {(scheduleTasks.data?.results ?? []).map((task) => <SelectItem key={task.id} value={task.id}>{task.wbs_code} - {task.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <QueryFailedNote query={scheduleTasks} what={t("what.scheduleTasks")} />
          </FieldWrapper>
          <FieldWrapper label={t("field.applicationType")} required><OptionField category="APPLICATION_TYPE" value={form.application_type} grouped={grouped} onChange={(value) => set("application_type", value)} placeholder={t("field.chooseType")} /></FieldWrapper>
          <FieldWrapper label={t("field.discipline")} required><OptionField category="DISCIPLINE" value={form.discipline} grouped={grouped} onChange={(value) => set("discipline", value)} placeholder={t("field.chooseDiscipline")} /></FieldWrapper>
          <FieldWrapper label={t("field.workType")} required><OptionField category="WORK_TYPE" value={form.work_type} grouped={grouped} onChange={(value) => set("work_type", value)} placeholder={t("field.chooseWorkType")} /></FieldWrapper>
          <FieldWrapper label={t("field.priority")} required><OptionField category="PRIORITY" value={form.priority} grouped={grouped} onChange={(value) => set("priority", value)} placeholder={t("field.choosePriority")} /></FieldWrapper>
          <QueryFailedNote query={options} what={t("what.applicationOptions")} className="sm:col-span-2" />
          <ExtraTicks
            category="DISCIPLINE"
            grouped={grouped}
            primary={form.discipline}
            chosen={form.additional_disciplines ?? []}
            onChange={(value) => set("additional_disciplines", value)}
            label={t("field.additionalDisciplines")}
            hint={t("field.additionalDisciplinesHint")}
          />
          <ExtraTicks
            category="WORK_TYPE"
            grouped={grouped}
            primary={form.work_type}
            chosen={form.additional_work_types ?? []}
            onChange={(value) => set("additional_work_types", value)}
            label={t("field.additionalWorkTypes")}
            hint={t("field.additionalWorkTypesHint")}
          />
          <CustomValue optionId={form.application_type} options={grouped.get("APPLICATION_TYPE") ?? []} value={form.application_type_custom ?? ""} onChange={(value) => set("application_type_custom", value)} label={t("field.customApplicationType")} canSave={can("consultant.config")} isSaving={saveReusableOption.isPending && saveReusableOption.variables?.category === "APPLICATION_TYPE"} onSave={(label) => saveReusableOption.mutate({ category: "APPLICATION_TYPE", label })} saveLabel={t("action.saveReusableOption")} saveHelp={t("form.saveReusableOptionHelp")} />
          <CustomValue optionId={form.discipline} options={grouped.get("DISCIPLINE") ?? []} value={form.discipline_custom ?? ""} onChange={(value) => set("discipline_custom", value)} label={t("field.customDiscipline")} canSave={can("consultant.config")} isSaving={saveReusableOption.isPending && saveReusableOption.variables?.category === "DISCIPLINE"} onSave={(label) => saveReusableOption.mutate({ category: "DISCIPLINE", label })} saveLabel={t("action.saveReusableOption")} saveHelp={t("form.saveReusableOptionHelp")} />
          <CustomValue optionId={form.work_type} options={grouped.get("WORK_TYPE") ?? []} value={form.work_type_custom ?? ""} onChange={(value) => set("work_type_custom", value)} label={t("field.customWorkType")} canSave={can("consultant.config")} isSaving={saveReusableOption.isPending && saveReusableOption.variables?.category === "WORK_TYPE"} onSave={(label) => saveReusableOption.mutate({ category: "WORK_TYPE", label })} saveLabel={t("action.saveReusableOption")} saveHelp={t("form.saveReusableOptionHelp")} />
          <CustomValue optionId={form.priority} options={grouped.get("PRIORITY") ?? []} value={form.priority_custom ?? ""} onChange={(value) => set("priority_custom", value)} label={t("field.customPriority")} canSave={can("consultant.config")} isSaving={saveReusableOption.isPending && saveReusableOption.variables?.category === "PRIORITY"} onSave={(label) => saveReusableOption.mutate({ category: "PRIORITY", label })} saveLabel={t("action.saveReusableOption")} saveHelp={t("form.saveReusableOptionHelp")} />
        </div>
      </FormSection>

      <FormSection title={t("form.section.consultant")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("field.consultant")} required>
            <Select value={form.consultant || undefined} onValueChange={chooseConsultant} disabled={!form.project || grants.isLoading}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t("field.chooseConsultant")} /></SelectTrigger>
              <SelectContent>
                {(grants.data ?? []).map((grant) => (
                  <SelectItem key={grant.id} value={grant.consultant}>
                    {grant.consultant_name} - {grant.organization_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <QueryFailedNote query={grants} what={t("what.consultantGrants")} />
          </FieldWrapper>
          <FieldWrapper label={t("field.consultantCompany")} required>
            <Input value={selectedGrant?.organization_name ?? ""} readOnly className="bg-muted/40" />
          </FieldWrapper>
        </div>
        {form.project && !grants.isLoading && !grants.isError && !grants.data?.length && (
          <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            {t("form.noConsultantGrant")}
          </p>
        )}
      </FormSection>

      <FormSection title={t("form.section.inspection")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("field.location")} required><Input value={form.location} onChange={(event) => set("location", event.target.value)} /></FieldWrapper>
          <FieldWrapper label={t("field.component")} required><Input value={form.component} onChange={(event) => set("component", event.target.value)} /></FieldWrapper>
          <FieldWrapper label={t("field.description")} required className="sm:col-span-2"><Textarea rows={4} value={form.description} onChange={(event) => set("description", event.target.value)} /></FieldWrapper>
          <FieldWrapper label={t("field.remarks")} className="sm:col-span-2"><Textarea rows={3} value={form.remarks ?? ""} onChange={(event) => set("remarks", event.target.value)} /></FieldWrapper>
          <FieldWrapper label={t("field.requiredAt")}><Input type="datetime-local" value={requiredAt} onChange={(event) => setRequiredAt(event.target.value)} /></FieldWrapper>
          <FieldWrapper label={t("field.inspectionStartAt")}><Input type="datetime-local" value={inspectionStartAt} onChange={(event) => setInspectionStartAt(event.target.value)} /></FieldWrapper>
          <FieldWrapper label={t("field.inspectionEndAt")}><Input type="datetime-local" min={inspectionStartAt || undefined} value={inspectionEndAt} onChange={(event) => setInspectionEndAt(event.target.value)} /></FieldWrapper>
          <FieldWrapper label={t("field.inspectionActivity")}><Input value={form.custom_fields?.inspection_activity ?? ""} onChange={(event) => setCustom("inspection_activity", event.target.value)} /></FieldWrapper>
          <FieldWrapper label={t("field.drawingNo")}><Input value={form.drawing_no ?? ""} onChange={(event) => set("drawing_no", event.target.value)} /></FieldWrapper>
          <FieldWrapper label={t("field.drawingRevision")}><Input value={form.drawing_revision ?? ""} onChange={(event) => set("drawing_revision", event.target.value)} /></FieldWrapper>
          <FieldWrapper label={t("field.itpNo")}><Input value={form.itp_no ?? ""} onChange={(event) => set("itp_no", event.target.value)} /></FieldWrapper>
          <FieldWrapper label={t("field.checklistReference")}><Input value={form.checklist_reference ?? ""} onChange={(event) => set("checklist_reference", event.target.value)} /></FieldWrapper>
          <FieldWrapper label={t("field.inspectionCategory")}>
            <Select value={form.inspection_category || "NONE"} onValueChange={(value) => set("inspection_category", value === "NONE" ? "" : value as "R" | "S" | "W" | "H")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">{t("inspectionCategory.NONE")}</SelectItem>
                {(["R", "S", "W", "H"] as const).map((value) => <SelectItem key={value} value={value}>{t(`inspectionCategory.${value}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.acceptanceRequirement")}><Input value={form.custom_fields?.acceptance_requirement ?? ""} onChange={(event) => setCustom("acceptance_requirement", event.target.value)} /></FieldWrapper>
          {templateFields.filter((field) => !BUILT_IN_CUSTOM_FIELD_KEYS.has(field.key)).map((field) => (
            <FieldWrapper key={field.key} label={field.label} required={Boolean(field.required)}>
              <Input value={form.custom_fields?.[field.key] ?? ""} onChange={(event) => setCustom(field.key, event.target.value)} />
            </FieldWrapper>
          ))}
        </div>
        {selectedTemplateVersion?.required_attachment_codes.length ? (
          <p className="mt-4 rounded-lg border border-info/30 bg-info/5 p-3 text-sm text-info">
            {t("form.requiredAttachments", { codes: selectedTemplateVersion.required_attachment_codes.join(", ") })}
          </p>
        ) : null}
      </FormSection>

      {saveError ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {saveError}
        </p>
      ) : null}

    </>
  );

  const actions = (
    <>
        <Button variant="outline" onClick={() => router.back()}>{t("action.cancel")}</Button>
        <Button requires={[[form.project, t("field.project")], [form.application_type, t("field.applicationType")], [form.discipline, t("field.discipline")], [form.work_type, t("field.workType")], [form.priority, t("field.priority")], [form.consultant, t("field.consultant")], [form.consultant_organization, t("field.consultantCompany")], [form.location, t("field.location")], [form.component, t("field.component")], [form.description, t("field.description")], [requiredTemplateFieldsComplete, missingTemplateFields]]}
                disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          {t("action.saveDraft")}
        </Button>
    </>
  );

  /*
   * In a dialog the page's own back bar and title block would be a second
   * frame drawn inside the first (T-216). The dialog already says what it is
   * and already has a way out, so only the sections are kept - and the action
   * bar becomes the dialog's footer, which is pinned rather than sticky.
   *
   * This is one of the three screens the task flagged as too tall to simply
   * drop into a dialog. It stays readable because the body scrolls on its own
   * while the header and the two buttons hold still.
   */
  if (surface === "dialog") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t(id ? "form.editTitle" : "form.title")}</DialogTitle>
          <DialogDescription>{t("form.subtitle")}</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 space-y-5 overflow-y-auto border-y px-4 py-5">
          {body}
        </div>
        <DialogFooter>{actions}</DialogFooter>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <DetailHeader
        backHref="/consultant-applications"
        backLabel={t("applications.back")}
      />
      <div className="flex items-start gap-3 border-b pb-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <ClipboardPen className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold">{t(id ? "form.editTitle" : "form.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("form.subtitle")}</p>
        </div>
      </div>

      {body}

      <div className="sticky bottom-3 flex justify-end gap-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
        {actions}
      </div>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-5">
      <SectionHeader title={title} />
      {children}
    </section>
  );
}

/**
 * The other trades or activities one inspection also covers.
 *
 * Checkboxes rather than a multi-select listbox because the customer's own
 * forms are tick lists and the office reads them that way. The primary choice
 * is filtered out: it already has its own labelled row on the form, and the
 * API refuses it here anyway rather than printing the same trade twice.
 */
function ExtraTicks({
  category,
  grouped,
  primary,
  chosen,
  onChange,
  label,
  hint,
}: {
  category: ProjectOptionCategory;
  grouped: Map<ProjectOptionCategory, ProjectApplicationOption[]>;
  primary: string;
  chosen: string[];
  onChange: (value: string[]) => void;
  label: string;
  hint: string;
}) {
  const options = (grouped.get(category) ?? []).filter(
    (row) => row.id !== primary,
  );
  return (
    <FieldWrapper label={label} hint={hint} className="sm:col-span-2">
      <div className="grid max-h-44 grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-3">
        {options.map((row) => (
          <label
            key={row.id}
            className="flex items-center gap-2 text-sm"
            htmlFor={`extra-${category}-${row.id}`}
          >
            <Checkbox
              id={`extra-${category}-${row.id}`}
              checked={chosen.includes(row.id)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...chosen, row.id]
                    : chosen.filter((id) => id !== row.id),
                )
              }
            />
            {row.label}
          </label>
        ))}
      </div>
    </FieldWrapper>
  );
}

function OptionField({
  category,
  value,
  grouped,
  onChange,
  placeholder,
}: {
  category: ProjectOptionCategory;
  value: string;
  grouped: Map<ProjectOptionCategory, ProjectApplicationOption[]>;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {(grouped.get(category) ?? []).map((row) => (
          <SelectItem key={row.id} value={row.id}>{row.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CustomValue({
  optionId,
  options,
  value,
  onChange,
  label,
  canSave,
  isSaving,
  onSave,
  saveLabel,
  saveHelp,
}: {
  optionId: string;
  options: ProjectApplicationOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  canSave: boolean;
  isSaving: boolean;
  onSave: (value: string) => void;
  saveLabel: string;
  saveHelp: string;
}) {
  if (options.find((option) => option.id === optionId)?.code !== "OTHER") return null;
  return (
    <FieldWrapper label={label} required>
      <div className="space-y-2">
        <Input value={value} onChange={(event) => onChange(event.target.value)} />
        {canSave ? (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">{saveHelp}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
              requires={[[value, label]]}
              disabled={isSaving}
              onClick={() => onSave(value)}
            >
              {isSaving ? <Loader2 className="animate-spin" /> : <Plus />}
              {saveLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </FieldWrapper>
  );
}
