"use client";

/**
 * Multi Engine's signed review loop on the screen (JB252 / JB254, 客户 11-24
 * 事项 3, 11-24b 事项 1). One set of pieces, used by head office in Multi
 * Engine and by a consultant on 「待审阅的资料包」 - the existing pages, the
 * existing upload places, timeline and rounds (「沿用现有页面…无需重新设计页面」):
 *
 * - `ReviewDialog`: 确认通过 per record or 全部确认, 退回补充资料 with what to
 *   add, 审核意见, 本期批准金额 (money types), the drawn signature; the PIN is
 *   asked by the shared dialog when the server answers `sign_off_pin_required`.
 * - `SignaturesBlock`: every round's signatures, both sides.
 * - `CompletePanel`: 「确认完毕并归档」.
 * - `MoneyBlock`: 申请金额 / 本期批准金额 / 差额 / 审批原因.
 * - `progressLabel` / `packageStateLabel`: the list's 「状态」 and 「审阅」.
 */

import { useMutation } from "@tanstack/react-query";
import { Archive, CheckCheck, PenLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Shell } from "@/components/contractor-ops/package-shell";
import { FieldSignaturePad } from "@/components/field-staff/field-signature-pad";
import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CLAIM_PACKAGE_TYPES,
  type EvidencePackageDetail,
  type EvidencePackageRow,
  type PackageItemReviewState,
  type PackageProgress,
  type PackageSignature,
} from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import {
  completeEvidencePackage,
  type PackageReviewPayload,
} from "@/services/contractor-ops.service";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/* -- the list's 状态 / 审阅 ----------------------------------------------------- */

/** 「已确认（已锁定）」 only means locked; 「已完成（已归档）」 once the loop closed. */
export function packageStateLabel(
  row: Pick<EvidencePackageRow, "state" | "completed_at">,
  t: Translate,
  loop: Translate,
): string {
  if (row.completed_at) return loop("stateCompleted");
  return t(`state.${row.state}`);
}

export function progressLabel(
  row: Pick<EvidencePackageRow, "review_progress" | "state">,
  loop: Translate,
): string {
  return loop(`progress.${row.review_progress ?? "NOT_SENT"}`);
}

export function progressTone(progress: PackageProgress | undefined | null) {
  switch (progress) {
    case "RETURNED":
      return "danger" as const;
    case "APPROVED":
    case "COMPLETED":
      return "positive" as const;
    case "IN_REVIEW":
    case "VIEWED":
      return "info" as const;
    case "SENT":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

/* -- money --------------------------------------------------------------------- */

export function isMoneyType(pkg: Pick<EvidencePackageRow, "package_type">) {
  return CLAIM_PACKAGE_TYPES.includes(pkg.package_type ?? "OTHER");
}

export function rm(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return `RM ${number.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 申请金额 minus 本期批准金额, as the review window shows it while typing. */
export function amountDifference(
  claim: string | null | undefined,
  approved: string | null | undefined,
) {
  if (claim === null || claim === undefined || claim === "") return null;
  if (approved === null || approved === undefined || approved.trim() === "")
    return null;
  const a = Number(claim);
  const b = Number(approved.replace(/,/g, ""));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (a - b).toFixed(2);
}

/** JB254 on the package window: the three figures and the reason, read only. */
export function MoneyBlock({ pkg }: { pkg: EvidencePackageDetail }) {
  const loop = useTranslations("jb252");
  if (!isMoneyType(pkg)) return null;
  const money = pkg.money;
  const claim = money?.claim_amount ?? pkg.claim_amount ?? null;
  const approved = money?.approved_amount ?? pkg.approved_amount ?? null;
  // Lucas 11-27 (A): approved only through outside links, which never show or
  // type money (H17 六 7) - no 批准金额, said plainly. With a 申请金额 an
  // in-system approver must type one, so an empty one here means links only.
  const linkOnly = Boolean(money?.approved_at) && !approved && Boolean(claim);
  return (
    <dl
      className="grid gap-1 rounded-lg border p-3 text-sm sm:grid-cols-[11rem_1fr]"
      data-package-money
    >
      <dt className="text-muted-foreground">{loop("money.claim")}</dt>
      <dd className="tabular">{claim ? rm(claim) : "—"}</dd>
      <dt className="text-muted-foreground">{loop("money.approved")}</dt>
      <dd className="tabular">
        {approved ? rm(approved) : "—"}
        {linkOnly && (
          <span className="mt-1 block text-xs text-muted-foreground" data-package-money-link-only>
            {loop("money.linkOnly")}
          </span>
        )}
        {money?.locked && (
          <span className="ml-2 text-xs text-muted-foreground">
            {loop("money.locked")}
          </span>
        )}
      </dd>
      {money?.difference && (
        <>
          <dt className="text-muted-foreground">{loop("money.difference")}</dt>
          <dd className="tabular">{rm(money.difference)}</dd>
        </>
      )}
      {money?.approved_amount_reason && (
        <>
          <dt className="text-muted-foreground">{loop("money.reason")}</dt>
          <dd>{money.approved_amount_reason}</dd>
        </>
      )}
    </dl>
  );
}

/* -- signatures ------------------------------------------------------------------ */

/** The drawn signature: ink on white in both modes (JB172), whole. */
function SignaturePicture({
  url,
  label,
}: {
  url: string | null;
  label: string;
}) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={label}
      className="h-14 max-w-48 rounded border border-panel-border bg-paper object-contain p-1"
    />
  );
}

/** 「每一轮双方的签名、操作人、日期、时间、审核意见及对应资料版本」. */
export function SignaturesBlock({
  signatures,
}: {
  signatures: PackageSignature[] | undefined;
}) {
  const loop = useTranslations("jb252");
  const t = useTranslations("multiEngine");
  const formatter = useDateFormat();
  const rows = [...(signatures ?? [])].reverse();
  // Walk 2 G3: head office has no name - its kind is its name; a QS who signs
  // as himself is named once, not 「美美 · 接收方：美美」.
  const forWhom = (row: PackageSignature) => {
    const name = row.recipient_name || (row.recipient_kind ? t(`exchange.kind.${row.recipient_kind}`) : "");
    return name && name !== row.signer_name ? name : "";
  };
  return (
    <section className="space-y-2" data-package-signatures>
      <h3 className="text-sm font-medium">{loop("signatures.title")}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {loop("signatures.none")}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="space-y-1 rounded-lg border p-3 text-sm"
              data-signature-side={row.side}
            >
              <p className="font-medium">
                {t("exchange.round", { n: row.round_no })} ·{" "}
                {loop(`signatures.side.${row.side}`)} ·{" "}
                <span
                  className={
                    row.action === "RETURNED"
                      ? "text-destructive"
                      : row.action === "APPROVED"
                        ? "text-primary"
                        : ""
                  }
                >
                  {loop(`signatures.action.${row.action}`)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {loop("signatures.by", {
                  name: row.signer_name || "—",
                  when: formatter.dateTime(row.signed_at),
                })}
                {forWhom(row) && <> · {loop("signatures.for", { name: forWhom(row) })}</>}
              </p>
              {row.opinion && (
                <p className="break-words text-xs">
                  {loop("signatures.opinion", { text: row.opinion })}
                </p>
              )}
              {row.decisions.length > 0 && (
                <ul className="text-xs">
                  {row.decisions.map((entry) => (
                    <li
                      key={entry.item}
                      className={
                        entry.decision === "RETURNED"
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }
                    >
                      {entry.reference || entry.record_kind} ·{" "}
                      {loop(`signatures.decision.${entry.decision}`)}
                      {entry.reason && <> · {entry.reason}</>}
                    </li>
                  ))}
                </ul>
              )}
              {(row.claim_amount || row.approved_amount) && (
                <p className="text-xs tabular">
                  {row.claim_amount && (
                    <>
                      {loop("money.claim")} {rm(row.claim_amount)}
                    </>
                  )}
                  {row.approved_amount && (
                    <>
                      {row.claim_amount && " · "}
                      {loop("money.approved")} {rm(row.approved_amount)}
                    </>
                  )}
                  {row.amount_reason && (
                    <>
                      {" "}
                      · {loop("money.reason")}：{row.amount_reason}
                    </>
                  )}
                </p>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <SignaturePicture
                  url={row.signature_url}
                  label={loop("signatures.picture")}
                />
                {row.round_sha256 && (
                  <details className="text-2xs text-muted-foreground">
                    <summary className="cursor-pointer select-none">
                      {t("technicalDetails")}
                    </summary>
                    <p className="mt-1 break-all font-mono">
                      {loop("signatures.version", { digest: row.round_sha256 })}
                    </p>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -- 确认完毕并归档 ------------------------------------------------------------------- */

export function CompletePanel({
  pkg,
  onChanged,
}: {
  pkg: EvidencePackageDetail;
  onChanged: () => void;
}) {
  const loop = useTranslations("jb252");
  const words = useTranslations("jb307b");
  const threeParty = useTranslations("jb309f");
  const formatter = useDateFormat();
  const { can } = useAuth();
  const complete = useMutation({
    mutationFn: () => completeEvidencePackage(pkg.id),
    onSuccess: onChanged,
  });
  if (pkg.completed_at) {
    return (
      <p
        className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"
        data-package-completed
      >
        {loop("complete.done", {
          name: pkg.completed_by_name || "—",
          when: formatter.dateTime(pkg.completed_at),
        })}
      </p>
    );
  }
  // JB307-4 (客户 11-28j): 「总部负责审核批准，项目经理负责最终确认归档」 - head
  // office reads who presses it instead of a button.
  if (pkg.completes_on_project) {
    return (
      <p className="rounded-lg border border-dashed border-panel-border bg-muted/30 p-3 text-sm" data-package-completes-on-project>
        {/* JB309-6: the QS signs; the project manager archives. */}
        {pkg.qs_review?.mine ? threeParty("qsCompletesOnProject") : words("completesOnProject")}
      </p>
    );
  }
  if (!pkg.can_complete || !can("package.manage")) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3"
      data-package-complete
    >
      <p className="min-w-0 flex-1 text-sm">{loop("complete.help")}</p>
      <Button
        size="sm"
        disabled={complete.isPending}
        onClick={() => complete.mutate()}
      >
        <Archive className="size-4" />
        {loop("complete.button")}
      </Button>
    </div>
  );
}

/* -- 审核 ------------------------------------------------------------------------- */

/** One record in the review window: what this reviewer said before, if anything. */
export interface ReviewRecord {
  id: string;
  label: string;
  detail?: string;
  /** This reviewer's answer so far in this round: PENDING is still to decide. */
  mine: PackageItemReviewState;
  reason?: string;
}

type Choice = "ACCEPTED" | "RETURNED" | "";

/**
 * Whether this review approves: every record ends up confirmed (the ones
 * decided before and the ones chosen now), none returned.
 */
export function reviewApproves(
  records: ReviewRecord[],
  choices: Record<string, Choice>,
) {
  if (!records.length) return false;
  return records.every((record) =>
    record.mine === "PENDING"
      ? choices[record.id] === "ACCEPTED"
      : record.mine === "ACCEPTED",
  );
}

export function ReviewDialog({
  pkg,
  records,
  onClose,
  submit,
  onDone,
  help,
  amounts = true,
}: {
  /** `null`: a package link - it never shows an amount (H17 六 7). */
  pkg: EvidencePackageDetail | null;
  records: ReviewRecord[];
  onClose: () => void;
  submit: (payload: PackageReviewPayload) => Promise<unknown>;
  onDone: () => void;
  /** The line on top; a link has no PIN, so it says so in its own words. */
  help?: string;
  /** JB309-5: `false` for the QS - he checks the amount, head office approves it. */
  amounts?: boolean;
}) {
  const loop = useTranslations("jb252");
  const common = useTranslations("common");
  const pending = records.filter((record) => record.mine === "PENDING");
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [opinion, setOpinion] = useState("");
  const [approved, setApproved] = useState(
    pkg?.money?.claim_amount ?? pkg?.claim_amount ?? "",
  );
  const [amountReason, setAmountReason] = useState("");
  const [signature, setSignature] = useState<File | undefined>();

  const approves = reviewApproves(records, choices);
  const money = amounts && pkg !== null && isMoneyType(pkg) && approves;
  const claim = pkg?.money?.claim_amount ?? pkg?.claim_amount ?? null;
  const difference = money ? amountDifference(claim, approved) : null;
  const differs = difference !== null && Number(difference) !== 0;
  const chosen = useMemo(
    () =>
      pending
        .filter((record) => choices[record.id])
        .map((record) => ({
          item: record.id,
          decision: choices[record.id] as "ACCEPTED" | "RETURNED",
          reason:
            choices[record.id] === "RETURNED"
              ? (reasons[record.id] ?? "").trim()
              : "",
        })),
    [pending, choices, reasons],
  );
  const missingReason = chosen.some(
    (entry) => entry.decision === "RETURNED" && !entry.reason,
  );

  const send = useMutation({
    mutationFn: () =>
      submit({
        decisions: chosen,
        opinion: opinion.trim(),
        signature: signature!,
        ...(money
          ? {
              approved_amount: approved.trim(),
              amount_reason: differs ? amountReason.trim() : "",
            }
          : {}),
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  const choose = (id: string, value: Choice) =>
    setChoices((current) => ({ ...current, [id]: value }));

  return (
    <Shell title={loop("review.title")} onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4" data-review-dialog>
        <p className="text-xs text-muted-foreground">{help ?? loop("review.help")}</p>
        {pending.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setChoices(
                Object.fromEntries(
                  pending.map((record) => [record.id, "ACCEPTED" as Choice]),
                ),
              )
            }
            data-review-all
          >
            <CheckCheck className="size-4" />
            {loop("review.allConfirm")}
          </Button>
        )}
        <FieldWrapper
          label={loop("review.records")}
          required
          hint={loop("review.chooseOne")}
        >
          <ul className="space-y-2">
            {records.map((record) => (
              <li
                key={record.id}
                className="space-y-2 rounded-lg border p-3"
                data-review-record
              >
                <p className="text-sm font-medium">{record.label}</p>
                {record.detail && (
                  <p className="text-xs text-muted-foreground">
                    {record.detail}
                  </p>
                )}
                {record.mine !== "PENDING" ? (
                  <p
                    className={`text-xs ${record.mine === "RETURNED" ? "text-destructive" : "text-primary"}`}
                  >
                    {loop("review.decided")} ·{" "}
                    {loop(`signatures.decision.${record.mine}`)}
                    {record.reason && <> · {record.reason}</>}
                  </p>
                ) : (
                  <>
                    <div
                      className="flex flex-wrap gap-2"
                      role="radiogroup"
                      aria-label={record.label}
                    >
                      {(["ACCEPTED", "RETURNED", ""] as const).map((value) => (
                        <button
                          key={value || "none"}
                          type="button"
                          role="radio"
                          aria-checked={(choices[record.id] ?? "") === value}
                          onClick={() => choose(record.id, value)}
                          className={`h-9 rounded-lg border px-3 text-sm transition-colors ${
                            (choices[record.id] ?? "") === value
                              ? value === "RETURNED"
                                ? "border-destructive/50 bg-destructive/10 text-destructive"
                                : "border-primary/40 bg-primary/12 text-primary"
                              : "border-border bg-card text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {value === "ACCEPTED"
                            ? loop("review.accept")
                            : value === "RETURNED"
                              ? loop("review.return")
                              : loop("review.undecided")}
                        </button>
                      ))}
                    </div>
                    {choices[record.id] === "RETURNED" && (
                      <FieldWrapper
                        label={loop("review.returnReason")}
                        required
                      >
                        <Textarea
                          rows={2}
                          value={reasons[record.id] ?? ""}
                          onChange={(event) =>
                            setReasons((current) => ({
                              ...current,
                              [record.id]: event.target.value,
                            }))
                          }
                        />
                      </FieldWrapper>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </FieldWrapper>
        {money && (
          <div className="space-y-3 rounded-lg border p-3" data-review-money>
            <p className="text-sm">
              {loop("money.claim")}：
              <span className="tabular">
                {claim ? rm(claim) : loop("money.notSet")}
              </span>
            </p>
            <FieldWrapper
              label={loop("money.approved")}
              required={Boolean(claim)}
              hint={loop("money.pinHint")}
            >
              <Input
                inputMode="decimal"
                value={approved}
                placeholder={loop("money.placeholder")}
                onChange={(event) => setApproved(event.target.value)}
                className="w-48"
              />
            </FieldWrapper>
            {difference !== null && (
              <p className="text-sm">
                {loop("money.difference")}：
                <span className="tabular">{rm(difference)}</span>
              </p>
            )}
            {differs && (
              <FieldWrapper
                label={loop("money.reason")}
                required
                hint={loop("money.reasonHint")}
              >
                <Textarea
                  rows={2}
                  value={amountReason}
                  onChange={(event) => setAmountReason(event.target.value)}
                />
              </FieldWrapper>
            )}
          </div>
        )}
        <FieldWrapper
          label={loop("review.opinion")}
          required
          hint={loop("review.opinionHint")}
        >
          <Textarea
            rows={3}
            value={opinion}
            onChange={(event) => setOpinion(event.target.value)}
          />
        </FieldWrapper>
        <FieldSignaturePad
          label={loop("sign.label")}
          clearLabel={loop("sign.clear")}
          hint={loop("sign.hint")}
          required
          value={signature}
          onChange={setSignature}
        />
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button
          requires={[
            [chosen.length > 0, loop("review.records")],
            [!missingReason, loop("review.returnReason")],
            [!money || !claim || approved.trim(), loop("money.approved")],
            [!differs || amountReason.trim(), loop("money.reason")],
            [opinion.trim(), loop("review.opinion")],
            [signature, loop("sign.label")],
          ]}
          disabled={send.isPending}
          onClick={() => send.mutate()}
        >
          <PenLine className="size-4" />
          {loop("review.submit")}
        </Button>
      </footer>
    </Shell>
  );
}

/** The 审阅 word of one reviewer (recipient card, consultant's header). */
export function ProgressBadge({
  progress,
}: {
  progress: PackageProgress | null | undefined;
}) {
  const loop = useTranslations("jb252");
  if (!progress) return null;
  return (
    <StatusBadge
      label={loop(`progress.${progress}`)}
      tone={progressTone(progress)}
    />
  );
}
