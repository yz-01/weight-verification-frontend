"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardPen, Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { ConsultantProjectPicker } from "@/components/consultant-workflow/project-scope-picker";
import {
  DetailHeader,
  FieldWrapper,
  SectionHeader,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ConsultantApplication,
  ConsultantApplicationPayload,
  ProjectApplicationOption,
  ProjectOptionCategory,
} from "@/interfaces/consultant-workflow";
import {
  createConsultantApplication,
  getApplicationOptions,
  getConsultantApplication,
  getConsultantGrants,
  getConsultantWorkflows,
  updateConsultantApplication,
} from "@/services/consultant-workflow.service";

const emptyForm: ConsultantApplicationPayload = {
  project: "",
  workflow: "",
  application_type: "",
  discipline: "",
  work_type: "",
  priority: "",
  consultant_organization: "",
  consultant: "",
  location: "",
  component: "",
  description: "",
  required_at: null,
  drawing_no: "",
  drawing_revision: "",
  itp_no: "",
  checklist_reference: "",
  inspection_category: "",
  custom_fields: {},
};

function payloadFromApplication(
  row: ConsultantApplication,
): ConsultantApplicationPayload {
  return {
    project: row.project,
    workflow: row.workflow ?? "",
    application_type: row.application_type,
    application_type_custom: row.application_type_custom,
    discipline: row.discipline,
    discipline_custom: row.discipline_custom,
    work_type: row.work_type,
    work_type_custom: row.work_type_custom,
    priority: row.priority,
    priority_custom: row.priority_custom,
    consultant_organization: row.consultant_organization,
    consultant: row.consultant,
    location: row.location,
    component: row.component,
    description: row.description,
    required_at: row.required_at,
    drawing_no: row.drawing_no,
    drawing_revision: row.drawing_revision,
    itp_no: row.itp_no,
    checklist_reference: row.checklist_reference,
    inspection_category: row.inspection_category,
    custom_fields: row.custom_fields,
  };
}

export function ConsultantApplicationForm({ id }: { id?: string }) {
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
    />
  );
}

function ConsultantApplicationEditor({
  id,
  initial,
}: {
  id?: string;
  initial?: ConsultantApplication;
}) {
  const t = useTranslations("consultantWorkflow");
  const router = useRouter();
  const [form, setForm] = useState<ConsultantApplicationPayload>(() =>
    initial ? payloadFromApplication(initial) : emptyForm,
  );
  const [requiredAt, setRequiredAt] = useState(() =>
    initial?.required_at
      ? new Date(initial.required_at).toISOString().slice(0, 16)
      : "",
  );
  const onProjectChange = useCallback((project: string) => {
    setForm((old) => ({
      ...emptyForm,
      project,
      location: old.project === project ? old.location : "",
    }));
  }, []);
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

  const preferredWorkflow =
    workflows.data?.results.find((workflow) => workflow.is_default) ??
    workflows.data?.results[0];
  const selectedWorkflow = form.workflow || preferredWorkflow?.id || "";

  const save = useMutation({
    mutationFn: () =>
      id
        ? updateConsultantApplication(id, {
            ...form,
            workflow: selectedWorkflow,
            required_at: requiredAt ? new Date(requiredAt).toISOString() : null,
          })
        : createConsultantApplication({
            ...form,
            workflow: selectedWorkflow,
            required_at: requiredAt ? new Date(requiredAt).toISOString() : null,
          }),
    onSuccess: (row) => router.push(`/consultant-applications/${row.id}`),
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
  const complete = Boolean(
    form.project &&
      selectedWorkflow &&
      form.application_type &&
      form.discipline &&
      form.work_type &&
      form.priority &&
      form.consultant &&
      form.consultant_organization &&
      form.location.trim() &&
      form.component.trim() &&
      form.description.trim(),
  );

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

      <FormSection title={t("form.section.project")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("field.project")} required>
            {id ? <Input value={initial?.project_name ?? ""} readOnly className="bg-muted/40" /> : <ConsultantProjectPicker value={form.project} onChange={onProjectChange} />}
          </FieldWrapper>
          <FieldWrapper label={t("field.workflow")} required>
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
          </FieldWrapper>
          <OptionField category="APPLICATION_TYPE" value={form.application_type} grouped={grouped} onChange={(value) => set("application_type", value)} label={t("field.applicationType")} placeholder={t("field.chooseType")} />
          <OptionField category="DISCIPLINE" value={form.discipline} grouped={grouped} onChange={(value) => set("discipline", value)} label={t("field.discipline")} placeholder={t("field.chooseDiscipline")} />
          <OptionField category="WORK_TYPE" value={form.work_type} grouped={grouped} onChange={(value) => set("work_type", value)} label={t("field.workType")} placeholder={t("field.chooseWorkType")} />
          <OptionField category="PRIORITY" value={form.priority} grouped={grouped} onChange={(value) => set("priority", value)} label={t("field.priority")} placeholder={t("field.choosePriority")} />
          <CustomValue optionId={form.application_type} options={grouped.get("APPLICATION_TYPE") ?? []} value={form.application_type_custom ?? ""} onChange={(value) => set("application_type_custom", value)} label={t("field.customApplicationType")} />
          <CustomValue optionId={form.discipline} options={grouped.get("DISCIPLINE") ?? []} value={form.discipline_custom ?? ""} onChange={(value) => set("discipline_custom", value)} label={t("field.customDiscipline")} />
          <CustomValue optionId={form.work_type} options={grouped.get("WORK_TYPE") ?? []} value={form.work_type_custom ?? ""} onChange={(value) => set("work_type_custom", value)} label={t("field.customWorkType")} />
          <CustomValue optionId={form.priority} options={grouped.get("PRIORITY") ?? []} value={form.priority_custom ?? ""} onChange={(value) => set("priority_custom", value)} label={t("field.customPriority")} />
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
          </FieldWrapper>
          <FieldWrapper label={t("field.consultantCompany")}>
            <Input value={selectedGrant?.organization_name ?? ""} readOnly className="bg-muted/40" />
          </FieldWrapper>
        </div>
        {form.project && !grants.isLoading && !grants.data?.length && (
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
          <FieldWrapper label={t("field.requiredAt")}><Input type="datetime-local" value={requiredAt} onChange={(event) => setRequiredAt(event.target.value)} /></FieldWrapper>
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
        </div>
      </FormSection>

      <div className="sticky bottom-3 flex justify-end gap-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
        <Button variant="outline" onClick={() => router.back()}>{t("action.cancel")}</Button>
        <Button disabled={!complete || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          {t("action.saveDraft")}
        </Button>
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

function OptionField({
  category,
  value,
  grouped,
  onChange,
  label,
  placeholder,
}: {
  category: ProjectOptionCategory;
  value: string;
  grouped: Map<ProjectOptionCategory, ProjectApplicationOption[]>;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <FieldWrapper label={label} required>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {(grouped.get(category) ?? []).map((row) => (
            <SelectItem key={row.id} value={row.id}>{row.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldWrapper>
  );
}

function CustomValue({
  optionId,
  options,
  value,
  onChange,
  label,
}: {
  optionId: string;
  options: ProjectApplicationOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  if (options.find((option) => option.id === optionId)?.code !== "OTHER") return null;
  return (
    <FieldWrapper label={label} required>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </FieldWrapper>
  );
}
