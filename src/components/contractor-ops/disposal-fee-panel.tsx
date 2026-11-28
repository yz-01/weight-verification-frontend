"use client";

/**
 * 「清运费用与结算」 on a 垃圾清运 job (JB287, 客户 11-27), and the list's three
 * columns 费用金额｜结算编号｜结算状态 - the two-way link between the job and
 * its settlement.
 *
 * 「系统根据实际验收车次自动关联费用、自动计算及持续累计，无须每次清运重复填写。」
 * Nothing is typed here: 每车费用 is the supplier's fee in force on the 清运日期,
 * 费用金额 = 每车费用 × 实际验收车次, both from the server. An internal job has
 * no fee; a supplier without a fee says so, with the way to set it; from
 * 确认核对 on the job names its 结算编号, which opens the settlement.
 * Weight is shown for what it is: counted, never priced.
 *
 * JB301 (客户 11-28d 事项 5.1 / 5.2): 「未核对的清运费用只能作为参考金额」 -
 * until the job is in a 结算完毕 settlement its amount reads 「参考金额」 and
 * the panel says it is not in 项目现场费用总览 yet. JB299: the settlement's
 * 付款编号 is shown beside its number (the evidence chain).
 */

import { Link2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { useAuth } from "@/components/providers/auth-provider";
import { StatusBadge } from "@/components/shared/page-primitives";
import type { DisposalRequest } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import {
  DISPOSAL_FEES_HREF,
  disposalSettlementHref,
  feeStateTone,
  mayHandleDisposalFees,
  rmText,
} from "@/lib/disposal-fees";

type FeeRow = Pick<
  DisposalRequest,
  "cleared_on" | "fee_per_trip" | "fee_amount" | "fee_state" | "settlement" | "amounts_hidden" | "trip_count" | "actual_weight_kg"
> &
  Partial<Pick<DisposalRequest, "collector_supplier">>;

/**
 * 「没有设费用」 on a job that has no supplier yet (a request still waiting,
 * or an old job whose company was only typed): the fee is not missing, the
 * supplier is - say that instead (QA287).
 */
function noSupplierYet(row: Pick<DisposalRequest, "fee_state"> & Partial<Pick<DisposalRequest, "collector_supplier">>) {
  return row.fee_state === "no_fee" && row.collector_supplier === null;
}

/** 结算状态 as a badge; nothing on 废料处理 (no fee state). */
export function FeeStateBadge({
  row,
}: {
  row: Pick<DisposalRequest, "fee_state"> & Partial<Pick<DisposalRequest, "collector_supplier">>;
}) {
  const t = useTranslations("jb287");
  if (!row.fee_state) return <span className="text-muted-foreground">—</span>;
  if (noSupplierYet(row)) return <StatusBadge label={t("panel.noSupplierState")} tone="neutral" />;
  return <StatusBadge label={t(`state.${row.fee_state}`)} tone={feeStateTone(row.fee_state)} />;
}

/** 结算编号, opening the settlement; a dash before 确认核对. */
export function SettlementNoLink({ row }: { row: Pick<DisposalRequest, "settlement"> }) {
  if (!row.settlement) return <span className="text-muted-foreground">—</span>;
  return (
    <Link
      href={disposalSettlementHref(row.settlement)}
      className="font-medium whitespace-nowrap text-primary underline-offset-2 hover:underline"
      data-slot="disposal-settlement-link"
      onClick={(event) => event.stopPropagation()}
    >
      {row.settlement.number}
    </Link>
  );
}

/** 费用金额 on the list: the amount, or why there is none. */
export function FeeAmountText({ row }: { row: Pick<DisposalRequest, "fee_state" | "fee_amount"> }) {
  const t = useTranslations("jb287");
  if (!row.fee_state || row.fee_state === "internal" || row.fee_state === "no_fee") {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="tabular whitespace-nowrap">
      {rmText(row.fee_amount)}
      {row.fee_state === "running" ? <span className="ml-1 text-xs text-muted-foreground">（{t("state.running")}）</span> : null}
    </span>
  );
}

/** The record's 「清运费用与结算」 panel; nothing on 废料处理. */
export function DisposalFeePanel({ row }: { row: FeeRow }) {
  const t = useTranslations("jb287");
  const t299 = useTranslations("jb299");
  const df = useDateFormat();
  const { can, user } = useAuth();
  // The way to set the fee only for whoever may set it (no dead link).
  const maySetFee = mayHandleDisposalFees(user, can);
  if (!row.fee_state) return null;
  const internal = row.fee_state === "internal";
  const noFee = row.fee_state === "no_fee";
  const noSupplier = noSupplierYet(row);
  return (
    <section className="rounded-lg border bg-card p-3" data-slot="disposal-fee-panel">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("panel.title")}</h3>
      {internal ? (
        <p className="text-sm">{t("panel.internal")}</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">{t("panel.state")}</dt>
            <dd><FeeStateBadge row={row} /></dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("panel.settlementNo")}</dt>
            <dd><SettlementNoLink row={row} /></dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("panel.clearedOn")}</dt>
            <dd className="tabular">{row.cleared_on ? df.date(row.cleared_on) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("panel.trips")}</dt>
            <dd className="tabular">{row.trip_count}</dd>
          </div>
          {noFee ? null : (
            <>
              <div>
                <dt className="text-xs text-muted-foreground">{t("panel.feePerTrip")}</dt>
                <dd className="tabular">{rmText(row.fee_per_trip)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {row.fee_state === "settled" ? t("panel.feeAmount") : t299("panel.referenceAmount")}
                </dt>
                <dd className="tabular font-semibold">{rmText(row.fee_amount)}</dd>
              </div>
            </>
          )}
          {row.settlement ? (
            <div>
              <dt className="text-xs text-muted-foreground">{t299("panel.paymentNo")}</dt>
              <dd data-slot="disposal-fee-payment-no">{row.settlement.payment_no || t299("notUploaded")}</dd>
            </div>
          ) : null}
        </dl>
      )}
      {!internal && !noFee && row.fee_state !== "settled" && row.fee_amount ? (
        <p className="mt-2 text-xs text-muted-foreground" data-slot="disposal-fee-reference">
          {t299("panel.referenceHelp")}
        </p>
      ) : null}
      {noSupplier ? (
        <p className="mt-2 text-sm text-muted-foreground" data-slot="disposal-fee-no-supplier">
          {t("panel.noSupplier")}
        </p>
      ) : null}
      {noFee && !noSupplier ? (
        <p className="mt-2 text-sm text-destructive" data-slot="disposal-fee-missing">
          {t("panel.noFee")}
          {maySetFee ? (
            <>
              {" "}
              <Link href={DISPOSAL_FEES_HREF} className="font-medium text-primary underline underline-offset-2">
                {t("panel.setFee")}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {row.fee_state === "running" ? <p className="mt-2 text-xs text-muted-foreground">{t("panel.running")}</p> : null}
      {row.fee_state === "not_archived" ? <p className="mt-2 text-xs text-muted-foreground">{t("panel.notArchived")}</p> : null}
      {row.amounts_hidden && !internal ? <p className="mt-2 text-xs text-muted-foreground">{t("panel.hidden")}</p> : null}
      {row.settlement ? (
        <p className="mt-2 text-sm">
          <Link
            href={disposalSettlementHref(row.settlement)}
            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
          >
            <Link2 className="size-3.5" />
            {t("panel.openSettlement")}
          </Link>
        </p>
      ) : null}
      {internal ? null : <p className="mt-2 text-xs text-muted-foreground">{t("panel.weightOnly")}</p>}
    </section>
  );
}

/**
 * 清运与回收报表 (JB287: 「所有清运费用自动关联现有「清运与回收报表」」): the
 * 合计 of 垃圾清运's 费用金额 in range, and how many jobs have no fee yet.
 * Finished clearances only, said in one line (QA287): a running job's row
 * shows its amount so far, marked 进行中, and is not added - the same number
 * as 项目现场费用总览's 垃圾清运 for the same project and dates.
 */
export function DisposalFeeTotal({
  fees,
}: {
  fees: {
    amount_total: string | null;
    settled_amount?: string | null;
    reference_amount?: string | null;
    no_fee_count: number;
    running_count?: number;
  };
}) {
  const t = useTranslations("jb287");
  const t299 = useTranslations("jb299");
  return (
    <section className="surface-panel rounded-xl px-4 py-3 text-sm sm:px-6" data-slot="disposal-fee-total">
      <p className="tabular font-semibold">{t("report.total", { amount: rmText(fees.amount_total) })}</p>
      {/* JB301: settled (what 项目现场费用总览 counts) apart from the reference. */}
      {fees.settled_amount !== undefined ? (
        <p className="tabular mt-0.5" data-slot="disposal-fee-settled">
          {t299("report.settled", { amount: rmText(fees.settled_amount) })}
        </p>
      ) : null}
      {fees.reference_amount !== undefined ? (
        <p className="tabular mt-0.5 text-muted-foreground" data-slot="disposal-fee-reference-total">
          {t299("report.reference", { amount: rmText(fees.reference_amount) })}
        </p>
      ) : null}
      {fees.no_fee_count > 0 ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{t("report.noFee", { count: fees.no_fee_count })}</p>
      ) : null}
      <p className="mt-0.5 text-xs text-muted-foreground" data-slot="disposal-fee-running-note">
        {t("report.runningNote")}
      </p>
    </section>
  );
}
