"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileArchive,
  ImageIcon,
  KeyRound,
  Link2,
  Loader2,
  MailOpen,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  BadgeCheck,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  DetailHeader,
  FieldWrapper,
  ReadField,
  SectionHeader,
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
import { Textarea } from "@/components/ui/textarea";
import type {
  ApplicationReviewStep,
  ConsultantApplication,
} from "@/interfaces/consultant-workflow";
import {
  addApplicationAttachment,
  acknowledgeConsultantApplication,
  createApplicationRevision,
  downloadApplicationFinalReport,
  getApplicationEvidenceCandidates,
  getApprovalCredential,
  getConsultantApplication,
  linkApplicationEvidence,
  receiveConsultantApplication,
  reviewConsultantApplication,
  submitConsultantApplication,
} from "@/services/consultant-workflow.service";

export function ConsultantApplicationDetail({ id }: { id: string }) {
  const t = useTranslations("consultantWorkflow");
  const { user, can } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [decision, setDecision] = useState<
    "APPROVE" | "APPROVE_WITH_REMEDIAL" | "REJECT" | "REVISE_RESUBMIT" | null
  >(null);
  const query = useQuery({
    queryKey: ["consultant-application", id],
    queryFn: () => getConsultantApplication(id),
  });
  const credential = useQuery({
    queryKey: ["approval-credential"],
    queryFn: getApprovalCredential,
    enabled: can("approval.review"),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["consultant-application", id] });
  const submit = useMutation({
    mutationFn: () => submitConsultantApplication(id),
    onSuccess: refresh,
  });
  const revision = useMutation({
    mutationFn: () => createApplicationRevision(id),
    onSuccess: (row) => router.push(`/consultant-applications/${row.id}`),
  });
  const receive = useMutation({
    mutationFn: () => receiveConsultantApplication(id),
    onSuccess: refresh,
  });
  const acknowledge = useMutation({
    mutationFn: () => acknowledgeConsultantApplication(id),
    onSuccess: refresh,
  });

  if (query.isLoading) {
    return <div className="grid min-h-72 place-items-center"><Loader2 className="size-7 animate-spin text-primary" /></div>;
  }
  if (query.isError || !query.data) {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-10 text-center text-sm text-destructive">{t("state.loadError")}</div>;
  }

  const application = query.data;
  const attachedCategories = new Set(
    application.attachments.map((attachment) => attachment.category),
  );
  const templateCustomFields = application.template_field_schema.filter(
    (field) => !["inspection_activity", "acceptance_requirement"].includes(field.key),
  );
  const currentStep = application.review_steps.find((step) => step.status === "CURRENT");
  const canAct = Boolean(
    currentStep && user && can("approval.review") && reviewerMatches(currentStep, application, user),
  );
  const action = (
    <div className="flex flex-wrap justify-end gap-2">
      {application.status === "DRAFT" && can("consultant.submit") && (
        <>
          <Button asChild variant="outline" size="sm">
            <Link href={`/consultant-applications/${id}/edit`}><Pencil />{t("action.edit")}</Link>
          </Button>
          <Button size="sm" disabled={submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {t("action.submit")}
          </Button>
        </>
      )}
      {application.status === "REVISE_RESUBMIT" && can("consultant.submit") && (
        <Button size="sm" disabled={revision.isPending} onClick={() => revision.mutate()}>
          {revision.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          {t("action.createRevision")}
        </Button>
      )}
      {application.status === "SUBMITTED" && application.consultant === user?.id && !application.received_at && can("approval.review") && (
        <Button size="sm" variant="outline" disabled={receive.isPending} onClick={() => receive.mutate()}>
          {receive.isPending ? <Loader2 className="animate-spin" /> : <MailOpen />}
          {t("action.receive")}
        </Button>
      )}
      {application.status === "SUBMITTED" && application.consultant === user?.id && application.received_at && !application.acknowledged_at && can("approval.review") && (
        <Button size="sm" variant="outline" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate()}>
          {acknowledge.isPending ? <Loader2 className="animate-spin" /> : <BadgeCheck />}
          {t("action.acknowledge")}
        </Button>
      )}
      {application.final_report && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadApplicationFinalReport(application.id, application.application_no)}
        >
          <Download />{t("action.downloadReport")}
        </Button>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-8">
      <DetailHeader backHref="/consultant-applications" backLabel={t("applications.back")} action={action} />
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-all text-xl font-semibold">{application.application_no}</h1>
            <StatusBadge label={t(`status.${application.status}`)} tone={statusTone(application.status)} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {application.project_name} - {application.application_type_custom || application.application_type_label}
          </p>
        </div>
        <div className="text-left text-xs text-muted-foreground sm:text-right">
          <p>{t("detail.revision", { revision: application.revision })}</p>
          <p>{t("detail.applicant", { name: application.applicant_name })}</p>
        </div>
      </div>

      {currentStep && (
        <section className="rounded-lg border border-warning/30 bg-warning/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{t("review.pending", { step: currentStep.name })}</p>
              <p className="mt-1 text-sm text-muted-foreground">{reviewerLabel(currentStep, application, t)}</p>
            </div>
            {canAct && (
              credential.data ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setDecision("APPROVE")}><CheckCircle2 />{t("decision.APPROVE")}</Button>
                  <Button size="sm" variant="outline" onClick={() => setDecision("APPROVE_WITH_REMEDIAL")}><ClipboardCheck />{t("decision.APPROVE_WITH_REMEDIAL")}</Button>
                  <Button size="sm" variant="outline" onClick={() => setDecision("REVISE_RESUBMIT")}><RotateCcw />{t("decision.REVISE_RESUBMIT")}</Button>
                  <Button size="sm" variant="destructive" onClick={() => setDecision("REJECT")}><XCircle />{t("decision.REJECT")}</Button>
                </div>
              ) : (
                <Button asChild size="sm"><Link href="/approval-credential"><KeyRound />{t("review.setupCredential")}</Link></Button>
              )
            )}
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="space-y-5">
          <Section title={t("detail.section.application")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadField label={t("field.applicationType")} value={application.application_type_custom || application.application_type_label} />
              <ReadField label={t("field.discipline")} value={application.discipline_custom || application.discipline_label} />
              <ReadField label={t("field.workType")} value={application.work_type_custom || application.work_type_label} />
              <ReadField label={t("field.priority")} value={application.priority_custom || application.priority_label} />
              <ReadField label={t("field.workflow")} value={application.workflow_name} />
              <ReadField label={t("field.template")} value={application.template_name ? `${application.template_name} (v${application.template_version_number})` : ""} />
              <ReadField label={t("field.scheduleTask")} value={application.schedule_task_wbs ? `${application.schedule_task_wbs} - ${application.schedule_task_name}` : ""} />
              <ReadField label={t("field.inspectionCategory")} value={application.inspection_category ? t(`inspectionCategory.${application.inspection_category}`) : t("inspectionCategory.NONE")} />
            </div>
          </Section>
          <Section title={t("detail.section.site")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadField label={t("field.location")} value={application.location} />
              <ReadField label={t("field.component")} value={application.component} />
              <ReadField label={t("field.description")} value={application.description} className="sm:col-span-2" />
              <ReadField label={t("field.drawingNo")} value={application.drawing_no} />
              <ReadField label={t("field.drawingRevision")} value={application.drawing_revision} />
              <ReadField label={t("field.itpNo")} value={application.itp_no} />
              <ReadField label={t("field.checklistReference")} value={application.checklist_reference} />
              <ReadField label={t("field.requiredAt")} value={application.required_at ? new Date(application.required_at).toLocaleString() : ""} />
              <ReadField label={t("field.inspectionStartAt")} value={application.inspection_start_at ? new Date(application.inspection_start_at).toLocaleString() : ""} />
              <ReadField label={t("field.inspectionEndAt")} value={application.inspection_end_at ? new Date(application.inspection_end_at).toLocaleString() : ""} />
              <ReadField label={t("field.inspectionActivity")} value={application.custom_fields.inspection_activity} />
              <ReadField label={t("field.acceptanceRequirement")} value={application.custom_fields.acceptance_requirement} />
              {templateCustomFields.map((field) => (
                <ReadField
                  key={field.key}
                  label={`${field.label}${field.required ? " *" : ""}`}
                  value={application.custom_fields[field.key]}
                />
              ))}
            </div>
          </Section>
          <Section title={t("detail.section.evidence")} action={application.status === "DRAFT" && can("consultant.submit") ? <Button size="sm" variant="outline" onClick={() => setEvidenceOpen(true)}><Link2 />{t("evidence.link")}</Button> : undefined}>
            {!application.evidence_links.length ? <Empty text={t("evidence.empty")} /> : <div className="grid gap-3 sm:grid-cols-2">{application.evidence_links.map((link) => <a key={link.id} href={link.evidence_file} target="_blank" rel="noreferrer" className="flex min-w-0 gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-info/10 text-info"><ImageIcon className="size-5" /></span><div className="min-w-0"><p className="truncate font-medium">{link.caption || link.original_filename}</p><p className="truncate text-xs text-muted-foreground">{link.photographer_name || t("common.unknown")} - {new Date(link.captured_at).toLocaleString()}</p><p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{link.sha256}</p></div></a>)}</div>}
          </Section>
          <Section title={t("detail.section.attachments")} action={application.status === "DRAFT" && can("consultant.submit") ? <Button size="sm" variant="outline" onClick={() => setAttachmentOpen(true)}><Plus />{t("attachment.add")}</Button> : undefined}>
            {application.template_required_attachment_codes.length ? (
              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                {application.template_required_attachment_codes.map((code) => {
                  const attached = attachedCategories.has(code);
                  return (
                    <div key={code} className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${attached ? "border-success/30 bg-success/5 text-success" : "border-warning/30 bg-warning/5 text-warning"}`}>
                      {attached ? <CheckCircle2 className="size-4" /> : <Paperclip className="size-4" />}
                      <span className="font-medium">{t(`attachmentType.${code}`)}</span>
                      <span className="ml-auto text-xs">{t(attached ? "attachment.attached" : "attachment.required")}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {!application.attachments.length ? <Empty text={t("attachment.empty")} /> : <div className="divide-y rounded-lg border">{application.attachments.map((attachment) => <a key={attachment.id} href={attachment.file} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-3 p-3 transition-colors hover:bg-muted/30"><Paperclip className="size-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{attachment.original_name}</p><p className="truncate text-xs text-muted-foreground">{attachment.category || t("attachment.other")} - {formatBytes(attachment.byte_size)}</p></div></a>)}</div>}
          </Section>
        </div>

        <div className="space-y-5">
          <Section title={t("detail.section.consultant")}>
            <div className="space-y-4">
              <ReadField label={t("field.consultantCompany")} value={application.consultant_organization_name} />
              <ReadField label={t("field.consultant")} value={application.consultant_name} />
              <ReadField label={t("field.project")} value={application.project_name} />
              <ReadField label={t("field.projectAddress")} value={application.project_address} />
              <ReadField label={t("detail.receivedAt")} value={application.received_at ? `${new Date(application.received_at).toLocaleString()} - ${application.received_by_name ?? ""}` : ""} />
              <ReadField label={t("detail.acknowledgedAt")} value={application.acknowledged_at ? `${new Date(application.acknowledged_at).toLocaleString()} - ${application.acknowledged_by_name ?? ""}` : ""} />
            </div>
          </Section>
          <Section title={t("detail.section.approvalProgress")}>
            <div className="space-y-0">
              {application.review_steps.map((step, index) => (
                <div key={step.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < application.review_steps.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-border" />}
                  <span className={`z-10 grid size-8 shrink-0 place-items-center rounded-full border text-xs font-semibold ${step.status === "APPROVED" ? "border-success bg-success text-white" : step.status === "CURRENT" || step.status === "APPROVED_WITH_REMEDIAL" ? "border-warning bg-warning text-white" : step.status === "REJECTED" || step.status === "REVISE_RESUBMIT" ? "border-destructive bg-destructive text-white" : "bg-background text-muted-foreground"}`}>{step.sequence}</span>
                  <div className="min-w-0 pt-1"><p className="font-medium">{step.name}</p><p className="text-xs text-muted-foreground">{reviewerLabel(step, application, t)}</p><p className="mt-1 text-xs font-medium">{t(`stepStatus.${step.status}`)}</p></div>
                </div>
              ))}
            </div>
          </Section>
          {!!application.approval_actions.length && (
            <Section title={t("detail.section.decisions")}>
              <div className="space-y-3">{application.approval_actions.map((entry) => <div key={entry.id} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><p className="font-medium">{entry.actor_name}</p><StatusBadge label={t(`decision.${entry.decision}`)} tone={entry.decision === "APPROVE" ? "positive" : entry.decision === "REJECT" ? "danger" : "warning"} /></div><p className="mt-1 text-xs text-muted-foreground">{entry.step_name} - {new Date(entry.acted_at).toLocaleString()}</p>{entry.remarks && <p className="mt-2 text-sm">{entry.remarks}</p>}<div className="mt-3 flex gap-2"><a href={entry.signature_snapshot} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">{t("credential.signature")}</a>{entry.stamp_snapshot && <a href={entry.stamp_snapshot} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">{t("credential.stamp")}</a>}</div></div>)}</div>
            </Section>
          )}
          {!!application.archive_entries.length && (
            <Section title={t("detail.section.archive")}>
              <div className="space-y-2">{application.archive_entries.map((entry) => <div key={entry.id} className="flex items-center gap-3 rounded-lg border p-3"><FileArchive className="size-4 shrink-0 text-primary" /><div className="min-w-0"><p className="truncate text-sm font-medium">{entry.title}</p><p className="truncate font-mono text-[10px] text-muted-foreground">{entry.sha256 || t("archive.recordOnly")}</p></div></div>)}</div>
            </Section>
          )}
        </div>
      </div>

      {attachmentOpen && <AttachmentDialog application={application} onClose={() => setAttachmentOpen(false)} onSaved={() => { void refresh(); setAttachmentOpen(false); }} />}
      {evidenceOpen && <EvidenceDialog application={application} onClose={() => setEvidenceOpen(false)} onSaved={() => { void refresh(); setEvidenceOpen(false); }} />}
      {decision && <DecisionDialog application={application} decision={decision} onClose={() => setDecision(null)} onSaved={() => { void refresh(); void queryClient.invalidateQueries({ queryKey: ["approval-credential"] }); setDecision(null); }} />}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-lg border bg-card p-4 shadow-sm"><div className="mb-4 flex items-center justify-between gap-3"><SectionHeader title={title} />{action}</div>{children}</section>;
}

function AttachmentDialog({ application, onClose, onSaved }: { application: ConsultantApplication; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("consultantWorkflow");
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("OTHER");
  const [note, setNote] = useState("");
  const save = useMutation({ mutationFn: () => addApplicationAttachment(application.id, file as File, category, note), onSuccess: onSaved });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("attachment.title")}</DialogTitle><DialogDescription>{t("attachment.help")}</DialogDescription></DialogHeader><div className="space-y-4"><FieldWrapper label={t("attachment.file")} required><Input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></FieldWrapper><FieldWrapper label={t("attachment.category")}><Select value={category} onValueChange={setCategory}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{["CHECKLIST", "IFC_DRAWING", "SURVEY_REPORT", "MATERIAL_TEST", "CALIBRATION", "ITP", "OTHER"].map((value) => <SelectItem key={value} value={value}>{t(`attachmentType.${value}`)}</SelectItem>)}</SelectContent></Select></FieldWrapper><FieldWrapper label={t("attachment.note")}><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></FieldWrapper></div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button disabled={!file || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Paperclip />}{t("attachment.add")}</Button></DialogFooter></DialogContent></Dialog>;
}

function EvidenceDialog({ application, onClose, onSaved }: { application: ConsultantApplication; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("consultantWorkflow");
  const [evidence, setEvidence] = useState("");
  const [caption, setCaption] = useState("");
  const rows = useQuery({ queryKey: ["application-evidence-candidates", application.project], queryFn: () => getApplicationEvidenceCandidates(application.project) });
  const linkedIds = useMemo(() => new Set(application.evidence_links.map((link) => link.evidence)), [application.evidence_links]);
  const candidates = (rows.data?.results ?? []).filter((row) => !linkedIds.has(row.id));
  const save = useMutation({ mutationFn: () => linkApplicationEvidence(application.id, evidence, caption), onSuccess: onSaved });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t("evidence.title")}</DialogTitle><DialogDescription>{t("evidence.help")}</DialogDescription></DialogHeader>{rows.isLoading ? <div className="grid min-h-32 place-items-center"><Loader2 className="animate-spin" /></div> : <div className="space-y-3">{candidates.map((row) => <button type="button" key={row.id} onClick={() => setEvidence(row.id)} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${evidence === row.id ? "border-primary bg-primary/5" : "hover:bg-muted/30"}`}><ImageIcon className="size-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{row.original_filename}</p><p className="truncate text-xs text-muted-foreground">{row.photographer_name || t("common.unknown")} - {new Date(row.captured_at).toLocaleString()}</p></div>{evidence === row.id && <CheckCircle2 className="size-5 text-primary" />}</button>)}{!candidates.length && <Empty text={t("evidence.noCandidates")} />}<FieldWrapper label={t("evidence.caption")}><Input value={caption} onChange={(event) => setCaption(event.target.value)} /></FieldWrapper></div>}<DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button disabled={!evidence || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Link2 />}{t("evidence.link")}</Button></DialogFooter></DialogContent></Dialog>;
}

function DecisionDialog({ application, decision, onClose, onSaved }: { application: ConsultantApplication; decision: "APPROVE" | "APPROVE_WITH_REMEDIAL" | "REJECT" | "REVISE_RESUBMIT"; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("consultantWorkflow");
  const [remarks, setRemarks] = useState("");
  const [pin, setPin] = useState("");
  const save = useMutation({ mutationFn: () => reviewConsultantApplication(application.id, { decision, remarks, approval_pin: pin }), onSuccess: onSaved });
  const remarksRequired = decision !== "APPROVE";
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t(`review.dialog.${decision}.title`)}</DialogTitle><DialogDescription>{t(`review.dialog.${decision}.description`)}</DialogDescription></DialogHeader><div className="space-y-4"><FieldWrapper label={t("review.remarks")} required={remarksRequired}><Textarea rows={4} value={remarks} onChange={(event) => setRemarks(event.target.value)} /></FieldWrapper><FieldWrapper label={t("review.pin")} required hint={t("review.pinHint")}><Input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} /></FieldWrapper></div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button variant={decision === "REJECT" ? "destructive" : "default"} disabled={pin.length !== 6 || (remarksRequired && !remarks.trim()) || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : decision === "APPROVE" ? <ShieldCheck /> : decision === "REJECT" ? <XCircle /> : <RotateCcw />}{t(`decision.${decision}`)}</Button></DialogFooter></DialogContent></Dialog>;
}

function reviewerMatches(step: ApplicationReviewStep, application: ConsultantApplication, user: NonNullable<ReturnType<typeof useAuth>["user"]>) {
  if (step.reviewer_kind === "CONSULTANT") return application.consultant === user.id;
  if (step.reviewer_kind === "USER") return step.reviewer_user === user.id;
  return Boolean(step.reviewer_role && step.reviewer_role === user.role);
}

function reviewerLabel(step: ApplicationReviewStep, application: ConsultantApplication, t: ReturnType<typeof useTranslations<"consultantWorkflow">>) {
  if (step.reviewer_kind === "CONSULTANT") return t("review.reviewerConsultant", { name: application.consultant_name });
  if (step.reviewer_kind === "USER") return t("review.reviewerUser", { name: step.reviewer_user_name ?? "-" });
  return t("review.reviewerRole", { name: step.reviewer_role_name ?? "-" });
}

function statusTone(status: ConsultantApplication["status"]): "neutral" | "positive" | "warning" | "danger" | "info" {
  if (status === "APPROVED") return "positive";
  if (status === "REJECTED") return "danger";
  if (status === "SUBMITTED" || status === "REVISE_RESUBMIT" || status === "APPROVED_WITH_REMEDIAL") return "warning";
  if (status === "ARCHIVED") return "info";
  return "neutral";
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed bg-muted/15 p-6 text-center text-sm text-muted-foreground">{text}</div>;
}
