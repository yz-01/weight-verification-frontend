"use client";

/**
 * 出门条 on an exit record (JB217, 客户 11-18 事项 2, 图 4):
 *
 *   「保留原有「确认退场完成」按钮，在右侧现有签名区域下方设置独立的「出门条批准
 *   （安全经理）」栏，上传附件区域往下移。由安全经理在该栏签名批准，显示安全经理
 *   姓名、签名及批准时间。未签名不能发送正式出门条；签名后自动发送到原申请人及
 *   本项目门岗手机端。」
 *
 *   「请在「出门条批准（安全经理）」栏下方预留「外部审批」区域，包含所属公司／
 *   部门、审批人姓名、审批意见、签名及日期……需要外部审批的，完成外部签批后才
 *   发送正式出门条给申请人及门岗；不需要的，沿用内部批准流程。」
 *
 * Three titled parts in this order, always together (plan D15) - 出门条批准
 * （安全经理）, 外部审批, 门岗放行 - in the record window's right column under
 * 签名 (`RecordDetailShell`'s `exitPass`), and in the phone's 出门条 window
 * (`ExitPassWindow`). Nothing here touches the record's own buttons: 「确认退场
 * 完成」 and the rest stay where they are and work without it (D2).
 *
 * What may be pressed is the server's word (`can_sign`, `external.can_*`): a
 * button the reader may not use is not drawn, and the line beside it says
 * whose move it is instead - an older user is never left at a grey button.
 * The PIN on the web is the api-client's own sign-off box; a phone never asks.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Eye,
  FileCheck2,
  Loader2,
  PenLine,
  Send,
  UserPlus,
} from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { FieldSignaturePad } from "@/components/field-staff/field-signature-pad";
import { useAuth } from "@/components/providers/auth-provider";
import { AttachmentPicker } from "@/components/shared/attachment-picker";
import { FilePreviewDialog } from "@/components/shared/file-preview";
import {
  FieldWrapper,
  LoadFailed,
  QueryFailedNote,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { recordAttachmentsKey } from "@/components/shared/record-attachments";
import { ShellPanel } from "@/components/shared/record-detail-shell";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type { ExitPass, ExitPassKind } from "@/interfaces/exit-pass";
import { useDateFormat } from "@/lib/dates";
import { localToday } from "@/lib/local-date";
import { cn } from "@/lib/utils";
import {
  downloadExitPassPaperCopy,
  exitPassPaperCopyObjectUrl,
  getExitPass,
  recordExitPassExternalPaper,
  setExitPassExternalRequired,
  signExitPass,
  signExitPassExternal,
} from "@/services/exit-pass.service";
import { getRecordAttachments } from "@/services/record-attachment.service";

// The 门岗事项 a release made, opened over the record (the gate's own window).
const GateIncidentDetailDialog = dynamic(
  () => import("@/components/site-access/gate-records").then((module) => module.GateIncidentDetailDialog),
  { ssr: false },
);

/** The one cache key a record's 出门条 is kept under. */
export function exitPassKey(kind: ExitPassKind, record: string) {
  return ["exit-pass", kind, record] as const;
}

/** One record's 出门条 (the panel, the window and the archive block share it). */
export function useExitPass(kind: ExitPassKind, record: string, enabled = true) {
  return useQuery({
    queryKey: exitPassKey(kind, record),
    queryFn: () => getExitPass(kind, record),
    enabled: enabled && Boolean(record),
  });
}

/**
 * Why 【确认归档】 is off for this record, or null (plan D11, contract §8):
 * while a signed 出门条 owes its 外部审批, 归档 would close the 附件 slot the
 * signed copy goes into, and the client wants 「所有签批资料保存在同一笔事项内」.
 * Said beside the button, as JB169's missing supplier is; the server refuses
 * it too - and only then (audit F2): 「需要外部审批」 switched on before the
 * safety manager signs blocks nothing, as the server's `archive_refusal`.
 */
export function useExitPassArchiveBlock(
  target: { kind: ExitPassKind; recordId: string } | null | undefined,
): { reason: string; action?: React.ReactNode } | null {
  const t = useTranslations("exitPass");
  const locale = useLocale();
  const { user } = useAuth();
  // query-failure: only words why 确认归档 is off; the server refuses it either way (409 exit_pass_external_pending)
  const state = useQuery({
    queryKey: exitPassKey(target?.kind ?? "MATERIAL_OUTGOING", target?.recordId ?? ""),
    queryFn: () => getExitPass(target!.kind, target!.recordId),
    enabled: Boolean(target?.recordId),
  });
  const pass = state.data;
  if (!target || !pass || pass.state !== "awaiting_external") return null;
  // What to do about it, right there (contract v2 §11): the 外部审批 part's own
  // buttons, drawn under 【确认归档】 - named only when this reader has them.
  const buttons = waitingExternalButtons(pass, Boolean(user?.is_field_staff)).map((key) => `【${t(key)}】`);
  if (buttons.length === 0) return { reason: t("archive.pendingWho") };
  const either = new Intl.ListFormat(locale, { type: "disjunction" }).format(buttons);
  return { reason: t("archive.pendingPress", { buttons: either }), action: <ExternalActions pass={pass} /> };
}

/** The 外部审批 buttons `ExternalActions` draws for a pass waiting on it, in its order. */
function waitingExternalButtons(
  pass: ExitPass,
  fieldStaff: boolean,
): ("external.signOnline" | "external.recordPaper" | "external.waive")[] {
  const external = pass.external;
  if (fieldStaff || pass.record_closed || pass.state !== "awaiting_external" || external.status !== "waiting") {
    return [];
  }
  return [
    ...(external.can_sign_online ? (["external.signOnline"] as const) : []),
    ...(external.can_record_paper ? (["external.recordPaper"] as const) : []),
    ...(external.can_waive ? (["external.waive"] as const) : []),
  ];
}

/**
 * The record window's 出门条 parts (`RecordDetailShell` → `exitPass`). Draws
 * nothing for a record that has none (a 材料领用, a machine's entry).
 */
export function ExitPassPanel({
  kind,
  recordId,
  readOnly = false,
}: {
  kind: ExitPassKind;
  recordId: string;
  readOnly?: boolean;
}) {
  const t = useTranslations("exitPass");
  const pass = useExitPass(kind, recordId);
  if (pass.isLoading) {
    // A read-only sheet may hold a record with no 出门条 (a 材料领用): it
    // shows nothing until the server says, rather than a heading that goes.
    if (readOnly) return null;
    return (
      <ShellPanel title={t("approval.title")} data-exit-pass="loading">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </p>
      </ShellPanel>
    );
  }
  if (pass.isError || !pass.data) {
    return (
      <ShellPanel title={t("approval.title")} data-exit-pass="failed">
        <LoadFailed what={t("what")} onRetry={() => void pass.refetch()} className="p-3" />
      </ShellPanel>
    );
  }
  if (pass.data.state === "not_applicable") return null;
  return <ExitPassSections pass={pass.data} readOnly={readOnly} />;
}

/** Writes answer the whole pass again: show it, and what hangs off it. */
function useSettle(pass: Pick<ExitPass, "kind" | "record">) {
  const queryClient = useQueryClient();
  return {
    done: (next: ExitPass) => {
      queryClient.setQueryData(exitPassKey(pass.kind, pass.record), next);
      void queryClient.invalidateQueries({ queryKey: ["exit-passes", "waiting"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    // A refusal 「已刷新为最新状态」 means it: read the pass again.
    refresh: () => void queryClient.invalidateQueries({ queryKey: exitPassKey(pass.kind, pass.record) }),
    attachments: () =>
      void queryClient.invalidateQueries({ queryKey: recordAttachmentsKey(pass.kind, pass.record) }),
  };
}

function failure(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

/** 「张三、李四、王五 等 7 人」 - the first few, and how many (lead 11-18). */
export function useSignerLine() {
  const t = useTranslations("exitPass");
  return (signers: ExitPass["signers"]) => {
    const names = signers.names.join(t("nameSeparator"));
    return signers.total > signers.names.length
      ? t("approval.signersMore", { names, total: signers.total })
      : t("approval.signers", { names });
  };
}

/**
 * The three parts. `readOnly`: 现场记录中心 and the phone's 我提交过的 - every
 * fact, no button. The 出门条 window draws them too, where a safety manager
 * on a phone signs (no PIN - the phone never asks).
 */
export function ExitPassSections({
  pass,
  readOnly = false,
}: {
  pass: ExitPass;
  readOnly?: boolean;
}) {
  const t = useTranslations("exitPass");
  const df = useDateFormat();
  const legacy = pass.state === "legacy";
  return (
    <div className="space-y-4" data-exit-pass={pass.state}>
      {/* The record ended (归档, 退回, 取消): say so once, plainly - every
          part below is then facts only, and none of it waits for anyone. */}
      {pass.record_closed && !legacy && pass.state !== "not_ready" ? (
        <p
          role="status"
          data-exit-pass-closed={pass.record_closed}
          className="rounded-lg border bg-muted/40 px-3 py-2 text-sm leading-6 text-muted-foreground"
        >
          {pass.record_closed !== "archived" && pass.sent
            ? t("closed.voided")
            : t(`closed.${pass.record_closed}`)}
        </p>
      ) : null}
      {/* 改正 after the signature (contract v2 §11): the pass is a view of
          the record, so it says the facts changed and when. */}
      {pass.corrected_after_approval && !legacy ? (
        <p
          role="status"
          data-exit-pass-corrected
          className="rounded-lg border border-info/25 bg-info/5 px-3 py-2 text-sm leading-6"
        >
          {t("correctedAfter", {
            when: df.dateTime(pass.corrected_after_approval.at),
            by: pass.corrected_after_approval.by,
          })}
        </p>
      ) : null}
      <ApprovalPart pass={pass} readOnly={readOnly} />
      {legacy ? null : <ExternalPart pass={pass} readOnly={readOnly} />}
      {legacy ? null : <ReleasePart pass={pass} />}
    </div>
  );
}

/* ------------------------------------------------- 出门条批准（安全经理） */

function ApprovalPart({ pass, readOnly }: { pass: ExitPass; readOnly: boolean }) {
  const t = useTranslations("exitPass");
  const df = useDateFormat();
  const signerLine = useSignerLine();
  const [signing, setSigning] = useState(false);
  const signed = Boolean(pass.approval);
  const badge =
    pass.state === "legacy" || pass.state === "not_ready" ? null : signed ? (
      <StatusBadge label={t("approval.approved")} tone="positive" />
    ) : (
      <StatusBadge label={t("approval.notApproved")} tone="warning" />
    );
  return (
    <ShellPanel title={t("approval.title")} aside={badge} data-exit-pass-part="approval">
      {pass.state === "legacy" ? (
        <p className="text-sm text-muted-foreground">{t("approval.legacy")}</p>
      ) : pass.state === "not_ready" ? (
        <p className="text-sm text-muted-foreground">
          {pass.record_closed ? t("approval.notReadyClosed") : t("approval.notReady")}
        </p>
      ) : pass.approval ? (
        <dl className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 text-sm" data-exit-pass-signed>
          <dt className="text-muted-foreground">{t("approval.name")}</dt>
          <dd className="break-words font-medium">
            {pass.approval.name}
            {pass.approval.title ? (
              <span className="font-normal text-muted-foreground"> · {pass.approval.title}</span>
            ) : null}
          </dd>
          <dt className="text-muted-foreground">{t("approval.signature")}</dt>
          <dd>
            <SignatureImage url={pass.approval.signature} label={t("approval.signature")} />
          </dd>
          <dt className="text-muted-foreground">{t("approval.at")}</dt>
          <dd className="tabular font-medium">{df.dateTime(pass.approval.at)}</dd>
        </dl>
      ) : pass.record_closed ? (
        <p className="text-sm text-muted-foreground">{t("approval.closedUnsigned")}</p>
      ) : (
        <div className="space-y-3">
          <p className="rounded-md bg-warning/10 px-2 py-1.5 text-sm font-medium text-warning" role="status">
            {t("approval.notSentYet")}
          </p>
          {pass.no_signers ? (
            <NoSignersHelp project={pass.project} onlyApplicant={pass.applicant_is_only_signer} />
          ) : (
            <p className="text-sm text-muted-foreground" data-exit-pass-signers>
              {signerLine(pass.signers)}
            </p>
          )}
          {pass.can_sign && !readOnly ? (
            <Button className="min-h-11 w-full" data-exit-pass-sign onClick={() => setSigning(true)}>
              <PenLine />
              {t("approval.sign")}
            </Button>
          ) : null}
        </div>
      )}
      {signing ? <SignDialog pass={pass} onClose={() => setSigning(false)} /> : null}
    </ShellPanel>
  );
}

/** A drawn signature: ink on white in both modes (JB172), whole. */
function SignatureImage({ url, label }: { url: string; label: string }) {
  return (
    <div className="relative aspect-3/1 w-full max-w-60 overflow-hidden rounded-lg border border-panel-border bg-paper" data-paper>
      <Image src={url} alt={label} fill sizes="240px" className="object-contain" unoptimized />
    </div>
  );
}

/**
 * Nobody on this project can sign (contract §9): the section's own three
 * steps, in terms of the 「安全验收」 permission and being on the project -
 * never a preset role's name (JB219 removes them) - and never a dead button.
 */
function NoSignersHelp({ project, onlyApplicant }: { project: string; onlyApplicant: boolean }) {
  const t = useTranslations("exitPass.noSigners");
  const { can, user } = useAuth();
  const mayStaff = can("project.assign") && !user?.is_field_staff;
  return (
    <div
      role="alert"
      data-exit-pass-no-signers
      className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-5"
    >
      <p className="font-medium text-foreground">{onlyApplicant ? t("onlyApplicant") : t("title")}</p>
      <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
        <li>{t("permission")}</li>
        <li>{t("project")}</li>
        <li>{t("account")}</li>
      </ol>
      {mayStaff && project ? (
        <Button asChild size="sm" variant="outline">
          <Link href={`/projects/${project}#project-team`} target="_blank" rel="noopener noreferrer">
            <UserPlus className="size-4" />
            {t("openTeam")}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

/**
 * 【签名批准】: the pad, the 「需要外部审批」 switch, and one sentence saying
 * what happens the moment it is signed - so nobody signs not knowing that the
 * 出门条 goes to the applicant and the gate at once.
 */
export function SignDialog({ pass, onClose }: { pass: ExitPass; onClose: () => void }) {
  const t = useTranslations("exitPass");
  const settle = useSettle(pass);
  const [signature, setSignature] = useState<File | undefined>();
  const [external, setExternal] = useState(pass.external.required);
  const sign = useMutation({
    mutationFn: () => signExitPass(pass.kind, pass.record, signature!, external),
    onSuccess: (next) => {
      settle.done(next);
      onClose();
    },
    onError: settle.refresh,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg" data-exit-pass-sign-dialog>
        <DialogHeader>
          <DialogTitle>{t("signDialog.title")}</DialogTitle>
          <DialogDescription>{[pass.reference, pass.summary].filter(Boolean).join(" · ")}</DialogDescription>
        </DialogHeader>
        <FieldSignaturePad
          label={t("signDialog.signature")}
          clearLabel={t("signDialog.clear")}
          required
          value={signature}
          onChange={setSignature}
        />
        {pass.external.can_set ? (
          <label className="flex items-start gap-3 rounded-lg border px-3 py-2">
            <Switch
              checked={external}
              onCheckedChange={setExternal}
              aria-label={t("external.switch")}
              className="mt-0.5"
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">{t("external.switch")}</span>
              <span className="block text-xs text-muted-foreground">{t("external.switchHelp")}</span>
            </span>
          </label>
        ) : null}
        <p
          role="status"
          data-exit-pass-next={external ? "external" : "send"}
          className="rounded-md border border-info/25 bg-info/5 px-3 py-2 text-sm leading-6"
        >
          {external ? t("signDialog.nextExternal") : t("signDialog.nextSend")}
        </p>
        {sign.isError ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {failure(sign.error, t("failed"))}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            className="min-h-11"
            requires={[[signature, t("signDialog.signature")]]}
            disabled={sign.isPending}
            onClick={() => sign.mutate()}
          >
            {sign.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {t("approval.sign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------- 外部审批 */

function ExternalPart({ pass, readOnly }: { pass: ExitPass; readOnly: boolean }) {
  const t = useTranslations("exitPass");
  const df = useDateFormat();
  const { user } = useAuth();
  const settle = useSettle(pass);
  const external = pass.external;
  const acting = !readOnly && !pass.record_closed;
  const toggle = useMutation({
    mutationFn: (required: boolean) => setExitPassExternalRequired(pass.kind, pass.record, required),
    onSuccess: settle.done,
    onError: settle.refresh,
  });
  const badge =
    external.status === "done" ? (
      <StatusBadge label={t("external.done")} tone="positive" />
    ) : external.status === "waiting" ? (
      <StatusBadge label={t("external.waiting")} tone="warning" />
    ) : (
      <StatusBadge label={t("external.notRequired")} tone="neutral" />
    );
  const waitingNow = pass.state === "awaiting_external" && external.status === "waiting";
  // 「签名」 and 「日期」 by the paper's own rules (contract §2).
  const signatureValue =
    external.mode === "ONLINE" && external.signature ? (
      <SignatureImage url={external.signature} label={t("external.signature")} />
    ) : external.mode === "PAPER" && external.attachment ? (
      <PaperCopyLink pass={pass} />
    ) : null;
  // A phone account never does 外部审批 (web, PIN): it reads.
  const web = !user?.is_field_staff;
  const mayAct = acting && web && (external.can_sign_online || external.can_record_paper || external.can_waive);

  return (
    <ShellPanel title={t("external.title")} aside={badge} data-exit-pass-part="external">
      <div className="space-y-3">
        {external.can_set && acting ? (
          <label className="flex items-start gap-3 rounded-lg border px-3 py-2" data-exit-pass-external-switch>
            <Switch
              checked={external.required}
              disabled={toggle.isPending}
              onCheckedChange={(next) => toggle.mutate(next)}
              aria-label={t("external.switch")}
              className="mt-0.5"
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">{t("external.switch")}</span>
              <span className="block text-xs text-muted-foreground">{t("external.switchHelp")}</span>
            </span>
          </label>
        ) : null}

        {external.status === "not_required" ? (
          <p className="text-sm text-muted-foreground">
            {external.waived_by_name && external.waived_at
              ? t("external.waivedBy", { name: external.waived_by_name, when: df.dateTime(external.waived_at) })
              : t("external.off")}
          </p>
        ) : external.status === "waiting" && !waitingNow ? (
          // Required, but the safety manager has not signed yet.
          <p className="text-sm text-muted-foreground">{t("external.afterSignature")}</p>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 text-sm" data-exit-pass-external-fields>
              <dt className="text-muted-foreground">{t("external.company")}</dt>
              <dd className="break-words font-medium">{external.company || "—"}</dd>
              <dt className="text-muted-foreground">{t("external.name")}</dt>
              <dd className="break-words font-medium">{external.name || "—"}</dd>
              <dt className="text-muted-foreground">{t("external.opinion")}</dt>
              <dd className="whitespace-pre-wrap break-words font-medium">{external.opinion || "—"}</dd>
              <dt className="text-muted-foreground">{t("external.signature")}</dt>
              <dd>{signatureValue ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("external.date")}</dt>
              <dd className="tabular font-medium">{external.date ? df.date(external.date) : "—"}</dd>
            </dl>
            {external.status === "done" && external.recorded_by_name ? (
              <p className="text-xs text-muted-foreground">
                {t(external.mode === "PAPER" ? "external.recordedBy" : "external.signedBy", {
                  name: external.recorded_by_name,
                  when: external.recorded_at ? df.dateTime(external.recorded_at) : "",
                })}
              </p>
            ) : null}
            {/* The wrong file chosen (contract v2): put the right one in its
                place before the gate has released; the old one stays in 附件. */}
            {external.status === "done" && external.mode === "PAPER" && external.can_correct_paper && acting && web ? (
              <div className="space-y-2">
                <p className="text-xs leading-5 text-muted-foreground">{t("external.correctHelp")}</p>
                <ExternalActions pass={pass} />
              </div>
            ) : null}
          </>
        )}

        {waitingNow && pass.record_closed ? (
          <p className="text-xs text-muted-foreground">{t("external.closedWaiting")}</p>
        ) : waitingNow ? (
          <div className="space-y-2">
            <p className="text-xs leading-5 text-muted-foreground">{t("external.howTo")}</p>
            {mayAct ? (
              <ExternalActions pass={pass} />
            ) : (
              // Whose move it is, rather than buttons this reader cannot use.
              <p className="text-xs text-muted-foreground">{t("external.whoActs")}</p>
            )}
          </div>
        ) : null}
      </div>
    </ShellPanel>
  );
}

/**
 * The 外部审批 buttons this reader may press now, each opening its dialog:
 * 【在线签名】, 【登记签回的文件】 (or 【换一个签回的文件】 once one is
 * registered), 【不需要外部审批，直接发出门条】. Drawn in the 外部审批 part
 * and under 【确认归档】 while it waits (contract v2 §11). A phone and a
 * finished record get none: the server's `can_*` say who may.
 */
export function ExternalActions({ pass }: { pass: ExitPass }) {
  const t = useTranslations("exitPass");
  const { user } = useAuth();
  const [dialog, setDialog] = useState<"online" | "paper" | "waive" | null>(null);
  const external = pass.external;
  if (user?.is_field_staff || pass.record_closed) return null;
  const waiting = external.status === "waiting" && pass.state === "awaiting_external";
  const correcting = external.status === "done" && external.mode === "PAPER" && external.can_correct_paper;
  if (!waiting && !correcting) return null;
  return (
    <div className="flex flex-col gap-2" data-exit-pass-external-actions>
      {waiting && external.can_sign_online ? (
        <Button className="min-h-11 w-full" data-exit-pass-online onClick={() => setDialog("online")}>
          <PenLine />
          {t("external.signOnline")}
        </Button>
      ) : null}
      {(waiting && external.can_record_paper) || correcting ? (
        <Button variant="outline" className="min-h-11 w-full" data-exit-pass-paper onClick={() => setDialog("paper")}>
          <FileCheck2 />
          {correcting ? t("external.correctPaper") : t("external.recordPaper")}
        </Button>
      ) : null}
      {waiting && external.can_waive ? (
        <Button
          variant="ghost"
          className="min-h-11 w-full whitespace-normal text-left"
          data-exit-pass-waive
          onClick={() => setDialog("waive")}
        >
          <Send />
          {t("external.waive")}
        </Button>
      ) : null}
      {dialog === "online" ? <OnlineExternalDialog pass={pass} onClose={() => setDialog(null)} /> : null}
      {dialog === "paper" ? <PaperExternalDialog pass={pass} onClose={() => setDialog(null)} /> : null}
      {dialog === "waive" ? <WaiveExternalDialog pass={pass} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

/**
 * The paper copy, as it sits in the record's 附件: 「见附件：signed.pdf」, opened
 * in place - through the 出门条's own address (contract v4 F7), so the guard
 * and a safety manager without the record's page open it too.
 */
function PaperCopyLink({ pass }: { pass: ExitPass }) {
  const t = useTranslations("exitPass");
  const df = useDateFormat();
  const [open, setOpen] = useState(false);
  const file = pass.external.attachment;
  if (!file) return null;
  const previewType = /\.pdf$/i.test(file.name)
    ? "application/pdf"
    : /\.(jpe?g|png|webp|gif)$/i.test(file.name)
      ? "image/*"
      : null;
  return (
    <>
      <button
        type="button"
        className="inline-flex max-w-full items-center gap-1.5 text-left font-medium text-primary underline-offset-4 hover:underline"
        data-exit-pass-paper-file
        onClick={() => setOpen(true)}
      >
        <Eye className="size-4 shrink-0" />
        <span className="break-all">{t("external.seeAttachment", { name: file.name })}</span>
      </button>
      {open ? (
        <FilePreviewDialog
          title={file.name}
          description={
            pass.external.recorded_at ? df.dateTime(pass.external.recorded_at) : pass.reference
          }
          load={() => exitPassPaperCopyObjectUrl(pass.kind, pass.record)}
          previewType={previewType}
          filename={file.name}
          onDownload={() => downloadExitPassPaperCopy(pass.kind, pass.record, file.name)}
          recordKind={pass.kind}
          recordId={pass.record}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * 【在线签名】 (JB217-12): 「对方已有系统在线审批权限的，直接打开该事项签名，
 * 无须另做在线审批系统」. 审批人姓名 is the signer's own; 日期 is today's.
 */
export function OnlineExternalDialog({ pass, onClose }: { pass: ExitPass; onClose: () => void }) {
  const t = useTranslations("exitPass");
  const df = useDateFormat();
  const settle = useSettle(pass);
  const defaults = pass.external.online_defaults;
  const [company, setCompany] = useState(defaults?.company ?? "");
  const [opinion, setOpinion] = useState("");
  const [signature, setSignature] = useState<File | undefined>();
  const sign = useMutation({
    mutationFn: () =>
      signExitPassExternal(pass.kind, pass.record, {
        company: company.trim(),
        opinion: opinion.trim(),
        signature: signature!,
      }),
    onSuccess: (next) => {
      settle.done(next);
      onClose();
    },
    onError: settle.refresh,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg" data-exit-pass-online-dialog>
        <DialogHeader>
          <DialogTitle>{t("onlineDialog.title")}</DialogTitle>
          <DialogDescription>{[pass.reference, pass.summary].filter(Boolean).join(" · ")}</DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("external.company")} required>
          <Input value={company} maxLength={200} onChange={(event) => setCompany(event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("external.name")}>
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">{defaults?.name || "—"}</p>
        </FieldWrapper>
        <FieldWrapper label={t("external.opinion")} optional={t("optional")}>
          <Textarea rows={2} value={opinion} onChange={(event) => setOpinion(event.target.value)} />
        </FieldWrapper>
        <FieldSignaturePad
          label={t("external.signature")}
          clearLabel={t("signDialog.clear")}
          required
          value={signature}
          onChange={setSignature}
        />
        <FieldWrapper label={t("external.date")}>
          <p className="tabular text-sm font-medium">{t("onlineDialog.today", { date: df.date(localToday()) })}</p>
        </FieldWrapper>
        <p role="status" className="rounded-md border border-info/25 bg-info/5 px-3 py-2 text-sm leading-6">
          {t("onlineDialog.next")}
        </p>
        {sign.isError ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {failure(sign.error, t("failed"))}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            className="min-h-11"
            requires={[
              [company.trim(), t("external.company")],
              [signature, t("external.signature")],
            ]}
            disabled={sign.isPending}
            onClick={() => sign.mutate()}
          >
            {sign.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {t("onlineDialog.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 【登记签回的文件】 (JB217-11): 「可打印或通过 Email 发给业主／上级部门，签署交回
 * 后上传至原事项附件」. The signed copy is a file already in this record's
 * 附件, or one uploaded here - which puts it into the same 附件 first.
 */
export function PaperExternalDialog({ pass, onClose }: { pass: ExitPass; onClose: () => void }) {
  const t = useTranslations("exitPass");
  const df = useDateFormat();
  const settle = useSettle(pass);
  // 【换一个签回的文件】: the same form, filled with what was registered.
  const correcting = pass.external.status === "done" && pass.external.mode === "PAPER";
  const was = correcting ? pass.external : null;
  const attachments = useQuery({
    queryKey: recordAttachmentsKey(pass.kind, pass.record),
    queryFn: () => getRecordAttachments(pass.kind, pass.record),
  });
  const existing = attachments.data?.attachments ?? [];
  // "" until chosen; "upload" for a file chosen here.
  const [source, setSource] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [company, setCompany] = useState(was?.company ?? "");
  const [name, setName] = useState(was?.name ?? "");
  const [opinion, setOpinion] = useState(was?.opinion ?? "");
  const [date, setDate] = useState(was?.date ?? localToday());
  const uploading = source === "upload";
  const chosen = uploading ? files.length > 0 : existing.some((row) => row.id === source);
  const save = useMutation({
    mutationFn: () =>
      recordExitPassExternalPaper(pass.kind, pass.record, {
        company: company.trim(),
        name: name.trim(),
        opinion: opinion.trim(),
        date,
        ...(uploading ? { file: files[0] } : { attachment: source }),
      }),
    onSuccess: (next) => {
      settle.done(next);
      settle.attachments();
      onClose();
    },
    onError: settle.refresh,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg" data-exit-pass-paper-dialog>
        <DialogHeader>
          <DialogTitle>{correcting ? t("external.correctPaper") : t("paperDialog.title")}</DialogTitle>
          <DialogDescription>{correcting ? t("external.correctHelp") : t("paperDialog.help")}</DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("paperDialog.file")} required>
          <div className="space-y-2" role="radiogroup" aria-label={t("paperDialog.file")}>
            {attachments.isLoading ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {t("loading")}
              </p>
            ) : existing.length === 0 && !attachments.isError ? (
              <p className="text-xs text-muted-foreground">{t("paperDialog.noAttachments")}</p>
            ) : (
              existing.map((row) => (
                <label
                  key={row.id}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                    source === row.id && "border-primary bg-primary/5",
                  )}
                >
                  <input
                    type="radio"
                    name="exit-pass-paper-file"
                    className="size-4 accent-primary"
                    checked={source === row.id}
                    onChange={() => setSource(row.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-all font-medium">{row.original_name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.uploaded_by_name ?? "—"} · {df.dateTime(row.uploaded_at)}
                    </span>
                  </span>
                </label>
              ))
            )}
            <QueryFailedNote query={attachments} what={t("paperDialog.whatAttachments")} />
            <label
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                uploading && "border-primary bg-primary/5",
              )}
            >
              <input
                type="radio"
                name="exit-pass-paper-file"
                className="size-4 accent-primary"
                checked={uploading}
                onChange={() => setSource("upload")}
              />
              <span className="font-medium">{t("paperDialog.uploadNow")}</span>
            </label>
            {uploading ? (
              <AttachmentPicker
                files={files}
                onChange={(next) => setFiles(next.slice(-1))}
                rule={{ maxFiles: 1, maxBytes: attachments.data?.max_bytes, multiple: false }}
              />
            ) : null}
          </div>
        </FieldWrapper>
        <FieldWrapper label={t("external.company")} required>
          <Input value={company} maxLength={200} onChange={(event) => setCompany(event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("external.name")} required>
          <Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("external.opinion")} optional={t("optional")}>
          <Textarea rows={2} value={opinion} onChange={(event) => setOpinion(event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("external.date")} required hint={t("paperDialog.dateHint")}>
          <Input type="date" value={date} max={localToday()} onChange={(event) => setDate(event.target.value)} />
        </FieldWrapper>
        <p role="status" className="rounded-md border border-info/25 bg-info/5 px-3 py-2 text-sm leading-6">
          {correcting ? t("paperDialog.nextCorrect") : t("paperDialog.next")}
        </p>
        {save.isError ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {failure(save.error, t("failed"))}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            className="min-h-11"
            requires={[
              [chosen, t("paperDialog.file")],
              [company.trim(), t("external.company")],
              [name.trim(), t("external.name")],
              [date, t("external.date")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <FileCheck2 />}
            {t("paperDialog.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 【不需要外部审批，直接发出门条】 (lead 11-18: no dead end): signed, waiting
 * for an 外部审批 that is not coming. One plain sentence says what happens,
 * then the PIN; the 出门条 goes out at once by the internal flow.
 */
export function WaiveExternalDialog({ pass, onClose }: { pass: ExitPass; onClose: () => void }) {
  const t = useTranslations("exitPass");
  const settle = useSettle(pass);
  const waive = useMutation({
    mutationFn: () => setExitPassExternalRequired(pass.kind, pass.record, false, true),
    onSuccess: (next) => {
      settle.done(next);
      onClose();
    },
    onError: settle.refresh,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" data-exit-pass-waive-dialog>
        <DialogHeader>
          <DialogTitle>{t("external.waive")}</DialogTitle>
          <DialogDescription>{t("waiveDialog.body")}</DialogDescription>
        </DialogHeader>
        {waive.isError ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {failure(waive.error, t("failed"))}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button className="min-h-11" disabled={waive.isPending} onClick={() => waive.mutate()}>
            {waive.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {t("waiveDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------- 门岗放行 */

function ReleasePart({ pass }: { pass: ExitPass }) {
  const t = useTranslations("exitPass");
  const df = useDateFormat();
  const { can } = useAuth();
  const [opened, setOpened] = useState<string | null>(null);
  const sent = pass.sent;
  const released = pass.releases.length > 0;
  // A 工地清运 that ended with no lorry released waits for nothing (contract v4 F8).
  const ended = pass.release_ended && !released;
  const badge = !sent || ended ? null : released && !pass.multi_release ? (
    <StatusBadge label={t("release.released")} tone="positive" />
  ) : released ? (
    <StatusBadge label={t("release.trips", { count: pass.releases.length })} tone="positive" />
  ) : (
    <StatusBadge label={t("release.waitingBadge")} tone="warning" />
  );
  // The 门岗事项 opens for whoever reads gate records (the office, the gate).
  const mayOpen = can("site_access.view") || can("site_access.scan");
  const applicant = sent?.to.filter((one) => one.role === "applicant").map((one) => one.name) ?? [];
  const gate = sent?.to.filter((one) => one.role === "gate").map((one) => one.name) ?? [];
  const separator = t("nameSeparator");
  return (
    <ShellPanel title={t("release.title")} aside={badge} data-exit-pass-part="release">
      {!sent ? (
        <p className="text-sm text-muted-foreground">
          {pass.state === "awaiting_external"
            ? t("release.notSentExternal")
            : pass.record_closed
              ? t("release.notSentClosed")
              : t("release.notSent")}
        </p>
      ) : (
        <div className="space-y-2 text-sm">
          <p data-exit-pass-sent>
            {t("release.sentTo", {
              to: [
                applicant.length ? t("release.toApplicant", { names: applicant.join(separator) }) : "",
                gate.length ? t("release.toGate", { names: gate.join(separator) }) : "",
              ]
                .filter(Boolean)
                .join(t("release.toSeparator")),
              when: df.dateTime(sent.at),
            })}
          </p>
          {sent.no_gate_phones ? (
            <p className="rounded-md bg-warning/10 px-2 py-1.5 text-xs font-medium text-warning" data-exit-pass-no-gate>
              {t("release.noGatePhones")}
            </p>
          ) : null}
          {released ? (
            <ul className="space-y-1.5">
              {pass.releases.map((release) => (
                <li
                  key={release.incident_id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2"
                  data-exit-pass-release={release.incident_no}
                >
                  <span className="min-w-0 flex-1">
                    {t("release.done", {
                      name: release.by,
                      when: df.dateTime(release.at),
                      count: release.photos.length,
                    })}
                    <span className="tabular block text-xs text-muted-foreground">{release.incident_no}</span>
                  </span>
                  {mayOpen ? (
                    <Button size="sm" variant="outline" onClick={() => setOpened(release.incident_id)}>
                      <Eye />
                      {t("release.open")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {released ? null : pass.record_closed ? (
            <p className="text-muted-foreground">{t("release.closedUnreleased")}</p>
          ) : ended ? (
            <p className="text-muted-foreground" data-exit-pass-release-ended>
              {t("release.ended")}
            </p>
          ) : (
            <p className="text-muted-foreground">{t("release.waiting")}</p>
          )}
        </div>
      )}
      {opened ? <GateIncidentDetailDialog id={opened} onClose={() => setOpened(null)} /> : null}
    </ShellPanel>
  );
}
