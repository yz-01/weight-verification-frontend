"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  KeyRound,
  Loader2,
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
import type {
  ConsultantWorkflow,
  WorkflowReviewerKind,
} from "@/interfaces/consultant-workflow";
import {
  addConsultantWorkflowStep,
  createConsultantWorkflow,
  deleteConsultantWorkflowStep,
  getApplicationOptions,
  getConsultantWorkflows,
  getWorkflowReviewerChoices,
} from "@/services/consultant-workflow.service";

export function ConsultantWorkflowSettings() {
  const t = useTranslations("consultantWorkflow");
  const queryClient = useQueryClient();
  const [project, setProject] = useState("");
  const [creating, setCreating] = useState(false);
  const [addingTo, setAddingTo] = useState<ConsultantWorkflow | null>(null);
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
                <Button size="icon-sm" variant="outline" title={t("workflow.addStep")} onClick={() => setAddingTo(workflow)}><Plus /></Button>
              </div>
              <div className="divide-y">
                {workflow.steps.map((step) => (
                  <div key={step.id} className="flex items-center gap-3 p-4">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{step.sequence}</span>
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted/60 text-muted-foreground">{step.reviewer_kind === "ROLE" ? <Users className="size-4" /> : step.reviewer_kind === "USER" ? <UserRoundCheck className="size-4" /> : <Stamp className="size-4" />}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{step.name}</p><p className="truncate text-xs text-muted-foreground">{step.reviewer_kind === "CONSULTANT" ? t("reviewerKind.CONSULTANT") : step.reviewer_user_name || step.reviewer_role_name}</p></div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">{step.requires_signature && <KeyRound className="size-3.5" />}{step.requires_stamp && <Stamp className="size-3.5" />}</div>
                    <Button size="icon-sm" variant="ghost" className="text-destructive" title={t("action.remove")} disabled={removeStep.isPending} onClick={() => removeStep.mutate({ workflow: workflow.id, step: step.id })}><Trash2 /></Button>
                  </div>
                ))}
                {!workflow.steps.length && <div className="p-6 text-center text-sm text-muted-foreground">{t("workflow.noSteps")}</div>}
              </div>
            </section>
          ))}
        </div>
      )}
      {creating && <WorkflowDialog project={project} onClose={() => setCreating(false)} onSaved={() => { void refresh(); setCreating(false); }} />}
      {addingTo && <StepDialog workflow={addingTo} onClose={() => setAddingTo(null)} onSaved={() => { void refresh(); setAddingTo(null); }} />}
    </div>
  );
}

function WorkflowDialog({ project, onClose, onSaved }: { project: string; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("consultantWorkflow");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("ALL");
  const [isDefault, setIsDefault] = useState(true);
  const options = useQuery({ queryKey: ["consultant-options", project, "APPLICATION_TYPE"], queryFn: () => getApplicationOptions(project, "APPLICATION_TYPE") });
  const save = useMutation({ mutationFn: () => createConsultantWorkflow({ project, name, description, application_type: type === "ALL" ? null : type, is_default: isDefault, is_active: true }), onSuccess: onSaved });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("workflow.createTitle")}</DialogTitle><DialogDescription>{t("workflow.createHelp")}</DialogDescription></DialogHeader><div className="space-y-4"><FieldWrapper label={t("workflow.name")} required><Input value={name} onChange={(event) => setName(event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.applicationType")}><Select value={type} onValueChange={setType}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t("workflow.allTypes")}</SelectItem>{(options.data?.results ?? []).map((row) => <SelectItem key={row.id} value={row.id}>{row.label}</SelectItem>)}</SelectContent></Select></FieldWrapper><FieldWrapper label={t("field.description")}><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></FieldWrapper><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span><span className="block font-medium">{t("workflow.makeDefault")}</span><span className="text-xs text-muted-foreground">{t("workflow.defaultHelp")}</span></span><Switch checked={isDefault} onCheckedChange={setIsDefault} /></label></div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Save />}{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function StepDialog({ workflow, onClose, onSaved }: { workflow: ConsultantWorkflow; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("consultantWorkflow");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<WorkflowReviewerKind>("CONSULTANT");
  const [reviewer, setReviewer] = useState("");
  const [signature, setSignature] = useState(true);
  const [stamp, setStamp] = useState(false);
  const choices = useQuery({ queryKey: ["consultant-reviewer-choices", workflow.project], queryFn: () => getWorkflowReviewerChoices(workflow.project) });
  const save = useMutation({ mutationFn: () => addConsultantWorkflowStep(workflow.id, { sequence: Math.max(0, ...workflow.steps.map((step) => step.sequence)) + 1, name, reviewer_kind: kind, reviewer_user: kind === "USER" ? reviewer : null, reviewer_role: kind === "ROLE" ? reviewer : null, requires_signature: signature, requires_stamp: stamp }), onSuccess: onSaved });
  const reviewerOptions = kind === "USER" ? choices.data?.users ?? [] : kind === "ROLE" ? choices.data?.roles ?? [] : [];
  const complete = Boolean(name.trim() && (kind === "CONSULTANT" || reviewer));
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("workflow.addStepTitle")}</DialogTitle><DialogDescription>{t("workflow.addStepHelp")}</DialogDescription></DialogHeader><div className="space-y-4"><FieldWrapper label={t("workflow.stepName")} required><Input value={name} onChange={(event) => setName(event.target.value)} /></FieldWrapper><FieldWrapper label={t("workflow.reviewerKind")} required><Select value={kind} onValueChange={(value) => { setKind(value as WorkflowReviewerKind); setReviewer(""); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{(["CONSULTANT", "USER", "ROLE"] as const).map((value) => <SelectItem key={value} value={value}>{t(`reviewerKind.${value}`)}</SelectItem>)}</SelectContent></Select></FieldWrapper>{kind !== "CONSULTANT" && <FieldWrapper label={t("workflow.reviewer")} required><Select value={reviewer || undefined} onValueChange={setReviewer}><SelectTrigger className="w-full"><SelectValue placeholder={t("workflow.chooseReviewer")} /></SelectTrigger><SelectContent>{reviewerOptions.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}{"role" in row && row.role ? ` - ${row.role}` : ""}</SelectItem>)}</SelectContent></Select></FieldWrapper>}<label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span className="font-medium">{t("workflow.requireSignature")}</span><Switch checked={signature} onCheckedChange={setSignature} /></label><label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span><span className="block font-medium">{t("workflow.requireStamp")}</span><span className="text-xs text-muted-foreground">{t("workflow.stampHelp")}</span></span><Switch checked={stamp} onCheckedChange={(value) => { setStamp(value); if (value) setSignature(true); }} /></label></div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button disabled={!complete || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Check />}{t("workflow.addStep")}</Button></DialogFooter></DialogContent></Dialog>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed bg-muted/15 p-10 text-center text-sm text-muted-foreground">{text}</div>;
}
