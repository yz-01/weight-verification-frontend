"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Archive,
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
  AttachmentRows,
  EvidenceLinkCards,
  LockedNote,
  RelatedRecordRemove,
  RemoveSwitch,
} from "@/components/consultant-workflow/application-draft-edit";
import { AttachmentDialog, RequiredAttachmentTile } from "@/components/consultant-workflow/attachment-slots";
import { AttachmentPicker } from "@/components/shared/attachment-picker";
import { RecordCorrectionHistory } from "@/components/shared/record-correction";
import { ApplicationA4PreviewButton } from "@/components/consultant-workflow/application-a4-preview";
import {
  ApplicationFormCard,
  printPdf,
} from "@/components/consultant-workflow/application-form-card";
import {
  ApplicationConsultantFormPanel,
  FORM_FILE_ACCEPT,
  signingChoices,
  signingNeeds,
  type Signing,
} from "@/components/consultant-workflow/consultant-own-form";
import { ConsultantProjectPicker } from "@/components/consultant-workflow/project-scope-picker";
import { useAuth } from "@/components/providers/auth-provider";
import { useFinishForm } from "@/components/shared/dialog-navigation";
import { ExportButton } from "@/components/shared/export-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DeleteRecordButton, useNotArchivedReason } from "@/components/shared/delete-record-button";
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
  ConsultantFormArchiveSnapshot,
  EvidenceCandidate,
  RemedialItem,
  RemedialRound,
} from "@/interfaces/consultant-workflow";
import { ApiError } from "@/interfaces/api";
import { builtinCategoryKey, groupModules, MODULE_LABEL_PATH, subcategoriesOf } from "@/lib/evidence-filters";
import { useArchiveLocksChanges } from "@/lib/archive-policy";
import { useDebounce } from "@/hooks/use-debounce";
import { recordConversationKey } from "@/lib/record-chat";
import { signsWithCredential } from "@/lib/sign-off";
import { recordPdfObjectUrl } from "@/services/contractor-ops.service";
import { signFileAction } from "@/services/file-action.service";
import {
  addRemedialItem,
  submitRemedialItem,
  reviewRemedialItem,
  acknowledgeConsultantApplication,
  createApplicationRevision,
  downloadApplicationFinalReport,
  retryApplicationFinalReport,
  getApplicationEvidenceCandidates,
  getEvidenceFilterOptions,
  getApprovalCredential,
  getConsultantApplication,
  linkApplicationEvidence,
  receiveConsultantApplication,
  reviewConsultantApplication,
  submitConsultantApplication,
  confirmConsultantApplication,
  deleteConsultantApplication,
} from "@/services/consultant-workflow.service";
import { FileThumbs } from "@/components/shared/file-thumbs";
import { isImageFile, PhotoLink } from "@/components/shared/photo-link";

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
  const [tileArchive, setTileArchive] = useState<string | null>(null);
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
  // JB25 (客户 10-26 事项 1 第 4 点): draft → 确认归档 (locked) → 发送给顾问.
  const draftWords = useTranslations("draftRecords");
  const notArchived = useNotArchivedReason();
  const [confirming, setConfirming] = useState(false);
  const confirmDraft = useMutation({
    mutationFn: () => confirmConsultantApplication(id),
    onSuccess: () => {
      setConfirming(false);
      return refresh();
    },
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
  // 「归档后锁定记录」 for this application's project (JB214-3d).
  const archiveLocks = useArchiveLocksChanges(query.data?.project);

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
    // JB203-12 (audit P2-4): a consultant reads one project at a time (the
    // top bar's), so a notice about an application on their other project
    // came here. Saying so, with the same picker, is the way forward.
    const otherProject =
      user?.account_type === "CONSULTANT" &&
      (user.consultant_projects ?? []).filter((project) => project.is_current).length > 1;
    return (
      <RecordDetailFrame {...frame} title={t("applications.title")}>
        {otherProject ? (
          <div data-slot="other-project" className="space-y-3 rounded-lg border border-info/30 bg-info/5 p-6 text-sm">
            <p>{t("state.otherProject")}</p>
            <ConsultantProjectPicker value={user?.active_project?.project_id ?? ""} onChange={() => undefined} />
          </div>
        ) : (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-10 text-center text-sm text-destructive">{t("state.loadError")}</div>
        )}
      </RecordDetailFrame>
    );
  }

  const application = query.data;
  const templateCustomFields = application.template_field_schema.filter(
    (field) => !["inspection_activity", "acceptance_requirement"].includes(field.key),
  );
  const currentStep = application.review_steps.find((step) => step.status === "CURRENT");
  // A draft is a draft (E6): whoever may fill it in may correct what was
  // added. Submitted, the controls go and each block says why.
  // Confirmed is its archive (JB25): a confirmed draft not yet sent is still
  // changed (Lucas 10-30 evening) - unless MSE locked its project (JB214-3d);
  // once sent, it is the consultant's.
  const openDraft =
    !application.is_locked || (application.status === "DRAFT" && !archiveLocks);
  const draftEditable = openDraft && can("consultant.submit");
  // JB25: confirmed (or sent) - only then printed, exported and sent.
  const confirmed = application.is_confirmed ?? application.status !== "DRAFT";
  const draftOpen = application.status === "DRAFT" && openDraft && can("consultant.submit") && !user?.is_field_staff;
  const showLocked = !openDraft && can("consultant.submit");
  const removableRecords = application.related_record_groups.some((group) =>
    group.records.some((record) => record.removable && record.evidence_link_ids.length),
  );
  const canAct = Boolean(
    currentStep && user && can("approval.review") && reviewerMatches(currentStep, application, user),
  );
  // JB203-2 (Lucas 11-16 audit): the returned version keeps its status, so
  // 【建立新版本】 stayed after the new one was made. It goes once there is one.
  const laterRevision = laterRevisionOf(application);
  const action = (
    <>
      {/* Sending is on the A4 form card below (C1): the form it sends is
          the form shown there. */}
      {draftOpen && (
        <>
          <Button asChild variant="outline" size="sm">
            <Link href={`/consultant-applications/${id}/edit`}><Pencil />{t("action.edit")}</Link>
          </Button>
          <Button size="sm" data-slot="confirm-archive" onClick={() => setConfirming(true)}>
            <Archive />
            {draftWords("confirmArchive")}
          </Button>
          {/* 删除 last in the row (JB166). */}
          <DeleteRecordButton
            what={application.application_no}
            onDelete={() => deleteConsultantApplication(application.id)}
            onDeleted={() => finish("/consultant-applications")}
          />
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={draftWords("confirmArchiveTitle", { what: application.application_no })}
            description={draftWords("confirmArchiveBody")}
            confirmLabel={draftWords("confirmArchive")}
            confirmIcon={Archive}
            variant="default"
            isPending={confirmDraft.isPending}
            onConfirm={() => confirmDraft.mutate()}
          />
        </>
      )}
      {application.status === "REVISE_RESUBMIT" && !laterRevision && can("consultant.submit") && (
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
          // His own 顾问申请 / 资料包 work: as before, 「导出」 or not (JB210).
          ownWork
          size="sm"
          formats={["pdf"]}
          label={t(reportMadeAtSigning(application) ? "action.downloadReportBeforeReview" : "action.downloadReport")}
          title={application.application_no}
          record={{ kind: "CONSULTANT_APPLICATION", id: application.id }}
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
      exportRecord={{
        kind: "CONSULTANT_APPLICATION",
        recordId: application.id,
        reference: application.application_no,
        blockedReason: confirmed ? undefined : notArchived,
      }}
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
              onPrint={async () => {
                // 打印 asks for the person's own PIN and is logged (JB27).
                const signed = await signFileAction("PRINT", {
                  subject: application.application_no,
                  record_kind: "CONSULTANT_APPLICATION",
                  record_id: application.id,
                  project: application.project,
                  link: window.location.pathname,
                });
                if (signed) await printPdf(() => recordPdfObjectUrl("CONSULTANT_APPLICATION", application.id));
              }}
              onShowAttachments={() =>
                document.getElementById("application-attachments")?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              exportButtons={null}
              a4Preview={
                // 「A4 预览」 (JB163): the formal form, for every type and
                // every status - a draft not yet confirmed too: looking is
                // not exporting (JB25, JB27).
                <ApplicationA4PreviewButton source={() => ({ kind: "saved", id: application.id })} />
              }
              sendBlockedReason={
                application.consultant_form && !application.form_files?.some((row) => row.kind === "FILLED")
                  ? t("ownForm.sendNeedsFilled")
                  : !confirmed
                    ? draftWords("sendNeedsArchive")
                    : undefined
              }
              printBlockedReason={confirmed ? undefined : notArchived}
            />

            {/* B, the consultant's own form (2026-10-10): the blank form, the
                filled form (required before sending) and the signed final
                version, each previewed here. */}
            <ApplicationConsultantFormPanel
              application={application}
              editable={draftEditable}
              reviewer={canAct}
              locked={showLocked}
              onChanged={() => void refresh()}
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
                // JB203W (walk F-2): its own words, not the list's 「该项目没有
                // 符合条件的顾问申请」.
                <Empty text={t("detail.noRelatedRecords")} />
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
                  {application.template_required_attachment_codes.map((code) => (
                    <RequiredAttachmentTile
                      key={code}
                      application={application}
                      code={code}
                      editable={draftEditable}
                      canArchive
                      onChanged={() => void refresh()}
                      onPickFromArchive={() => setTileArchive(code)}
                    />
                  ))}
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
          <div className="space-y-4">
            <Section title={t("detail.section.revisions")}>
              <RevisionTimeline application={application} />
            </Section>
            {/* 修改记录: every change after 确认归档, as on the site records (Lucas 10-30 evening). */}
            <RecordCorrectionHistory kind="CONSULTANT_APPLICATION" recordId={application.id} />
          </div>
        }
        // 下一步: what is owed now, and the reviewer's decision buttons.
        actions={
          <div className="space-y-3">
            <div className="min-w-0">
              <h3 className="panel-title">{t("detail.nextAction")}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {nextActionText(application, currentStep, canAct, t, {
                  canSubmit: can("consultant.submit"),
                  canRaise: canRaiseRemedial(application, user?.id, can),
                })}
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
              ) : currentStep.requires_stamp && !application.consultant_form && signsWithCredential(credential.data) && !credential.data?.stamp ? (
                // JB203-11 (Lucas 11-16 audit): the step needs the stamp and
                // there is none - said before the PIN is typed, not after.
                <div data-slot="stamp-missing" className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                  <p>{t("review.stampMissing")}</p>
                  <Button asChild className="min-h-11 w-full"><Link href="/approval-credential"><KeyRound />{t("review.setupCredential")}</Link></Button>
                </div>
              ) : signsWithCredential(credential.data) || (application.consultant_form && credential.isSuccess) ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <Button className="min-h-11 justify-start" onClick={() => setDecision("APPROVE")}><CheckCircle2 />{t("decision.APPROVE")}</Button>
                  <Button className="min-h-11 justify-start" variant="outline" onClick={() => setDecision("APPROVE_WITH_REMEDIAL")}><ClipboardCheck />{t("decision.APPROVE_WITH_REMEDIAL")}</Button>
                  <Button className="min-h-11 justify-start" variant="outline" onClick={() => setDecision("REVISE_RESUBMIT")}><RotateCcw />{t("decision.REVISE_RESUBMIT")}</Button>
                  {/* Drawn as every 驳回 on a record (JB166); the chosen 驳回 in
                      the decision dialog keeps the filled red. */}
                  <Button className="min-h-11 justify-start" variant="outline-destructive" onClick={() => setDecision("REJECT")}><XCircle />{t("decision.REJECT")}</Button>
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
                <div className="space-y-3">{application.approval_actions.map((entry) => <div key={entry.id} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><p className="font-medium">{entry.actor_name}</p><StatusBadge label={t(`decision.${entry.decision}`)} tone={entry.decision === "APPROVE" ? "positive" : entry.decision === "REJECT" ? "danger" : "warning"} /></div><p className="mt-1 text-xs text-muted-foreground">{entry.step_name} - {new Date(entry.acted_at).toLocaleString()}</p>{entry.remarks && <p className="mt-2 text-sm">{entry.remarks}</p>}<div className="mt-3 flex gap-2">{entry.signature_snapshot ? <PhotoLink href={entry.signature_snapshot} label={`${entry.actor_name} · ${t("credential.signature")}`} image paper className="text-xs font-medium text-primary hover:underline">{t("credential.signature")}</PhotoLink> : <span className="text-xs font-medium text-muted-foreground">{t("ownForm.signedOnForm")}</span>}{entry.stamp_snapshot && <PhotoLink href={entry.stamp_snapshot} label={`${entry.actor_name} · ${t("credential.stamp")}`} image paper className="text-xs font-medium text-primary hover:underline">{t("credential.stamp")}</PhotoLink>}</div></div>)}</div>
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

      {tileArchive && <AttachmentDialog application={application} preset={tileArchive} openArchive canArchive onChanged={() => void refresh()} onClose={() => setTileArchive(null)} onSaved={() => { void refresh(); setTileArchive(null); }} />}
      {attachmentOpen && <AttachmentDialog application={application} canArchive onChanged={() => void refresh()} onClose={() => setAttachmentOpen(false)} onSaved={() => { void refresh(); setAttachmentOpen(false); }} />}
      {evidenceOpen && <EvidenceDialog application={application} onClose={() => setEvidenceOpen(false)} onSaved={() => { void refresh(); setEvidenceOpen(false); }} />}
      {decision && <DecisionDialog application={application} decision={decision} hasCredential={signsWithCredential(credential.data)} onClose={() => setDecision(null)} onSaved={() => { void refresh(); void queryClient.invalidateQueries({ queryKey: ["approval-credential"] }); setDecision(null); }} />}
    </RecordDetailFrame>
  );
}

function ApplicationLifecycle({ application }: { application: ConsultantApplication }) {
  const t = useTranslations("consultantWorkflow");
  const stages = lifecycleStages(application);

  return (
    <section
      aria-label={t("detail.lifecycle.title")}
      className={`grid gap-2 ${stages.length === 5 ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-4"}`}
    >
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

/** Whether the application went through 「批准并要求整改」 (JB236). */
export function underRemedialReview(application: Pick<ConsultantApplication, "status" | "final_decision">) {
  return (
    application.final_decision === "APPROVED_WITH_REMEDIAL" ||
    application.status === "APPROVED_WITH_REMEDIAL" ||
    application.status === "REMEDIAL_ACCEPTED"
  );
}

/**
 * A remedial approval whose report was made when it was signed (before
 * JB236): its archive entry does not carry `application_status:
 * REMEDIAL_ACCEPTED`, which a report made at acceptance does. Mirrors the
 * backend's `report_made_at_signing`.
 */
export function reportMadeAtSigning(
  application: Pick<ConsultantApplication, "final_decision" | "final_report" | "archive_entries">,
) {
  if (application.final_decision !== "APPROVED_WITH_REMEDIAL" || !application.final_report) return false;
  const entry = application.archive_entries.find((row) => row.kind === "FINAL_REPORT");
  const snapshot = (entry?.snapshot ?? {}) as { application_status?: string };
  return Boolean(entry) && snapshot.application_status !== "REMEDIAL_ACCEPTED";
}

/**
 * 申请 / 审批 / 整改复核 / 最终报告 / 归档 (JB236, 客户 11-20 事项 8).
 *
 * 图10 showed four 「已完成」 for an application whose remedial work nobody
 * had checked: the steps read the final report and `archived_at`, which the
 * signing made at once. 「整改复核」 appears only for a remedial approval, and
 * 最终报告 / 归档 are not done until the consultant accepted every item
 * (REMEDIAL_ACCEPTED) - even for an old application that has a report made
 * at signing.
 */
export function lifecycleStages(
  application: Pick<ConsultantApplication, "status" | "final_decision" | "final_report" | "archived_at">,
) {
  const submitted = application.status !== "DRAFT";
  const remedial = underRemedialReview(application);
  const accepted = application.status === "REMEDIAL_ACCEPTED";
  const decided = remedial || Boolean(application.final_report);
  const hasFinalReport = Boolean(application.final_report) && (!remedial || accepted);
  const archived = Boolean(application.archived_at) && (!remedial || accepted);
  return [
    { key: "application", complete: submitted, current: !submitted },
    { key: "approval", complete: decided, current: submitted && !decided },
    ...(remedial ? [{ key: "remedial", complete: accepted, current: !accepted }] : []),
    { key: "final", complete: hasFinalReport, current: decided && (!remedial || accepted) && !hasFinalReport },
    { key: "archive", complete: archived, current: hasFinalReport && !archived },
  ];
}

function RevisionTimeline({ application }: { application: ConsultantApplication }) {
  const t = useTranslations("consultantWorkflow");
  if (!application.revision_chain.length) return <Empty text={t("detail.noRevisions")} />;
  // JB203W (walk F-10): 「当前版本」 on the version being read, beside a newer
  // one, read as "the live one". The row on screen says so, and once there
  // is more than one version the newest says it is the newest - the same row
  // may say both.
  const latest =
    application.revision_chain.length > 1
      ? Math.max(...application.revision_chain.map((row) => row.revision))
      : null;

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
                {row.is_current && <span data-revision-tag="viewing" className="text-xs font-semibold text-primary">{t("detail.revisionCurrent")}</span>}
                {row.revision === latest && <span data-revision-tag="latest" className="text-xs font-semibold text-success">{t("detail.revisionLatest")}</span>}
              </div>
              {/* JB202: the number wraps on a phone instead of ending in 「…」. */}
              <p className="break-words text-xs text-muted-foreground">{row.application_no}</p>
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
  // B (2026-10-10): 「原表格、最终版本、审批人、时间、意见统一归档」.
  const kinds: Array<ConsultantApplication["archive_entries"][number]["kind"]> = application.consultant_form
    ? ["APPLICATION", "APPROVAL", "FINAL_REPORT", "CONSULTANT_FORM"]
    : ["APPLICATION", "APPROVAL", "FINAL_REPORT"];
  // JB236: an old application signed before the remedial review keeps the
  // report made at signing; the acceptance is filed beside it.
  const acceptanceRecord = application.archive_entries.find((row) => row.kind === "REMEDIAL_ACCEPTANCE");
  const reportBeforeReview = reportMadeAtSigning(application);
  // JB236 audit: until the consultant accepts the work, what an old
  // application archived at signing is not 「已完成」 - it was made before the
  // remedial review.
  const waitingReview = underRemedialReview(application) && application.status !== "REMEDIAL_ACCEPTED";
  if (acceptanceRecord || reportBeforeReview) {
    kinds.push("REMEDIAL_ACCEPTANCE");
  }
  // Accepted, but the 「整改验收记录」 beside the old report failed: offered
  // again, as the backend's ``acceptance_record_owed``.
  const acceptanceOwed = application.status === "REMEDIAL_ACCEPTED" && reportBeforeReview && !acceptanceRecord;
  const notAccepted = (application.remedial_items ?? []).filter((item) => item.status !== "ACCEPTED").length;

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
  // JB236: a remedial approval owes its report only once accepted.
  const reportOwedButMissing =
    !application.final_report &&
    DECIDED.includes(application.final_decision) &&
    (application.final_decision !== "APPROVED_WITH_REMEDIAL" || application.status === "REMEDIAL_ACCEPTED");

  return (
    <div className="space-y-2">
      {application.status === "APPROVED_WITH_REMEDIAL" && (
        <p data-slot="remedial-pending" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          {t("remedial.pendingItems", { count: notAccepted })}
        </p>
      )}
      {kinds.map((kind) => {
        const entry = application.archive_entries.find((row) => row.kind === kind);
        const done = Boolean(entry) && !waitingReview;
        const early = Boolean(entry) && waitingReview;
        return (
          <div
            key={kind}
            data-archive-kind={kind}
            data-archive-state={done ? "done" : early ? "before-review" : "pending"}
            className={`flex items-start gap-3 rounded-lg border p-3 ${done ? "border-success/30 bg-success/5" : early ? "border-warning/30 bg-warning/5" : "bg-muted/10"}`}
          >
            <span className={`grid size-9 shrink-0 place-items-center rounded-full ${done ? "bg-success text-white" : "bg-muted text-muted-foreground"}`}>
              {done ? <CheckCircle2 className="size-5" /> : <CircleDashed className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{t(`archive.kind.${kind}`)}</p>
                <span className={`text-xs font-semibold ${done ? "text-success" : early ? "text-warning" : "text-muted-foreground"}`}>
                  {t(done ? "archive.complete" : early ? "archive.beforeReview" : "archive.pending")}
                </span>
              </div>
              {kind === "REMEDIAL_ACCEPTANCE" && acceptanceOwed && can("approval.review") && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground">{t("archive.reportMissing")}</p>
                  <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate()}>
                    {retry.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                    {t("action.retryReport")}
                  </Button>
                </div>
              )}
              {/* Under review the row's own status already says 「签署时生成
                  （整改复核前）」; once accepted, this line says which report
                  it is (walk 11-23: not both at once). */}
              {kind === "FINAL_REPORT" && entry && reportBeforeReview && !waitingReview && (
                <p data-slot="report-before-review" className="mt-1 text-xs font-medium text-warning">{t("remedial.oldReport")}</p>
              )}
              {entry?.sha256 && <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">SHA-256: {entry.sha256}</p>}
              {kind === "REMEDIAL_ACCEPTANCE" && entry?.file && (
                <a href={entry.file} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">
                  {t("remedial.openRecord")}
                </a>
              )}
              {kind === "CONSULTANT_FORM" && entry?.snapshot ? (
                <ConsultantFormArchiveLines snapshot={entry.snapshot as ConsultantFormArchiveSnapshot} />
              ) : null}
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
                    // His own 顾问申请 / 资料包 work: as before, 「导出」 or not (JB210).
                    ownWork
                    size="sm"
                    formats={["pdf"]}
                    label={t(reportMadeAtSigning(application) ? "action.downloadReportBeforeReview" : "action.downloadReport")}
                    title={application.application_no}
                    record={{ kind: "CONSULTANT_APPLICATION", id: application.id }}
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

/** The version made from this one after it was returned, if there is one (JB203-2). */
export function laterRevisionOf(application: Pick<ConsultantApplication, "revision" | "revision_chain">) {
  return application.revision_chain.find((row) => row.revision > application.revision);
}

/** The newest version made from this one, through later returns too (JB203W). */
export function newestRevisionOf(application: Pick<ConsultantApplication, "revision" | "revision_chain">) {
  return application.revision_chain.reduce<ConsultantApplication["revision_chain"][number] | undefined>(
    (newest, row) => (row.revision > (newest?.revision ?? application.revision) ? row : newest),
    undefined,
  );
}

/**
 * Whether this reader may press 【开一条整改】: the reviewer who approved with
 * remedial works, while the application is still under review or approved on
 * that condition - the same rule the reminders follow (JB200).
 */
export function canRaiseRemedial(
  application: Pick<ConsultantApplication, "status" | "review_steps">,
  userId: string | undefined,
  can: (code: string) => boolean,
) {
  return (
    can("approval.review") &&
    (application.status === "SUBMITTED" || application.status === "APPROVED_WITH_REMEDIAL") &&
    application.review_steps.some(
      (step) => step.status === "APPROVED_WITH_REMEDIAL" && Boolean(userId) && step.decided_by === userId,
    )
  );
}

function nextActionText(
  application: ConsultantApplication,
  currentStep: ApplicationReviewStep | undefined,
  canAct: boolean,
  t: ReturnType<typeof useTranslations<"consultantWorkflow">>,
  /** What this reader can press: the contractor's 【建立新版本】 / 【关闭这条整改】, or 【开一条整改】. */
  reader: { canSubmit: boolean; canRaise: boolean },
) {
  if (application.status === "DRAFT") return t("detail.next.draft");
  if (application.status === "REVISE_RESUBMIT") {
    // JB203-2: the new version is made - say where to go on, not 「请建立新版本」.
    // JB203W (walk F-10): and what became of it since - 「改好后再发送」 was
    // still said after it was sent and decided.
    const newest = newestRevisionOf(application);
    if (newest?.status === "DRAFT") return t("detail.next.reviseMade", { revision: newest.revision });
    if (newest?.status === "SUBMITTED") return t("detail.next.reviseSent", { revision: newest.revision });
    if (newest) return t("detail.next.reviseDecided", { revision: newest.revision });
    // The reviewer has no 【建立新版本】 (sibling of walk F-4).
    if (!reader.canSubmit) return t("detail.next.reviseReviewer");
    return t("detail.next.revise");
  }
  if (application.status === "SUBMITTED" && canAct) return t("detail.next.review");
  if (application.status === "SUBMITTED" && currentStep) {
    return t("detail.next.waiting", { step: currentStep.name });
  }
  // JB200 / JB236: approved on condition - say who must act now, and that
  // nothing is finished or archived before the consultant accepts the work
  // (客户 11-20 事项 8 第 5 点).
  if (application.status === "APPROVED_WITH_REMEDIAL") {
    return remedialNextText(application, t as unknown as Parameters<typeof remedialNextText>[1], reader);
  }
  if (application.status === "REMEDIAL_ACCEPTED") {
    return application.archived_at ? t("detail.next.remedialAccepted") : t("detail.next.complete");
  }
  // JB203W (walk NOTE 32): rejected - nothing said the work may be sent again.
  if (application.status === "REJECTED" && reader.canSubmit) return t("detail.next.rejected");
  if (application.archived_at) return t("detail.next.archived");
  if (application.final_report) return t("detail.next.final");
  return t("detail.next.complete");
}

/**
 * 下一步 while an application waits on its remedial work (JB236): the
 * consultant's own reviews first, then the contractor's work, then the
 * submissions waiting for somebody else - always with 「顾问确认整改合格前，
 * 这份申请不会完成，也不会归档。」
 */
export function remedialNextText(
  application: Pick<ConsultantApplication, "remedial_items">,
  t: (key: string, values?: Record<string, string | number>) => string,
  reader: { canSubmit: boolean; canRaise: boolean },
) {
  const items = application.remedial_items ?? [];
  const toReview = items.filter((item) => item.status === "SUBMITTED" && item.can_review).length;
  const owed = items.filter((item) => item.status === "OPEN" || item.status === "RETURNED").length;
  const waiting = items.filter((item) => item.status === "SUBMITTED").length;
  let first = "";
  if (toReview > 0) first = t("detail.next.remedialReview", { count: toReview });
  else if (owed > 0 && reader.canSubmit) first = t("detail.next.remedialOpen", { count: owed });
  else if (owed > 0 && reader.canRaise) first = t("detail.next.remedialOpenReviewer", { count: owed });
  else if (owed > 0) first = t("detail.next.remedialOpenWatching", { count: owed });
  else if (waiting > 0) first = t("detail.next.remedialWaitingReview", { count: waiting });
  return [first, t("detail.next.remedialHold")].filter(Boolean).join(" ");
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
  const { can, user } = useAuth();
  const [raising, setRaising] = useState(false);
  const [submitting, setSubmitting] = useState<RemedialItem | null>(null);
  const [reviewing, setReviewing] = useState<{ item: RemedialItem; decision: "ACCEPT" | "RETURN" } | null>(null);
  const items = application.remedial_items ?? [];
  // JB200 (Lucas 11-16): the button used to need an unsent draft, which a
  // consultant never sees (`canRaiseRemedial`, which 下一步 asks too).
  const canRaise = canRaiseRemedial(application, user?.id, can);
  // JB236: the contractor submits while the application is open for it.
  const openForWork = application.status === "SUBMITTED" || application.status === "APPROVED_WITH_REMEDIAL";

  if (!items.length && !canRaise) return null;

  return (
    <Section
      title={t("detail.section.remedial")}
      action={
        canRaise ? (
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
            <RemedialItemCard
              key={`${item.id}-${item.status}`}
              application={application}
              item={item}
              canSubmit={openForWork && can("consultant.submit")}
              onSubmit={() => setSubmitting(item)}
              onReview={(decision) => setReviewing({ item, decision })}
            />
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
      {submitting && (
        <SubmitRemedialDialog
          application={application}
          item={submitting}
          onClose={() => setSubmitting(null)}
          onSaved={() => {
            setSubmitting(null);
            onChanged();
          }}
        />
      )}
      {reviewing && (
        <ReviewRemedialDialog
          application={application}
          item={reviewing.item}
          decision={reviewing.decision}
          onClose={() => setReviewing(null)}
          onSaved={() => {
            setReviewing(null);
            onChanged();
          }}
        />
      )}
    </Section>
  );
}

/** An item's badge: 未完成 / 待顾问复核 / 退回继续整改 / 整改合格 / 已逾期 (JB236). */
export function remedialBadge(item: Pick<RemedialItem, "status" | "is_overdue">): {
  key: string;
  tone: "neutral" | "positive" | "warning" | "danger" | "info";
} {
  if (item.status === "ACCEPTED") return { key: "remedial.accepted", tone: "positive" };
  if (item.status === "CLOSED") return { key: "remedial.closed", tone: "positive" };
  if (item.status === "SUBMITTED") return { key: "remedial.submitted", tone: "info" };
  if (item.is_overdue) return { key: "remedial.overdue", tone: "danger" };
  if (item.status === "RETURNED") return { key: "remedial.returned", tone: "danger" };
  return { key: "remedial.open", tone: "warning" };
}

function proofThumbs(files: RemedialItem["evidence_files"]) {
  return (files ?? []).map((file) => ({
    id: file.id,
    name: file.original_filename,
    thumbnail_url: isImageFile(file.original_filename, file.content_type)
      ? file.watermarked_file || file.file
      : null,
    href: file.watermarked_file || file.file,
  }));
}

/** One remedial item: its state, its rounds, and the reader's buttons (JB236). */
function RemedialItemCard({
  application,
  item,
  canSubmit,
  onSubmit,
  onReview,
}: {
  application: ConsultantApplication;
  item: RemedialItem;
  canSubmit: boolean;
  onSubmit: () => void;
  onReview: (decision: "ACCEPT" | "RETURN") => void;
}) {
  const t = useTranslations("consultantWorkflow");
  const rounds = item.rounds ?? [];
  // What the consultant has to look at, open from the start: the submission
  // waiting for him, or the reason it came back.
  const [open, setOpen] = useState(item.status === "SUBMITTED" || item.status === "RETURNED");
  const badge = remedialBadge(item);
  const owed = item.status === "OPEN" || item.status === "RETURNED";

  return (
    <div className="rounded-lg border p-3" data-remedial-item={item.status}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{item.description}</p>
        <StatusBadge label={t(badge.key)} tone={badge.tone} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {[
          item.assigned_to_name
            ? t("remedial.responsible", { name: item.assigned_to_name })
            : t("remedial.responsibleApplicant", { name: application.applicant_name }),
          item.due_on ? t("remedial.dueOn", { date: item.due_on }) : "",
          item.created_by_name ? t("remedial.raisedBy", { name: item.created_by_name }) : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {item.status === "CLOSED" && (
        <>
          <p className="mt-2 text-sm">
            {item.closure_note}
            <span className="ml-2 text-xs text-muted-foreground">
              {t("remedial.closedBy", {
                name: item.closed_by_name ?? "",
                when: item.closed_at ? new Date(item.closed_at).toLocaleString() : "",
                count: item.evidence.length,
              })}
            </span>
          </p>
          {/* JB203W (walk F-8): the proof itself. */}
          {(item.evidence_files ?? []).length > 0 && (
            <div className="mt-2" data-slot="remedial-proof">
              <FileThumbs all files={proofThumbs(item.evidence_files)} />
            </div>
          )}
        </>
      )}
      {rounds.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {t("remedial.history", { count: rounds.length })}
          </button>
          {open && (
            <ol className="mt-2 space-y-2 border-l-2 pl-3" data-slot="remedial-rounds">
              {rounds.map((round) => (
                <RemedialRoundLine key={round.id} round={round} />
              ))}
            </ol>
          )}
        </div>
      )}
      {item.status === "SUBMITTED" && !item.can_review && (item.reviewer_names ?? []).length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground" data-slot="remedial-waiting">
          {t("remedial.waitingReviewer", { names: (item.reviewer_names ?? []).join("、") })}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {owed && canSubmit && (
          <Button size="sm" variant="outline" onClick={onSubmit}>
            <ClipboardCheck />
            {t("action.submitRemedial")}
          </Button>
        )}
        {item.status === "SUBMITTED" && item.can_review && (
          <>
            <Button size="sm" onClick={() => onReview("ACCEPT")}>
              <CheckCircle2 />
              {t("action.acceptRemedial")}
            </Button>
            <Button size="sm" variant="outline-destructive" onClick={() => onReview("RETURN")}>
              <RotateCcw />
              {t("action.returnRemedial")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function RemedialRoundLine({ round }: { round: RemedialRound }) {
  const t = useTranslations("consultantWorkflow");
  const when = new Date(round.acted_at).toLocaleString();
  const heading =
    round.event === "SUBMITTED"
      ? t("remedial.roundSubmitted", { number: round.number, name: round.actor_name, when })
      : round.event === "ACCEPTED"
        ? t("remedial.roundAccepted", { name: round.actor_name, when })
        : t("remedial.roundReturned", { name: round.actor_name, when });
  return (
    <li data-round-event={round.event}>
      <p
        className={`text-xs font-semibold ${
          round.event === "ACCEPTED" ? "text-success" : round.event === "RETURNED" ? "text-destructive" : "text-foreground"
        }`}
      >
        {heading}
      </p>
      {round.note && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{round.note}</p>}
      {/* JB228: only the files attached to this submission - never chats. */}
      {round.evidence_files.length > 0 && (
        <div className="mt-1" data-slot="remedial-proof">
          <FileThumbs all files={proofThumbs(round.evidence_files)} />
        </div>
      )}
    </li>
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
              min={todayIso()}
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

/**
 * 「提交顾问复核」 (JB236): the result and the photos, back to the consultant
 * who raised the item - was 「关闭这条整改」. Same rules as before: a note and
 * at least one photo or file of this project.
 */
function SubmitRemedialDialog({
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
      submitRemedialItem(application.id, {
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
          <DialogTitle>{t("remedial.submitTitle")}</DialogTitle>
          <DialogDescription>{t("remedial.submitHelp")}</DialogDescription>
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
                  {/* The photograph itself (J34-11), its stamped copy only. */}
                  <FileThumbs
                    files={[{ id: asset.id, name: asset.original_filename, thumbnail_url: asset.watermarked_file ?? null }]}
                  />
                  <span className="truncate">
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
            <ClipboardCheck />
            {t("action.submitRemedial")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 「整改合格」 / 「退回继续整改」 (JB236, 客户 11-20 事项 8): signed with the
 * same signature and PIN as a decision. A return says why; the contractor
 * works again and submits a new round, and every earlier round stays.
 */
function ReviewRemedialDialog({
  application,
  item,
  decision,
  onClose,
  onSaved,
}: {
  application: ConsultantApplication;
  item: RemedialItem;
  decision: "ACCEPT" | "RETURN";
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("consultantWorkflow");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const credential = useQuery({ queryKey: ["approval-credential"], queryFn: getApprovalCredential });
  const accept = decision === "ACCEPT";
  const save = useMutation({
    mutationFn: () =>
      reviewRemedialItem(application.id, { item: item.id, decision, note: note.trim(), approval_pin: pin }),
    onSuccess: () => {
      // Accepting the last item archives the application, which closes its
      // conversation (K09).
      void queryClient.invalidateQueries({
        queryKey: recordConversationKey("CONSULTANT_APPLICATION", application.id),
      });
      onSaved();
    },
    onError: (failure) =>
      setError(
        failure instanceof ApiError ? Object.values(failure.errors)[0] || failure.message : t("remedial.failed"),
      ),
  });
  const signs = signsWithCredential(credential.data);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(accept ? "remedial.acceptTitle" : "remedial.returnTitle")}</DialogTitle>
          <DialogDescription>{t(accept ? "remedial.acceptHelp" : "remedial.returnHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <p className="rounded-md border bg-muted/30 p-3 text-sm">{item.description}</p>
          {accept ? (
            <FieldWrapper label={t("remedial.acceptNote")} optional={common("optional")}>
              <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
            </FieldWrapper>
          ) : (
            <FieldWrapper label={t("remedial.returnReason")} required>
              <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
            </FieldWrapper>
          )}
          {credential.isError ? (
            <LoadFailed what={t("what.credential")} onRetry={() => credential.refetch()} />
          ) : credential.isSuccess && !signs ? (
            <Button asChild className="min-h-11 w-full">
              <Link href="/approval-credential"><KeyRound />{t("review.setupCredential")}</Link>
            </Button>
          ) : (
            <FieldWrapper label={t("review.pin")} required hint={t("review.pinHint")}>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
              />
            </FieldWrapper>
          )}
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
            variant={accept ? "default" : "destructive"}
            requires={[
              [accept || note.trim(), t("remedial.returnReason")],
              [signs && pin.length === 6, t("review.pin")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : accept ? <CheckCircle2 /> : <RotateCcw />}
            {t(accept ? "action.acceptRemedial" : "action.returnRemedial")}
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

/** A filter dropdown: 「全部」 first, then the choices with their counts (I40). */
function FilterSelect({ value, onChange, allLabel, choices, disabled = false }: { value: string; onChange: (value: string) => void; allLabel: string; choices: { value: string; label: string; count: number }[]; disabled?: boolean }) {
  const ALL = "__all__";
  return (
    <Select value={value || ALL} onValueChange={(next) => onChange(next === ALL ? "" : next)} disabled={disabled}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {choices.map((choice) => <SelectItem key={choice.value} value={choice.value}>{choice.label} ({choice.count})</SelectItem>)}
      </SelectContent>
    </Select>
  );
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
  const [moduleFilter, setModuleFilter] = useState("");
  const root = useTranslations();
  const categoryLabel = (name: string) => {
    const key = builtinCategoryKey(name);
    return key ? t(`evidence.categoryName.${key}`) : name;
  };
  const [expanded, setExpanded] = useState<string | null>(null);
  // What this project's evidence has, with counts: the dropdowns list only
  // those, so every choice finds something (I40).
  const options = useQuery({
    queryKey: ["application-evidence-filter-options", application.project],
    queryFn: () => getEvidenceFilterOptions(application.project),
  });
  const moduleChoices = useMemo(() => groupModules(options.data?.modules ?? []), [options.data]);
  const subcategoryChoices = subcategoriesOf(options.data?.categories ?? [], category);
  // Typing waits a moment before it searches.
  const keyword = useDebounce(search, 300);
  // Newest first, a hundred at a time: older evidence is one 「加载更多」 away,
  // never silently left out.
  const rows = useInfiniteQuery({
    queryKey: ["application-evidence-candidates", application.project, keyword, dateFrom, dateTo, moduleFilter, category, subcategory, uploader],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => getApplicationEvidenceCandidates(application.project, {
      page: pageParam,
      module: moduleFilter || undefined,
      search: keyword || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      category: category || undefined,
      subcategory: subcategory || undefined,
      uploader: uploader || undefined,
    }),
    getNextPageParam: (last) => (last.page < last.total_pages ? last.page + 1 : undefined),
  });
  const totalCount = rows.data?.pages[0]?.count ?? 0;
  const linkedIds = useMemo(() => new Set(application.evidence_links.map((link) => link.evidence)), [application.evidence_links]);
  const candidates = (rows.data?.pages.flatMap((page) => page.results) ?? []).filter((row) => !linkedIds.has(row.id));
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
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl"><DialogHeader><DialogTitle>{t("evidence.title")}</DialogTitle><DialogDescription>{t("evidence.help")}</DialogDescription></DialogHeader><div className="space-y-3">{options.isError ? <LoadFailed what={t("what.evidenceFilters")} onRetry={() => options.refetch()} /> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><FieldWrapper label={t("evidence.module")}><FilterSelect value={moduleFilter} onChange={setModuleFilter} allLabel={t("evidence.allModules")} choices={moduleChoices.map((row) => ({ value: row.value, label: MODULE_LABEL_PATH[row.key] ? root(MODULE_LABEL_PATH[row.key] as string) : t("evidence.moduleName.other"), count: row.count }))} /></FieldWrapper><FieldWrapper label={t("evidence.category")}><FilterSelect value={category} onChange={(next) => { setCategory(next); setSubcategory(""); }} allLabel={t("evidence.allCategories")} choices={(options.data?.categories ?? []).map((row) => ({ value: row.value, label: categoryLabel(row.value), count: row.count }))} /></FieldWrapper><FieldWrapper label={t("evidence.subcategory")}><FilterSelect value={subcategory} onChange={setSubcategory} allLabel={t("evidence.allSubcategories")} disabled={!category || subcategoryChoices.length === 0} choices={subcategoryChoices.map((row) => ({ value: row.value, label: categoryLabel(row.value), count: row.count }))} /></FieldWrapper><FieldWrapper label={t("evidence.uploader")}><FilterSelect value={uploader} onChange={setUploader} allLabel={t("evidence.allUploaders")} choices={(options.data?.uploaders ?? []).map((row) => ({ value: row.value, label: row.label || t("common.unknown"), count: row.count }))} /></FieldWrapper></div>}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Input type="date" aria-label={t("evidence.dateFrom")} value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} /><Input type="date" aria-label={t("evidence.dateTo")} value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /><Input className="sm:col-span-2" placeholder={t("evidence.searchPlaceholder")} aria-label={t("evidence.keyword")} value={search} onChange={(event) => setSearch(event.target.value)} /></div></div>{rows.isLoading ? <div className="grid min-h-32 place-items-center"><Loader2 className="animate-spin" /></div> : rows.isError ? <LoadFailed what={t("what.evidenceCandidates")} onRetry={() => rows.refetch()} /> : <div className="space-y-3"><FieldWrapper label={t("evidence.selectPhotos")} required><div className="max-h-[58dvh] space-y-3 overflow-y-auto pr-1">{groups.map((group) => { const ids = group.rows.map((row) => row.id); const allSelected = ids.every((id) => selected.includes(id)); const open = expanded === group.key; const first = group.rows[0]; return <div key={group.key} className={`rounded-lg border ${allSelected ? "border-primary ring-2 ring-primary/20" : ""}`}><div className="flex items-start gap-3 p-3"><Checkbox checked={allSelected} onCheckedChange={() => toggleGroup(group)} aria-label={t("evidence.selectRecord")} /><button type="button" className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => setExpanded(open ? null : group.key)}><span className="mt-0.5 shrink-0">{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</span><span className="min-w-0"><span className="block truncate font-medium">{first.record_reference} · {first.record_type_label} · {first.record_title}</span><span className="block text-xs text-muted-foreground">{first.project_name || t("common.emptyValue")} · {categoryLabel(first.category) || t("common.emptyValue")} {first.subcategory ? `· ${categoryLabel(first.subcategory)}` : ""}</span><span className="block text-xs text-muted-foreground">{group.rows.length} {t("evidence.recordPhotos")} · {first.record_uploader || first.photographer_name || t("common.unknown")} · {first.record_date ? new Date(first.record_date).toLocaleString() : new Date(first.captured_at).toLocaleString()}</span></span></button></div>{open && <div className="grid gap-3 border-t bg-muted/20 p-3 sm:grid-cols-4">{group.rows.map((row) => { const checked = selected.includes(row.id); const image = row.watermarked_file || row.file; return <div key={row.id} className={`rounded-md border bg-card p-2 ${checked ? "border-primary" : ""}`}><div className="relative aspect-[4/3] overflow-hidden rounded bg-muted">{row.kind === "PHOTO" ? <Image src={image} alt={row.original_filename} fill unoptimized className="object-cover object-bottom" /> : <div className="grid h-full place-items-center p-2 text-center text-xs text-muted-foreground">{row.original_filename}</div>}</div><label className="mt-2 flex items-start gap-2 text-xs"><Checkbox checked={checked} onCheckedChange={() => toggle(row.id)} /><span className="min-w-0"><span className="block truncate font-medium">{row.original_filename}</span><span className="block text-muted-foreground">{new Date(row.captured_at).toLocaleString()} · {t("evidence.gps")} {row.latitude ?? "-"}, {row.longitude ?? "-"}</span><span className="block text-muted-foreground">{row.photographer_name || t("common.unknown")} · {row.watermark_text ? t("evidence.watermarked") : ""}</span></span></label></div>; })}</div>}</div>; })}{!groups.length && <Empty text={t("evidence.noCandidates")} />}</div></FieldWrapper><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{t("evidence.showing", { shown: candidates.length, count: totalCount })}</span>{rows.hasNextPage && <Button type="button" size="sm" variant="outline" disabled={rows.isFetchingNextPage} onClick={() => void rows.fetchNextPage()}>{rows.isFetchingNextPage ? <Loader2 className="animate-spin" /> : null}{t("evidence.loadMore")}</Button>}</div><div className="flex flex-wrap items-end gap-3"><FieldWrapper label={t("evidence.caption")} className="min-w-64 flex-1"><Input value={caption} onChange={(event) => setCaption(event.target.value)} /></FieldWrapper><p className="pb-2 text-sm font-medium text-primary">{selected.length} / {candidates.length}</p></div></div>}<DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[selected.length, t("evidence.selectPhotos")]]} disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Link2 />}{t("evidence.link")} ({selected.length})</Button></DialogFooter></DialogContent></Dialog>;
}

export function DecisionDialog({ application, decision, hasCredential, onClose, onSaved }: { application: ConsultantApplication; decision: "APPROVE" | "APPROVE_WITH_REMEDIAL" | "REJECT" | "REVISE_RESUBMIT"; hasCredential: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("consultantWorkflow");
  const common = useTranslations("common");
  const [remarks, setRemarks] = useState("");
  const [pin, setPin] = useState("");
  // JB200: 「批准并要求整改」 lists the work here, one line per thing, so the
  // signed final report prints it and the contractor can close each one.
  const remedial = decision === "APPROVE_WITH_REMEDIAL";
  const [lines, setLines] = useState<{ description: string; due_on: string }[]>([
    { description: "", due_on: "" },
  ]);
  const listed = lines
    .filter((line) => line.description.trim())
    .map((line) => ({ description: line.description.trim(), due_on: line.due_on || null }));
  const setLine = (index: number, patch: Partial<{ description: string; due_on: string }>) =>
    setLines((current) => current.map((line, at) => (at === index ? { ...line, ...patch } : line)));
  // B (2026-10-10): the consultant's own form may also be signed and stamped
  // by hand and uploaded - 「也可上传已经签名 / 盖章的最终版本」.
  const choices = signingChoices(Boolean(application.consultant_form), hasCredential);
  const [signing, setSigning] = useState<Signing>(choices[0]);
  const [signedForm, setSignedForm] = useState<File | null>(null);
  const needs = signingNeeds(signing, hasCredential);
  const save = useMutation({
    mutationFn: () =>
      reviewConsultantApplication(application.id, {
        decision,
        remarks,
        ...(remedial ? { remedial_items: listed } : {}),
        ...(needs.pin ? { approval_pin: pin } : {}),
        ...(application.consultant_form ? { signing, signed_form: signedForm } : {}),
      }),
    onSuccess: onSaved,
  });
  // The list says what is owed, so with it the remarks are optional (JB200).
  const remarksRequired = decision !== "APPROVE" && !remedial;
  const ownForm = Boolean(application.consultant_form);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(`review.dialog.${decision}.title`)}</DialogTitle>
          <DialogDescription>{t(`review.dialog.${decision}.description`)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {remedial ? (
            <FieldWrapper label={t("detail.section.remedial")} required>
              <div className="space-y-3" data-slot="remedial-lines">
                <p className="text-sm text-muted-foreground">{t("review.remedialList.hint")}</p>
                {lines.map((line, index) => (
                  <div key={index} className="space-y-2 rounded-lg border p-3">
                    <FieldWrapper label={t("review.remedialList.item", { n: index + 1 })}>
                      <Textarea
                        rows={2}
                        value={line.description}
                        placeholder={t("review.remedialList.placeholder")}
                        onChange={(event) => setLine(index, { description: event.target.value })}
                      />
                    </FieldWrapper>
                    <div className="flex flex-wrap items-end gap-2">
                      <FieldWrapper label={t("remedial.dueDate")} optional={common("optional")} className="min-w-44 flex-1">
                        <Input
                          type="date"
                          min={todayIso()}
                          value={line.due_on}
                          onChange={(event) => setLine(index, { due_on: event.target.value })}
                        />
                      </FieldWrapper>
                      {lines.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setLines((current) => current.filter((_, at) => at !== index))}
                        >
                          <XCircle />
                          {t("review.remedialList.remove")}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLines((current) => [...current, { description: "", due_on: "" }])}
                >
                  <Plus />
                  {t("review.remedialList.add")}
                </Button>
                <p className="text-xs text-muted-foreground">{t("remedial.dueHint")}</p>
              </div>
            </FieldWrapper>
          ) : null}
          <FieldWrapper
            label={t("review.remarks")}
            required={remarksRequired}
            optional={remedial ? common("optional") : undefined}
          >
            <Textarea rows={4} value={remarks} onChange={(event) => setRemarks(event.target.value)} />
          </FieldWrapper>
          {ownForm && choices.length > 1 ? (
            <FieldWrapper label={t("ownForm.signingTitle")}>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("ownForm.signingTitle")}>
                {choices.map((choice) => (
                  <Button
                    key={choice}
                    type="button"
                    role="radio"
                    aria-checked={signing === choice}
                    variant={signing === choice ? "default" : "outline"}
                    className="h-auto min-h-11 justify-start whitespace-normal text-left"
                    onClick={() => setSigning(choice)}
                  >
                    {choice === "ESIGNATURE" ? <KeyRound /> : <Paperclip />}
                    {t(choice === "ESIGNATURE" ? "ownForm.signingEsignature" : "ownForm.signingSignedForm")}
                  </Button>
                ))}
              </div>
            </FieldWrapper>
          ) : null}
          {ownForm && !hasCredential ? (
            <p className="rounded-lg border border-info/30 bg-info/5 p-3 text-sm text-info">
              {t("ownForm.noCredential")}{" "}
              <Link href="/approval-credential" className="font-medium underline">{t("review.setupCredential")}</Link>
            </p>
          ) : null}
          {ownForm ? (
            <FieldWrapper
              label={t("ownForm.signedFormFile")}
              required={needs.file}
              optional={needs.file ? undefined : common("optional")}
              hint={t("ownForm.signedFormHint")}
            >
              <AttachmentPicker
                files={signedForm ? [signedForm] : []}
                onChange={(next) => setSignedForm(next[0] ?? null)}
                rule={{ accept: FORM_FILE_ACCEPT, multiple: false }}
                refusalText={(item) => (item.kind === "type" ? t("ownForm.fileTypeWrong") : undefined)}
              />
            </FieldWrapper>
          ) : null}
          {needs.pin ? (
            <FieldWrapper label={t("review.pin")} required hint={signing === "SIGNED_FORM" ? t("ownForm.pinForSignedForm") : t("review.pinHint")}>
              <Input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} />
            </FieldWrapper>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button>
          <Button
            variant={decision === "REJECT" ? "destructive" : "default"}
            requires={[
              [!needs.pin || pin.length === 6, t("review.pin")],
              [!needs.file || signedForm, t("ownForm.signedFormFile")],
              [!remedial || listed.length > 0, t("detail.section.remedial")],
              [!remarksRequired || remarks, t("review.remarks")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : decision === "APPROVE" ? <ShieldCheck /> : decision === "REJECT" ? <XCircle /> : <RotateCcw />}
            {t(`decision.${decision}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** What the archive kept of a B application, in plain lines. */
function ConsultantFormArchiveLines({ snapshot }: { snapshot: ConsultantFormArchiveSnapshot }) {
  const t = useTranslations("consultantWorkflow");
  const lines = [
    snapshot.form ? t("ownForm.archiveBlank", { name: snapshot.form.blank_form.name, version: snapshot.form.version }) : "",
    snapshot.filled_form ? t("ownForm.archiveFilled", { name: snapshot.filled_form.name }) : "",
    ...(snapshot.final_versions ?? []).map((row) => t("ownForm.archiveFinal", { name: row.name })),
    ...(snapshot.decisions ?? []).map((row) =>
      [
        t("ownForm.archiveDecision", {
          decision: t(`decision.${row.decision}`),
          name: row.approver,
          when: row.acted_at ? new Date(row.acted_at).toLocaleString() : "-",
        }),
        row.remarks,
      ]
        .filter(Boolean)
        .join(" · "),
    ),
  ].filter(Boolean);
  return (
    <ul className="mt-2 space-y-1 text-xs text-muted-foreground" data-archive-consultant-form>
      {lines.map((line, index) => <li key={index} className="break-words">{line}</li>)}
    </ul>
  );
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
  if (status === "APPROVED" || status === "REMEDIAL_ACCEPTED") return "positive";
  if (status === "REJECTED") return "danger";
  if (status === "SUBMITTED" || status === "REVISE_RESUBMIT" || status === "APPROVED_WITH_REMEDIAL") return "warning";
  if (status === "ARCHIVED") return "info";
  return "neutral";
}

/** Today as YYYY-MM-DD in the reader's own time zone (a date input's min). */
function todayIso() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed bg-muted/15 p-6 text-center text-sm text-muted-foreground">{text}</div>;
}
