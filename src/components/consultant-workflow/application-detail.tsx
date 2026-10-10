"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  ClipboardCheck,
  History,
  KeyRound,
  Link2,
  Loader2,
  MailOpen,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  BadgeCheck,
  ExternalLink,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  ATTACHMENT_TYPES,
  AttachmentRows,
  EvidenceLinkCards,
  LockedNote,
  RelatedRecordRemove,
  RemoveSwitch,
} from "@/components/consultant-workflow/application-draft-edit";
import {
  ApplicationFormCard,
  printPdf,
} from "@/components/consultant-workflow/application-form-card";
import { useAuth } from "@/components/providers/auth-provider";
import { useFinishForm } from "@/components/shared/dialog-navigation";
import { ExportButton } from "@/components/shared/export-button";
import { RecordClosurePanel } from "@/components/shared/record-closure";
import {
  RecordDetailFrame,
  RecordDetailShell,
  RecordRecorder,
  ShellPanel,
  type ShellFact,
} from "@/components/shared/record-detail-shell";
import {
  FieldWrapper,
  LoadFailed,
  QueryFailedNote,
  ReadField,
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
import type {
  ApplicationReviewStep,
  ConsultantApplication,
  EvidenceCandidate,
  RemedialItem,
} from "@/interfaces/consultant-workflow";
import { ApiError } from "@/interfaces/api";
import { recordConversationKey } from "@/lib/record-chat";
import { recordPdfObjectUrl } from "@/services/contractor-ops.service";
import {
  addApplicationAttachment,
  addRemedialItem,
  closeRemedialItem,
  acknowledgeConsultantApplication,
  createApplicationRevision,
  downloadApplicationFinalReport,
  retryApplicationFinalReport,
  getApplicationEvidenceCandidates,
  getApplicationDocumentCandidates,
  linkApplicationDocumentAttachment,
  getApprovalCredential,
  getConsultantApplication,
  linkApplicationEvidence,
  receiveConsultantApplication,
  reviewConsultantApplication,
  submitConsultantApplication,
} from "@/services/consultant-workflow.service";

/**
 * One consultant application, in the record-detail frame every module
 * shares (E8, Q31).
 *
 * From the list, 「等你处理」 or anywhere inside the app it opens as the
 * popup over what was there - 「以弹窗显示」; `/consultant-applications/<id>`
 * typed, bookmarked or opened from a notification renders the same frame on a
 * page of its own (`presentation="page"`). Only the frame and the arrangement
 * changed: every field, button, permission and dialog is the one the page had.
 */
export function ConsultantApplicationDetail({
  id,
  presentation = "page",
  onClose,
}: {
  id: string;
  presentation?: "page" | "dialog";
  /** The dialog's close; going back by default (an intercepted address). */
  onClose?: () => void;
}) {
  const t = useTranslations("consultantWorkflow");
  const { user, can } = useAuth();
  // The frame draws its own dialog without the form-surface provider, so the
  // rule is told which surface this is.
  const finish = useFinishForm(presentation);
  const queryClient = useQueryClient();
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  // One arming switch per block (E6, spec rule 8): Remove buttons appear only
  // while it is on, and a press takes effect at once.
  const [evidenceArmed, setEvidenceArmed] = useState(false);
  const [recordsArmed, setRecordsArmed] = useState(false);
  const [attachmentsArmed, setAttachmentsArmed] = useState(false);
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
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["consultant-application", id] }),
      // Deciding archives the application with its final report, and that
      // closes its conversation (K09): the composer goes without a reload.
      queryClient.invalidateQueries({
        queryKey: recordConversationKey("CONSULTANT_APPLICATION", id),
      }),
    ]);
  const submit = useMutation({
    mutationFn: () => submitConsultantApplication(id),
    onSuccess: refresh,
  });
  const revision = useMutation({
    mutationFn: () => createApplicationRevision(id),
    // In the popup a push left the superseded revision in history: two closes
    // to reach the list (audit S3). The shared rule replaces it there, and on
    // a page of its own still moves forward.
    onSuccess: (row) => finish(`/consultant-applications/${row.id}`),
  });
  const receive = useMutation({
    mutationFn: () => receiveConsultantApplication(id),
    onSuccess: refresh,
  });
  const acknowledge = useMutation({
    mutationFn: () => acknowledgeConsultantApplication(id),
    onSuccess: refresh,
  });

  const frame = {
    presentation,
    onClose,
    backHref: "/consultant-applications",
    backLabel: t("applications.back"),
  };
  if (query.isLoading) {
    return (
      <RecordDetailFrame {...frame} title={t("applications.title")}>
        <div className="grid min-h-72 place-items-center"><Loader2 className="size-7 animate-spin text-primary" /></div>
      </RecordDetailFrame>
    );
  }
  if (query.isLoadingError || !query.data) {
    return (
      <RecordDetailFrame {...frame} title={t("applications.title")}>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-10 text-center text-sm text-destructive">{t("state.loadError")}</div>
      </RecordDetailFrame>
    );
  }

  const application = query.data;
  const attachedCategories = new Set(
    application.attachments.map((attachment) => attachment.category),
  );
  const templateCustomFields = application.template_field_schema.filter(
    (field) => !["inspection_activity", "acceptance_requirement"].includes(field.key),
  );
  const currentStep = application.review_steps.find((step) => step.status === "CURRENT");
  // A draft is a draft (E6): whoever may fill it in may correct what was
  // added. Submitted, the controls go and each block says why.
  const draftEditable = !application.is_locked && can("consultant.submit");
  const showLocked = application.is_locked && can("consultant.submit");
  const removableRecords = application.related_record_groups.some((group) =>
    group.records.some((record) => record.removable && record.evidence_link_ids.length),
  );
  const canAct = Boolean(
    currentStep && user && can("approval.review") && reviewerMatches(currentStep, application, user),
  );
  const action = (
    <>
      {/* Sending is on the A4 form card below (C1): the form it sends is
          the form shown there. */}
      {application.status === "DRAFT" && can("consultant.submit") && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/consultant-applications/${id}/edit`}><Pencil />{t("action.edit")}</Link>
        </Button>
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
      {/* The final approval report: 预览 · 打印 · 导出 · 发送 (PDF 统一操作规则). */}
      {application.final_report && (
        <ExportButton
          size="sm"
          formats={["pdf"]}
          label={t("action.downloadReport")}
          title={application.application_no}
          onExport={() => downloadApplicationFinalReport(application.id, application.application_no)}
        />
      )}
    </>
  );

  // 申请资料 then 现场申请, in the information grid. Optional since 2026-10
  // (C1): discipline, work type and priority are shown only when given.
  const facts: ShellFact[] = [
    { label: t("field.applicationType"), value: application.application_type_custom || application.application_type_label },
    ...(application.discipline_custom || application.discipline_label
      ? [{ label: t("field.discipline"), value: application.discipline_custom || application.discipline_label }]
      : []),
    ...(application.work_type_custom || application.work_type_label
      ? [{ label: t("field.workType"), value: application.work_type_custom || application.work_type_label }]
      : []),
    ...(application.priority_custom || application.priority_label
      ? [{ label: t("field.priority"), value: application.priority_custom || application.priority_label }]
      : []),
    { label: t("field.workflow"), value: application.workflow_name },
    { label: t("field.template"), value: application.template_name ? `${application.template_name} (v${application.template_version_number})` : "" },
    { label: t("field.scheduleTask"), value: application.schedule_task_wbs ? `${application.schedule_task_wbs} - ${application.schedule_task_name}` : "" },
    { label: t("field.inspectionCategory"), value: application.inspection_category ? t(`inspectionCategory.${application.inspection_category}`) : t("inspectionCategory.NONE") },
    { label: t("field.location"), value: application.location },
    { label: t(application.application_type_code === "MATERIAL_APPROVAL" || application.application_type_code === "MATERIAL_CERT_SUBMISSION" ? "field.material" : "field.component"), value: application.component },
    { label: t("field.description"), value: application.description, wide: true },
    { label: t("field.remarks"), value: application.remarks, wide: true },
    { label: t("field.drawingNo"), value: application.drawing_no },
    { label: t("field.drawingRevision"), value: application.drawing_revision },
    { label: t("field.itpNo"), value: application.itp_no },
    { label: t("field.additionalDisciplines"), value: application.additional_discipline_labels.join(", ") },
    { label: t("field.additionalWorkTypes"), value: application.additional_work_type_labels.join(", ") },
    { label: t("field.checklistReference"), value: application.checklist_reference },
    { label: t("field.requiredAt"), value: application.required_at ? new Date(application.required_at).toLocaleString() : "" },
    { label: t("field.inspectionStartAt"), value: application.inspection_start_at ? new Date(application.inspection_start_at).toLocaleString() : "" },
    { label: t("field.inspectionEndAt"), value: application.inspection_end_at ? new Date(application.inspection_end_at).toLocaleString() : "" },
    { label: t("field.inspectionTimezone"), value: application.inspection_timezone },
    { label: t("field.inspectionActivity"), value: application.custom_fields.inspection_activity },
    { label: t("field.acceptanceRequirement"), value: application.custom_fields.acceptance_requirement },
    ...templateCustomFields.map((field) => ({
      label: `${field.label}${field.required ? " *" : ""}`,
      value: application.custom_fields[field.key],
    })),
  ];

  return (
    <RecordDetailFrame
      {...frame}
      title={application.application_no}
      status={<StatusBadge label={t(`status.${application.status}`)} tone={statusTone(application.status)} />}
      description={`${application.project_name} - ${application.application_type_custom || application.application_type_label}`}
      caption={
        <>
          <p>{t("detail.revision", { revision: application.revision })}</p>
          <p>{t("detail.applicant", { name: application.applicant_name })}</p>
          {/* B15: raised on site, checked and sent on by the manager. */}
          {application.source_submitted_by_name && (
            <p>
              {t("detail.raisedOnSite", {
                name: application.source_submitted_by_name,
                when: application.source_submitted_at
                  ? new Date(application.source_submitted_at).toLocaleString()
                  : "",
              })}
            </p>
          )}
          {application.forwarded_by_name && (
            <p>
              {t("detail.forwardedBy", {
                name: application.forwarded_by_name,
                when: application.forwarded_at ? new Date(application.forwarded_at).toLocaleString() : "",
              })}
            </p>
          )}
        </>
      }
      headerActions={action}
      // 预览 / 导出 PDF / 分享 once, in the header like every record (E8):
      // for an application the record export is the A4 form (C17), so the
      // form card below keeps 打印 / 看附件 / 发送 and leaves these to here.
      exportRecord={{ kind: "CONSULTANT_APPLICATION", recordId: application.id, reference: application.application_no }}
    >
      <RecordDetailShell
        reference={application.application_no}
        facts={facts}
        recorder={<RecordRecorder record={application} />}
        panel={
          <div className="space-y-4">
            {/*
              The A4 application form (C1): 打印 prints the record export,
              which for an application is this form (C17); 发送给顾问 is the
              in-system send. 预览 / 导出 PDF are the same export, in the
              header.
            */}
            <ApplicationFormCard
              consultantName={application.consultant_name}
              attachmentCount={application.attachments.length}
              canSend={application.status === "DRAFT" && can("consultant.submit")}
              isSubmitting={submit.isPending}
              onSend={() => submit.mutate()}
              onPrint={() => printPdf(() => recordPdfObjectUrl("CONSULTANT_APPLICATION", application.id))}
              onShowAttachments={() =>
                document.getElementById("application-attachments")?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              exportButtons={null}
            />

            <ApplicationLifecycle application={application} />

            <Section
              title={t("detail.section.evidence")}
              action={
                draftEditable ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {application.evidence_links.length > 0 && (
                      <RemoveSwitch armed={evidenceArmed} onArmedChange={setEvidenceArmed} />
                    )}
                    <Button size="sm" variant="outline" onClick={() => setEvidenceOpen(true)}><Link2 />{t("evidence.link")}</Button>
                  </div>
                ) : showLocked ? <LockedNote /> : undefined
              }
            >
              {!application.evidence_links.length ? (
                <Empty text={t("evidence.empty")} />
              ) : (
                <EvidenceLinkCards
                  application={application}
                  editable={draftEditable}
                  armed={evidenceArmed}
                  onChanged={() => void refresh()}
                />
              )}
            </Section>
            <Section
              title={t("detail.section.relatedRecords")}
              action={
                draftEditable ? (
                  removableRecords ? <RemoveSwitch armed={recordsArmed} onArmedChange={setRecordsArmed} /> : undefined
                ) : showLocked && application.related_record_groups.length ? <LockedNote /> : undefined
              }
            >
              {!application.related_record_groups.length ? (
                <Empty text={t("state.noApplications")} />
              ) : (
                <div className="space-y-4">
                  {application.related_record_groups.map((group) => (
                    <div key={group.key}>
                      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{group.label}</p>
                      <div className="divide-y rounded-lg border">
                        {group.records.map((record) => {
                          const content = (
                            <>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{record.reference}</p>
                                <p className="mt-0.5 break-words text-xs text-muted-foreground">{record.title}</p>
                              </div>
                              <div className="shrink-0 text-right text-xs text-muted-foreground">
                                <p>{record.date ? new Date(record.date).toLocaleDateString() : "-"}</p>
                                <p>{record.created_by_name || "-"}</p>
                              </div>
                              {record.href && <ExternalLink className="size-4 shrink-0 text-primary" />}
                            </>
                          );
                          const row = record.href ? (
                            <Link href={record.href} className="flex min-w-0 flex-1 items-center gap-3 p-3 transition-colors hover:bg-muted/30">
                              {content}
                            </Link>
                          ) : (
                            <div className="flex min-w-0 flex-1 items-center gap-3 p-3">
                              {content}
                            </div>
                          );
                          return (
                            <div key={`${record.type}-${record.record_id}`} className="flex items-center gap-2 pr-3">
                              {row}
                              {draftEditable && recordsArmed && (
                                <RelatedRecordRemove application={application} record={record} onChanged={() => void refresh()} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
            <Section
              id="application-attachments"
              title={t("detail.section.attachments")}
              action={
                draftEditable ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {application.attachments.length > 0 && (
                      <RemoveSwitch armed={attachmentsArmed} onArmedChange={setAttachmentsArmed} />
                    )}
                    <Button size="sm" variant="outline" onClick={() => setAttachmentOpen(true)}><Plus />{t("attachment.add")}</Button>
                  </div>
                ) : showLocked ? <LockedNote /> : undefined
              }
            >
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
              {!application.attachments.length ? (
                <Empty text={t("attachment.empty")} />
              ) : (
                <AttachmentRows
                  application={application}
                  editable={draftEditable}
                  armed={attachmentsArmed}
                  onChanged={() => void refresh()}
                />
              )}
            </Section>
          </div>
        }
        // 版本记录 under the evidence, where every record keeps its 更正记录.
        corrections={
          <Section title={t("detail.section.revisions")}>
            <RevisionTimeline application={application} />
          </Section>
        }
        // 下一步: what is owed now, and the reviewer's decision buttons.
        actions={
          <div className="space-y-3">
            <div className="min-w-0">
              <h3 className="panel-title">{t("detail.nextAction")}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {nextActionText(application, currentStep, canAct, t)}
              </p>
              {currentStep && (
                <p className="mt-2 text-sm font-medium text-foreground">
                  {t("review.pending", { step: currentStep.name })} · {reviewerLabel(currentStep, application, t)}
                </p>
              )}
            </div>
            {currentStep && canAct && (
              credential.isError ? (
                <LoadFailed className="w-full" what={t("what.credential")} onRetry={() => credential.refetch()} />
              ) : credential.data ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <Button className="min-h-11 justify-start" onClick={() => setDecision("APPROVE")}><CheckCircle2 />{t("decision.APPROVE")}</Button>
                  <Button className="min-h-11 justify-start" variant="outline" onClick={() => setDecision("APPROVE_WITH_REMEDIAL")}><ClipboardCheck />{t("decision.APPROVE_WITH_REMEDIAL")}</Button>
                  <Button className="min-h-11 justify-start" variant="outline" onClick={() => setDecision("REVISE_RESUBMIT")}><RotateCcw />{t("decision.REVISE_RESUBMIT")}</Button>
                  <Button className="min-h-11 justify-start" variant="destructive" onClick={() => setDecision("REJECT")}><XCircle />{t("decision.REJECT")}</Button>
                </div>
              ) : (
                <Button asChild className="min-h-11 w-full"><Link href="/approval-credential"><KeyRound />{t("review.setupCredential")}</Link></Button>
              )
            )}
          </div>
        }
        aside={
          <>
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
              <div className="space-y-2">
                {application.review_steps.map((step) => (
                  <div key={step.id} className={`flex gap-3 rounded-lg border p-3 ${step.status === "APPROVED" ? "border-success/40 bg-success/5" : step.status === "CURRENT" || step.status === "APPROVED_WITH_REMEDIAL" ? "border-warning/40 bg-warning/5" : step.status === "REJECTED" || step.status === "REVISE_RESUBMIT" ? "border-destructive/40 bg-destructive/5" : "bg-muted/15"}`}>
                    <span className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${step.status === "APPROVED" ? "bg-success text-white" : step.status === "CURRENT" || step.status === "APPROVED_WITH_REMEDIAL" ? "bg-warning text-white" : step.status === "REJECTED" || step.status === "REVISE_RESUBMIT" ? "bg-destructive text-white" : "bg-muted text-muted-foreground"}`}>{step.sequence}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-medium">{step.name}</p>
                        <span className="text-xs font-semibold">{t(`stepStatus.${step.status}`)}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{reviewerLabel(step, application, t)}</p>
                      {step.decided_at && <p className="mt-1 text-xs text-muted-foreground">{new Date(step.decided_at).toLocaleString()}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
            {!!application.approval_actions.length && (
              <Section title={t("detail.section.decisions")}>
                <div className="space-y-3">{application.approval_actions.map((entry) => <div key={entry.id} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><p className="font-medium">{entry.actor_name}</p><StatusBadge label={t(`decision.${entry.decision}`)} tone={entry.decision === "APPROVE" ? "positive" : entry.decision === "REJECT" ? "danger" : "warning"} /></div><p className="mt-1 text-xs text-muted-foreground">{entry.step_name} - {new Date(entry.acted_at).toLocaleString()}</p>{entry.remarks && <p className="mt-2 text-sm">{entry.remarks}</p>}<div className="mt-3 flex gap-2"><a href={entry.signature_snapshot} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">{t("credential.signature")}</a>{entry.stamp_snapshot && <a href={entry.stamp_snapshot} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">{t("credential.stamp")}</a>}</div></div>)}</div>
              </Section>
            )}
            <RemedialSection application={application} onChanged={refresh} />
            <Section title={t("detail.section.archive")}>
              <ArchiveChecklist application={application} />
              {/* 【确认归档】 here, where 「等你处理」 leads (C4, X10): offered once
                  the application is archived with its report. The office's
                  act, so not the consultant it was sent to - which is why it
                  is not the shell's own `closure`, which has no such gate. */}
              {application.consultant !== user?.id && (
                <div className="mt-3">
                  <RecordClosurePanel kind="CONSULTANT_APPLICATION" recordId={application.id} />
                </div>
              )}
            </Section>
          </>
        }
      />

      {attachmentOpen && <AttachmentDialog application={application} onClose={() => setAttachmentOpen(false)} onSaved={() => { void refresh(); setAttachmentOpen(false); }} />}
      {evidenceOpen && <EvidenceDialog application={application} onClose={() => setEvidenceOpen(false)} onSaved={() => { void refresh(); setEvidenceOpen(false); }} />}
      {decision && <DecisionDialog application={application} decision={decision} onClose={() => setDecision(null)} onSaved={() => { void refresh(); void queryClient.invalidateQueries({ queryKey: ["approval-credential"] }); setDecision(null); }} />}
    </RecordDetailFrame>
  );
}

function ApplicationLifecycle({ application }: { application: ConsultantApplication }) {
  const t = useTranslations("consultantWorkflow");
  const submitted = application.status !== "DRAFT";
  const hasFinalReport = Boolean(application.final_report);
  const archived = Boolean(application.archived_at);
  const stages = [
    {
      key: "application",
      complete: submitted,
      current: !submitted,
    },
    {
      key: "approval",
      complete: hasFinalReport,
      current: submitted && !hasFinalReport,
    },
    {
      key: "final",
      complete: hasFinalReport,
      current: hasFinalReport && !archived,
    },
    {
      key: "archive",
      complete: archived,
      current: false,
    },
  ];

  return (
    <section aria-label={t("detail.lifecycle.title")} className="grid gap-2 sm:grid-cols-4">
      {stages.map((stage, index) => (
        <div
          key={stage.key}
          className={`flex min-h-20 items-center gap-3 rounded-lg border px-4 py-3 ${
            stage.complete
              ? "border-success/30 bg-success/5"
              : stage.current
                ? "border-primary/35 bg-primary/5"
                : "bg-muted/10 text-muted-foreground"
          }`}
        >
          <span className={`grid size-9 shrink-0 place-items-center rounded-full ${stage.complete ? "bg-success text-white" : stage.current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {stage.complete ? <CheckCircle2 className="size-5" /> : index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold">{t(`detail.lifecycle.${stage.key}`)}</p>
            <p className="text-sm leading-5">{t(stage.complete ? "detail.lifecycle.complete" : stage.current ? "detail.lifecycle.current" : "detail.lifecycle.pending")}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

function RevisionTimeline({ application }: { application: ConsultantApplication }) {
  const t = useTranslations("consultantWorkflow");
  if (!application.revision_chain.length) return <Empty text={t("detail.noRevisions")} />;

  return (
    <div className="space-y-2">
      {application.revision_chain.map((row) => {
        const timestamp = row.archived_at || row.finalized_at || row.submitted_at;
        return (
          <Link
            key={row.id}
            href={`/consultant-applications/${row.id}`}
            aria-current={row.is_current ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/35 ${row.is_current ? "border-primary/35 bg-primary/5" : "bg-background"}`}
          >
            <span className={`grid size-9 shrink-0 place-items-center rounded-full ${row.is_current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              <History className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{t("detail.revision", { revision: row.revision })}</p>
                {row.is_current && <span className="text-xs font-semibold text-primary">{t("detail.revisionCurrent")}</span>}
              </div>
              <p className="truncate text-xs text-muted-foreground">{row.application_no}</p>
              {timestamp && <p className="mt-1 text-xs text-muted-foreground">{new Date(timestamp).toLocaleString()}</p>}
            </div>
            <StatusBadge label={t(`status.${row.status}`)} tone={statusTone(row.status)} />
          </Link>
        );
      })}
    </div>
  );
}

/** Decisions that are final, and therefore owe a report. Mirrors the backend. */
const DECIDED = ["APPROVED", "APPROVED_WITH_REMEDIAL", "REJECTED"];

function ArchiveChecklist({ application }: { application: ConsultantApplication }) {
  const t = useTranslations("consultantWorkflow");
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const kinds = ["APPLICATION", "APPROVAL", "FINAL_REPORT"] as const;

  /*
    The decision is the act; the PDF is only its record. When archiving fails
    the application stays decided and this row reads "pending" forever - the
    recovery existed on the backend from the start and no screen offered it,
    so the only way out was a developer with a shell (F-101).
  */
  const retry = useMutation({
    mutationFn: () => retryApplicationFinalReport(application.id),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["consultant-application", application.id],
        }),
        queryClient.invalidateQueries({
          queryKey: recordConversationKey("CONSULTANT_APPLICATION", application.id),
        }),
      ]),
  });
  const reportOwedButMissing =
    !application.final_report && DECIDED.includes(application.final_decision);

  return (
    <div className="space-y-2">
      {kinds.map((kind) => {
        const entry = application.archive_entries.find((row) => row.kind === kind);
        return (
          <div key={kind} className={`flex items-start gap-3 rounded-lg border p-3 ${entry ? "border-success/30 bg-success/5" : "bg-muted/10"}`}>
            <span className={`grid size-9 shrink-0 place-items-center rounded-full ${entry ? "bg-success text-white" : "bg-muted text-muted-foreground"}`}>
              {entry ? <CheckCircle2 className="size-5" /> : <CircleDashed className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{t(`archive.kind.${kind}`)}</p>
                <span className={`text-xs font-semibold ${entry ? "text-success" : "text-muted-foreground"}`}>
                  {t(entry ? "archive.complete" : "archive.pending")}
                </span>
              </div>
              {entry?.sha256 && <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">SHA-256: {entry.sha256}</p>}
              {kind === "FINAL_REPORT" && !entry && reportOwedButMissing && can("approval.review") && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {t("archive.reportMissing")}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate()}
                  >
                    {retry.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <RotateCcw />
                    )}
                    {t("action.retryReport")}
                  </Button>
                </div>
              )}
              {kind === "FINAL_REPORT" && entry && (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold">
                  <ExportButton
                    size="sm"
                    formats={["pdf"]}
                    label={t("action.downloadReport")}
                    title={application.application_no}
                    onExport={() => downloadApplicationFinalReport(application.id, application.application_no)}
                  />
                  {application.verification_code && (
                    <Link href={`/verify/application/${application.verification_code}`} className="text-primary hover:underline">
                      {t("archive.verify")}
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function nextActionText(
  application: ConsultantApplication,
  currentStep: ApplicationReviewStep | undefined,
  canAct: boolean,
  t: ReturnType<typeof useTranslations<"consultantWorkflow">>,
) {
  if (application.status === "DRAFT") return t("detail.next.draft");
  if (application.status === "REVISE_RESUBMIT") return t("detail.next.revise");
  if (application.status === "SUBMITTED" && canAct) return t("detail.next.review");
  if (application.status === "SUBMITTED" && currentStep) {
    return t("detail.next.waiting", { step: currentStep.name });
  }
  if (application.archived_at) return t("detail.next.archived");
  if (application.final_report) return t("detail.next.final");
  return t("detail.next.complete");
}

/**
 * What is still owed after an approval given on condition, and closing it.
 *
 * Raising an item is the reviewer's finding; closing it is the contractor's
 * work, and it needs a note and evidence — the API refuses a bare tick, and so
 * does the button. Without that, a conditional approval could be marked done
 * with nothing behind it, which is exactly the hole this panel fills.
 */
function RemedialSection({
  application,
  onChanged,
}: {
  application: ConsultantApplication;
  onChanged: () => void;
}) {
  const t = useTranslations("consultantWorkflow");
  const { can } = useAuth();
  const [raising, setRaising] = useState(false);
  const [closing, setClosing] = useState<RemedialItem | null>(null);
  const items = application.remedial_items ?? [];

  if (!items.length && !can("approval.review")) return null;

  return (
    <Section
      title={t("detail.section.remedial")}
      action={
        can("approval.review") && !application.is_locked ? (
          <Button size="sm" variant="outline" onClick={() => setRaising(true)}>
            <Plus />
            {t("action.raiseRemedial")}
          </Button>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("remedial.empty")}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">{item.description}</p>
                <StatusBadge
                  label={
                    item.status === "CLOSED"
                      ? t("remedial.closed")
                      : item.is_overdue
                        ? t("remedial.overdue")
                        : t("remedial.open")
                  }
                  tone={
                    item.status === "CLOSED"
                      ? "positive"
                      : item.is_overdue
                        ? "danger"
                        : "warning"
                  }
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {[
                  item.assigned_to_name ?? t("remedial.unassigned"),
                  item.due_on ? t("remedial.dueOn", { date: item.due_on }) : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {item.status === "CLOSED" && (
                <p className="mt-2 text-sm">
                  {item.closure_note}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t("remedial.closedBy", {
                      name: item.closed_by_name ?? "",
                      when: item.closed_at
                        ? new Date(item.closed_at).toLocaleString()
                        : "",
                      count: item.evidence.length,
                    })}
                  </span>
                </p>
              )}
              {item.status === "OPEN" && can("consultant.submit") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => setClosing(item)}
                >
                  <CheckCircle2 />
                  {t("action.closeRemedial")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {raising && (
        <RaiseRemedialDialog
          application={application}
          onClose={() => setRaising(false)}
          onSaved={() => {
            setRaising(false);
            onChanged();
          }}
        />
      )}
      {closing && (
        <CloseRemedialDialog
          application={application}
          item={closing}
          onClose={() => setClosing(null)}
          onSaved={() => {
            setClosing(null);
            onChanged();
          }}
        />
      )}
    </Section>
  );
}

function RaiseRemedialDialog({
  application,
  onClose,
  onSaved,
}: {
  application: ConsultantApplication;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("consultantWorkflow");
  const [description, setDescription] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () =>
      addRemedialItem(application.id, {
        description: description.trim(),
        due_on: dueOn || null,
      }),
    onSuccess: onSaved,
    onError: (failure) =>
      setError(
        failure instanceof ApiError
          ? Object.values(failure.errors)[0] || failure.message
          : t("remedial.failed"),
      ),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("remedial.raiseTitle")}</DialogTitle>
          <DialogDescription>{t("remedial.raiseHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={t("remedial.description")} required>
            <Textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("remedial.dueDate")} hint={t("remedial.dueHint")}>
            <Input
              type="date"
              value={dueOn}
              onChange={(event) => setDueOn(event.target.value)}
            />
          </FieldWrapper>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[[description, t("remedial.description")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Plus />
            {t("action.raiseRemedial")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseRemedialDialog({
  application,
  item,
  onClose,
  onSaved,
}: {
  application: ConsultantApplication;
  item: RemedialItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("consultantWorkflow");
  const [note, setNote] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState("");
  const candidates = useQuery({
    queryKey: ["consultant-evidence-candidates", application.project],
    queryFn: () => getApplicationEvidenceCandidates(application.project),
  });
  const save = useMutation({
    mutationFn: () =>
      closeRemedialItem(application.id, {
        item: item.id,
        closure_note: note.trim(),
        evidence: chosen,
      }),
    onSuccess: onSaved,
    onError: (failure) =>
      setError(
        failure instanceof ApiError
          ? Object.values(failure.errors)[0] || failure.message
          : t("remedial.failed"),
      ),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("remedial.closeTitle")}</DialogTitle>
          <DialogDescription>{t("remedial.closeHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <p className="rounded-md border bg-muted/30 p-3 text-sm">
            {item.description}
          </p>
          <FieldWrapper label={t("remedial.closureNote")} required>
            <Textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("remedial.evidence")}
            required
            hint={t("remedial.evidenceHint")}
          >
            <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border p-3">
              {(candidates.data?.results ?? []).map((asset) => (
                <label
                  key={asset.id}
                  className="flex items-center gap-2 text-sm"
                  htmlFor={`remedial-evidence-${asset.id}`}
                >
                  <Checkbox
                    id={`remedial-evidence-${asset.id}`}
                    checked={chosen.includes(asset.id)}
                    onCheckedChange={(checked) =>
                      setChosen(
                        checked
                          ? [...chosen, asset.id]
                          : chosen.filter((id) => id !== asset.id),
                      )
                    }
                  />
                  <span className="truncate">
                    {asset.original_filename} ·{" "}
                    {new Date(asset.captured_at).toLocaleString()}
                  </span>
                </label>
              ))}
              <QueryFailedNote query={candidates} what={t("what.evidenceCandidates")} />
              {!candidates.isLoading &&
                !candidates.isError &&
                !(candidates.data?.results ?? []).length && (
                  <p className="text-sm text-muted-foreground">
                    {t("remedial.noEvidence")}
                  </p>
                )}
            </div>
          </FieldWrapper>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [note, t("remedial.closureNote")],
              [chosen.length, t("remedial.evidence")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <CheckCircle2 />
            {t("action.closeRemedial")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One of the application's panels, in the shell's panel surface (E8). */
function Section({ id, title, action, children }: { id?: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  const panel = <ShellPanel title={title} aside={action}>{children}</ShellPanel>;
  // An anchor the A4 card's 看附件 scrolls to; the shell's panel takes no id.
  return id ? <div id={id} className="scroll-mt-20">{panel}</div> : panel;
}

function AttachmentDialog({ application, onClose, onSaved }: { application: ConsultantApplication; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("consultantWorkflow");
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("OTHER");
  const [note, setNote] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const documents = useQuery({ queryKey: ["application-document-candidates", application.project, librarySearch], queryFn: () => getApplicationDocumentCandidates(application.project, librarySearch || undefined), enabled: libraryOpen });
  const save = useMutation({ mutationFn: () => addApplicationAttachment(application.id, file as File, category, note), onSuccess: onSaved });
  const link = useMutation({ mutationFn: (version: string) => linkApplicationDocumentAttachment(application.id, version, category, note), onSuccess: onSaved });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{t("attachment.title")}</DialogTitle><DialogDescription>{t("attachment.help")}</DialogDescription></DialogHeader><div className="space-y-4"><Button type="button" variant="outline" onClick={() => setLibraryOpen((value) => !value)}><ClipboardCheck />{t("attachment.fromArchive")}</Button>{libraryOpen && <div className="space-y-2 rounded-lg border p-3"><Input placeholder={t("attachment.searchArchive")} value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} />{documents.isLoading ? <Loader2 className="animate-spin" /> : documents.isError ? <LoadFailed what={t("what.archiveDocuments")} onRetry={() => documents.refetch()} /> : <div className="max-h-56 space-y-2 overflow-y-auto">{(documents.data?.results ?? []).filter((doc) => doc.latest_version).map((doc) => <button type="button" key={doc.id} className="flex w-full items-center justify-between rounded border p-2 text-left hover:bg-muted/30" onClick={() => doc.latest_version && link.mutate(doc.latest_version.id)} disabled={link.isPending}><span className="min-w-0"><span className="block truncate font-medium">{doc.document_no} · {doc.title}</span><span className="block truncate text-xs text-muted-foreground">{doc.category_name} {doc.subcategory_name ? `· ${doc.subcategory_name}` : ""} · {doc.latest_version?.original_name}</span></span><ExternalLink className="size-4 shrink-0" /></button>)}{!documents.data?.results?.length && <Empty text={t("attachment.noArchive")} />}</div>}</div>}<FieldWrapper label={t("attachment.file")} required><Input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></FieldWrapper><FieldWrapper label={t("attachment.category")}><Select value={category} onValueChange={setCategory}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{ATTACHMENT_TYPES.map((value) => <SelectItem key={value} value={value}>{t(`attachmentType.${value}`)}</SelectItem>)}</SelectContent></Select></FieldWrapper><FieldWrapper label={t("attachment.note")}><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></FieldWrapper></div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[file, t("attachment.file")]]} disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Paperclip />}{t("attachment.add")}</Button></DialogFooter></DialogContent></Dialog>;
}

function EvidenceDialog({ application, onClose, onSaved }: { application: ConsultantApplication; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("consultantWorkflow");
  const [selected, setSelected] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [uploader, setUploader] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const rows = useQuery({
    queryKey: ["application-evidence-candidates", application.project, search, dateFrom, dateTo, category, subcategory, uploader],
    queryFn: () => getApplicationEvidenceCandidates(application.project, {
      search: search || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      category: category || undefined,
      subcategory: subcategory || undefined,
      uploader: uploader || undefined,
    }),
  });
  const linkedIds = useMemo(() => new Set(application.evidence_links.map((link) => link.evidence)), [application.evidence_links]);
  const candidates = (rows.data?.results ?? []).filter((row) => !linkedIds.has(row.id));
  const groups = useMemo(() => {
    const grouped = new Map<string, { key: string; rows: EvidenceCandidate[] }>();
    for (const row of candidates) {
      const key = row.record_key || `${row.source_model}:${row.source_id}`;
      const existing = grouped.get(key);
      if (existing) existing.rows.push(row);
      else grouped.set(key, { key, rows: [row] });
    }
    return Array.from(grouped.values());
  }, [candidates]);
  const save = useMutation({ mutationFn: () => linkApplicationEvidence(application.id, selected, caption), onSuccess: onSaved });
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleGroup = (group: (typeof groups)[number]) => {
    const ids = group.rows.map((row) => row.id);
    const allSelected = ids.every((id) => selected.includes(id));
    setSelected((current) => allSelected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids])));
  };
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl"><DialogHeader><DialogTitle>{t("evidence.title")}</DialogTitle><DialogDescription>{t("evidence.help")}</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Input placeholder={t("evidence.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} /><Input placeholder={t("evidence.category")} value={category} onChange={(event) => setCategory(event.target.value)} /><Input placeholder={t("evidence.subcategory")} value={subcategory} onChange={(event) => setSubcategory(event.target.value)} /><Input placeholder={t("evidence.uploader")} value={uploader} onChange={(event) => setUploader(event.target.value)} /><Input type="date" aria-label={t("evidence.dateFrom")} value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} /><Input type="date" aria-label={t("evidence.dateTo")} value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></div>{rows.isLoading ? <div className="grid min-h-32 place-items-center"><Loader2 className="animate-spin" /></div> : rows.isError ? <LoadFailed what={t("what.evidenceCandidates")} onRetry={() => rows.refetch()} /> : <div className="space-y-3"><FieldWrapper label={t("evidence.selectPhotos")} required><div className="max-h-[58dvh] space-y-3 overflow-y-auto pr-1">{groups.map((group) => { const ids = group.rows.map((row) => row.id); const allSelected = ids.every((id) => selected.includes(id)); const open = expanded === group.key; const first = group.rows[0]; return <div key={group.key} className={`rounded-lg border ${allSelected ? "border-primary ring-2 ring-primary/20" : ""}`}><div className="flex items-start gap-3 p-3"><Checkbox checked={allSelected} onCheckedChange={() => toggleGroup(group)} aria-label={t("evidence.selectRecord")} /><button type="button" className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => setExpanded(open ? null : group.key)}><span className="mt-0.5 shrink-0">{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</span><span className="min-w-0"><span className="block truncate font-medium">{first.record_reference} · {first.record_type_label} · {first.record_title}</span><span className="block text-xs text-muted-foreground">{first.project_name || t("common.emptyValue")} · {first.category || t("common.emptyValue")} {first.subcategory ? `· ${first.subcategory}` : ""}</span><span className="block text-xs text-muted-foreground">{group.rows.length} {t("evidence.recordPhotos")} · {first.record_uploader || first.photographer_name || t("common.unknown")} · {first.record_date ? new Date(first.record_date).toLocaleString() : new Date(first.captured_at).toLocaleString()}</span></span></button></div>{open && <div className="grid gap-3 border-t bg-muted/20 p-3 sm:grid-cols-4">{group.rows.map((row) => { const checked = selected.includes(row.id); const image = row.watermarked_file || row.file; return <div key={row.id} className={`rounded-md border bg-card p-2 ${checked ? "border-primary" : ""}`}><div className="relative aspect-[4/3] overflow-hidden rounded bg-muted">{row.kind === "PHOTO" ? <Image src={image} alt={row.original_filename} fill unoptimized className="object-cover" /> : <div className="grid h-full place-items-center p-2 text-center text-xs text-muted-foreground">{row.original_filename}</div>}</div><label className="mt-2 flex items-start gap-2 text-xs"><Checkbox checked={checked} onCheckedChange={() => toggle(row.id)} /><span className="min-w-0"><span className="block truncate font-medium">{row.original_filename}</span><span className="block text-muted-foreground">{new Date(row.captured_at).toLocaleString()} · {t("evidence.gps")} {row.latitude ?? "-"}, {row.longitude ?? "-"}</span><span className="block text-muted-foreground">{row.photographer_name || t("common.unknown")} · {row.watermark_text ? t("evidence.watermarked") : ""}</span></span></label></div>; })}</div>}</div>; })}{!groups.length && <Empty text={t("evidence.noCandidates")} />}</div></FieldWrapper><div className="flex flex-wrap items-end gap-3"><FieldWrapper label={t("evidence.caption")} className="min-w-64 flex-1"><Input value={caption} onChange={(event) => setCaption(event.target.value)} /></FieldWrapper><p className="pb-2 text-sm font-medium text-primary">{selected.length} / {candidates.length}</p></div></div>}<DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[selected.length, t("evidence.selectPhotos")]]} disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Link2 />}{t("evidence.link")} ({selected.length})</Button></DialogFooter></DialogContent></Dialog>;
}

function DecisionDialog({ application, decision, onClose, onSaved }: { application: ConsultantApplication; decision: "APPROVE" | "APPROVE_WITH_REMEDIAL" | "REJECT" | "REVISE_RESUBMIT"; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("consultantWorkflow");
  const [remarks, setRemarks] = useState("");
  const [pin, setPin] = useState("");
  const save = useMutation({ mutationFn: () => reviewConsultantApplication(application.id, { decision, remarks, approval_pin: pin }), onSuccess: onSaved });
  const remarksRequired = decision !== "APPROVE";
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t(`review.dialog.${decision}.title`)}</DialogTitle><DialogDescription>{t(`review.dialog.${decision}.description`)}</DialogDescription></DialogHeader><div className="space-y-4"><FieldWrapper label={t("review.remarks")} required={remarksRequired}><Textarea rows={4} value={remarks} onChange={(event) => setRemarks(event.target.value)} /></FieldWrapper><FieldWrapper label={t("review.pin")} required hint={t("review.pinHint")}><Input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} /></FieldWrapper></div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button variant={decision === "REJECT" ? "destructive" : "default"} requires={[[pin.length === 6, t("review.pin")], [!remarksRequired || remarks, t("review.remarks")]]} disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : decision === "APPROVE" ? <ShieldCheck /> : decision === "REJECT" ? <XCircle /> : <RotateCcw />}{t(`decision.${decision}`)}</Button></DialogFooter></DialogContent></Dialog>;
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

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed bg-muted/15 p-6 text-center text-sm text-muted-foreground">{text}</div>;
}
