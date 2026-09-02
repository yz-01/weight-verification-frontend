"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  KeyRound,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Save,
  Settings2,
  Stamp,
  Trash2,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { ConsultantProjectPicker } from "@/components/consultant-workflow/project-scope-picker";
import {
  DetailHeader,
  FieldWrapper,
  ListHeader,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConsultantOptionManager } from "@/components/consultant-workflow/option-manager";
import type {
  ConsultantWorkflow,
  ConsultantWorkflowStep,
  WorkflowReviewerKind,
} from "@/interfaces/consultant-workflow";
import {
  addConsultantWorkflowStep,
  createConsultantWorkflow,
  deleteConsultantWorkflowStep,
  getApplicationOptions,
  getConsultantWorkflows,
  getWorkflowReviewerChoices,
  updateConsultantWorkflow,
  updateConsultantWorkflowStep,
} from "@/services/consultant-workflow.service";

export function ConsultantWorkflowSettings() {
  const t = useTranslations("consultantWorkflow");
  const queryClient = useQueryClient();
  const [project, setProject] = useState("");
  const [creating, setCreating] = useState(false);
  const [addingTo, setAddingTo] = useState<ConsultantWorkflow | null>(null);
  const [editing, setEditing] = useState<ConsultantWorkflow | null>(null);
  const [editingStep, setEditingStep] = useState<{
    workflow: ConsultantWorkflow;
    step: ConsultantWorkflowStep;
  } | null>(null);
  const onProjectChange = useCallback((id: string) => setProject(id), []);
  const rows = useQuery({
    queryKey: ["consultant-workflows", project],
    queryFn: () => getConsultantWorkflows({ project, page_size: 200 }),
    enabled: Boolean(project),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["consultant-workflows", project] });
  const removeStep = useMutation({
    mutationFn: ({ workflow, step }: { workflow: string; step: string }) =>
      deleteConsultantWorkflowStep(workflow, step),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-5 pb-8">
      <DetailHeader backHref="/consultant-applications" backLabel={t("applications.back")} />
      <ListHeader
        title={t("workflow.title")}
        subtitle={t("workflow.subtitle")}
        action={<Button size="sm" disabled={!project} onClick={() => setCreating(true)}><Plus />{t("workflow.create")}</Button>}
      />
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <ConsultantProjectPicker value={project} onChange={onProjectChange} />
      </div>
      {!project ? (
        <Empty text={t("state.chooseProject")} />
      ) : rows.isLoading ? (
        <div className="grid min-h-48 place-items-center"><Loader2 className="animate-spin text-primary" /></div>
      ) : !rows.data?.count ? (
        <Empty text={t("workflow.empty")} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.data.results.map((workflow) => (
            <section key={workflow.id} className="overflow-hidden rounded-lg border bg-card shadow-sm">
              <div className="flex items-start gap-3 border-b p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Settings2 className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{workflow.name}</h2>{workflow.is_default && <StatusBadge label={t("workflow.default")} tone="info" />}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{workflow.application_type_label || t("workflow.allTypes")}</p>
                  {workflow.description && <p className="mt-2 text-sm">{workflow.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="icon-sm" variant="outline" title={t("workflow.edit")} onClick={() => setEditing(workflow)}><Pencil /></Button>
                  {!workflow.steps_locked && <Button size="icon-sm" variant="outline" title={t("workflow.addStep")} onClick={() => setAddingTo(workflow)}><Plus /></Button>}
                </div>
              </div>
              <div className="divide-y">
                {workflow.steps.map((step) => (
                  <div key={step.id} className="flex items-center gap-3 p-4">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{step.sequence}</span>
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted/60 text-muted-foreground">{step.reviewer_kind === "ROLE" ? <Users className="size-4" /> : step.reviewer_kind === "USER" ? <UserRoundCheck className="size-4" /> : <Stamp className="size-4" />}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{step.name}</p><p className="truncate text-xs text-muted-foreground">{step.reviewer_kind === "CONSULTANT" ? t("reviewerKind.CONSULTANT") : step.reviewer_user_name || step.reviewer_role_name}</p></div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">{step.requires_signature && <KeyRound className="size-3.5" />}{step.requires_stamp && <Stamp className="size-3.5" />}</div>
                    {!workflow.steps_locked && (
                      <>
                        <Button size="icon-sm" variant="ghost" title={t("workflow.editStep")} onClick={() => setEditingStep({ workflow, step })}><Pencil /></Button>
                        <Button size="icon-sm" variant="ghost" className="text-destructive" title={t("action.remove")} disabled={removeStep.isPending} onClick={() => removeStep.mutate({ workflow: workflow.id, step: step.id })}><Trash2 /></Button>
                      </>
                    )}
                  </div>
                ))}
                {!workflow.steps.length && <div className="p-6 text-center text-sm text-muted-foreground">{t("workflow.noSteps")}</div>}
                {workflow.steps_locked && <p className="flex items-start gap-2 border-t bg-muted/30 px-4 py-3 text-xs text-muted-foreground"><Lock className="mt-0.5 size-3.5 shrink-0" />{t("workflow.stepsLocked")}</p>}
              </div>
            </section>
          ))}
        </div>
      )}
      {creating && <WorkflowDialog project={project} onClose={() => setCreating(false)} onSaved={() => { void refresh(); setCreating(false); }} />}
      {editing && <WorkflowDialog project={project} workflow={editing} onClose={() => setEditing(null)} onSaved={() => { void refresh(); setEditing(null); }} />}
      {addingTo && <StepDialog workflow={addingTo} onClose={() => setAddingTo(null)} onSaved={() => { void refresh(); setAddingTo(null); }} />}
      {editingStep && <StepDialog workflow={editingStep.workflow} step={editingStep.step} onClose={() => setEditingStep(null)} onSaved={() => { void refresh(); setEditingStep(null); }} />}
      {project && <ConsultantOptionManager project={project} />}
    </div>
  );
}

/**
 * Create a workflow, or correct one.
 *
 * The application type is only offered while nothing has been filed against
 * the workflow. After that the API refuses to move it, and it refuses for a
 * reason worth showing rather than hiding behind a failed request: the
 * applications already filed would otherwise name a route that never existed.
 */
function WorkflowDialog({ project, workflow, onClose, onSaved }: { project: string; workflow?: ConsultantWorkflow; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("consultantWorkflow");
  const [name, setName] = useState(workflow?.name ?? "");
  const [description, setDescription] = useState(workflow?.description ?? "");
  const [type, setType] = useState(workflow?.application_type ?? "ALL");
  const [isDefault, setIsDefault] = useState(workflow?.is_default ?? true);
  const [isActive, setIsActive] = useState(workflow?.is_active ?? true);
  const typeFixed = Boolean(workflow?.has_applications);
  const options = useQuery({ queryKey: ["consultant-options", project, "APPLICATION_TYPE"], queryFn: () => getApplicationOptions(project, "APPLICATION_TYPE") });
  const save = useMutation({
    mutationFn: () => workflow
      ? updateConsultantWorkflow(workflow.id, { name, description, is_default: isDefault, is_active: isActive, ...(typeFixed ? {} : { application_type: type === "ALL" ? null : type }) })
      : createConsultantWorkflow({ project, name, description, application_type: type === "ALL" ? null : type, is_default: isDefault, is_active: true }),
    onSuccess: onSaved,
  });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t(workflow ? "workflow.editTitle" : "workflow.createTitle")}</DialogTitle><DialogDescription>{t("workflow.createHelp")}</DialogDescription></DialogHeader><div className="space-y-4"><FieldWrapper label={t("workflow.name")} required><Input value={name} onChange={(event) => setName(event.target.value)} /></FieldWrapper>{typeFixed ? <FieldWrapper label={t("field.applicationType")}><p className="rounded-lg border bg-muted/30 p-3 text-sm">{workflow?.application_type_label || t("workflow.allTypes")}<span className="mt-1 block text-xs text-muted-foreground">{t("workflow.typeFixed")}</span></p></FieldWrapper> : <FieldWrapper label={t("field.applicationType")}><Select value={type ?? "ALL"} onValueChange={setType}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t("workflow.allTypes")}</SelectItem>{(options.data?.results ?? []).map((row) => <SelectItem key={row.id} value={row.id}>{row.label}</SelectItem>)}</SelectContent></Select></FieldWrapper>}<FieldWrapper label={t("field.description")}><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></FieldWrapper><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span><span className="block font-medium">{t("workflow.makeDefault")}</span><span className="text-xs text-muted-foreground">{t("workflow.defaultHelp")}</span></span><Switch checked={isDefault} onCheckedChange={setIsDefault} /></label>{workflow && <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span><span className="block font-medium">{t("workflow.stillOffered")}</span><span className="text-xs text-muted-foreground">{t("workflow.stillOfferedHelp")}</span></span><Switch checked={isActive} onCheckedChange={setIsActive} /></label>}</div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Save />}{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

/**
 * Add a step, or fix one.
 *
 * Fixing matters more than it looks: before this, correcting a reviewer named
 * by mistake meant deleting the step and adding it again, which puts it back
 * at the end of the route.
 */
function StepDialog({ workflow, step: editing, onClose, onSaved }: { workflow: ConsultantWorkflow; step?: ConsultantWorkflowStep; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("consultantWorkflow");
  const [name, setName] = useState(editing?.name ?? "");
  const [kind, setKind] = useState<WorkflowReviewerKind>(editing?.reviewer_kind ?? "CONSULTANT");
  const [reviewer, setReviewer] = useState(editing?.reviewer_user ?? editing?.reviewer_role ?? "");
  const [signature, setSignature] = useState(editing?.requires_signature ?? true);
  const [stamp, setStamp] = useState(editing?.requires_stamp ?? false);
  const choices = useQuery({ queryKey: ["consultant-reviewer-choices", workflow.project], queryFn: () => getWorkflowReviewerChoices(workflow.project) });
  const save = useMutation({
    mutationFn: () => {
      const body = { name, reviewer_kind: kind, reviewer_user: kind === "USER" ? reviewer : null, reviewer_role: kind === "ROLE" ? reviewer : null, requires_signature: signature, requires_stamp: stamp };
      return editing
        ? updateConsultantWorkflowStep(workflow.id, editing.id, body)
        : addConsultantWorkflowStep(workflow.id, { sequence: Math.max(0, ...workflow.steps.map((row) => row.sequence)) + 1, ...body });
    },
    onSuccess: onSaved,
  });
  const reviewerOptions = kind === "USER" ? choices.data?.users ?? [] : kind === "ROLE" ? choices.data?.roles ?? [] : [];
  const complete = Boolean(name.trim() && (kind === "CONSULTANT" || reviewer));
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t(editing ? "workflow.editStepTitle" : "workflow.addStepTitle")}</DialogTitle><DialogDescription>{t("workflow.addStepHelp")}</DialogDescription></DialogHeader><div className="space-y-4"><FieldWrapper label={t("workflow.stepName")} required><Input value={name} onChange={(event) => setName(event.target.value)} /></FieldWrapper><FieldWrapper label={t("workflow.reviewerKind")} required><Select value={kind} onValueChange={(value) => { setKind(value as WorkflowReviewerKind); setReviewer(""); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{(["CONSULTANT", "USER", "ROLE"] as const).map((value) => <SelectItem key={value} value={value}>{t(`reviewerKind.${value}`)}</SelectItem>)}</SelectContent></Select></FieldWrapper>{kind !== "CONSULTANT" && <FieldWrapper label={t("workflow.reviewer")} required><Select value={reviewer || undefined} onValueChange={setReviewer}><SelectTrigger className="w-full"><SelectValue placeholder={t("workflow.chooseReviewer")} /></SelectTrigger><SelectContent>{reviewerOptions.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}{"role" in row && row.role ? ` - ${row.role}` : ""}</SelectItem>)}</SelectContent></Select></FieldWrapper>}<label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span className="font-medium">{t("workflow.requireSignature")}</span><Switch checked={signature} onCheckedChange={setSignature} /></label><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span><span className="block font-medium">{t("workflow.requireStamp")}</span><span className="text-xs text-muted-foreground">{t("workflow.stampHelp")}</span></span><Switch checked={stamp} onCheckedChange={(value) => { setStamp(value); if (value) setSignature(true); }} /></label></div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button disabled={!complete || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Check />}{t(editing ? "action.save" : "workflow.addStep")}</Button></DialogFooter></DialogContent></Dialog>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed bg-muted/15 p-10 text-center text-sm text-muted-foreground">{text}</div>;
}
