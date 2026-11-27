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
 */

import { Link2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/shared/page-primitives";
import type { DisposalRequest } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import { DISPOSAL_FEES_HREF, disposalSettlementHref, feeStateTone, rmText } from "@/lib/disposal-fees";

type FeeRow = Pick<
  DisposalRequest,
  "cleared_on" | "fee_per_trip" | "fee_amount" | "fee_state" | "settlement" | "amounts_hidden" | "trip_count" | "actual_weight_kg"
>;

/** 结算状态 as a badge; nothing on 废料处理 (no fee state). */
export function FeeStateBadge({ row }: { row: Pick<DisposalRequest, "fee_state"> }) {
  const t = useTranslations("jb287");
  if (!row.fee_state) return <span className="text-muted-foreground">—</span>;
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
  const df = useDateFormat();
  if (!row.fee_state) return null;
  const internal = row.fee_state === "internal";
  const noFee = row.fee_state === "no_fee";
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
                <dt className="text-xs text-muted-foreground">{t("panel.feeAmount")}</dt>
                <dd className="tabular font-semibold">{rmText(row.fee_amount)}</dd>
              </div>
            </>
          )}
        </dl>
      )}
      {noFee ? (
        <p className="mt-2 text-sm text-destructive" data-slot="disposal-fee-missing">
          {t("panel.noFee")}{" "}
          <Link href={DISPOSAL_FEES_HREF} className="font-medium text-primary underline underline-offset-2">
            {t("panel.setFee")}
          </Link>
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
 */
export function DisposalFeeTotal({ fees }: { fees: { amount_total: string | null; no_fee_count: number } }) {
  const t = useTranslations("jb287");
  return (
    <section className="surface-panel rounded-xl px-4 py-3 text-sm sm:px-6" data-slot="disposal-fee-total">
      <p className="tabular font-semibold">{t("report.total", { amount: rmText(fees.amount_total) })}</p>
      {fees.no_fee_count > 0 ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{t("report.noFee", { count: fees.no_fee_count })}</p>
      ) : null}
    </section>
  );
}
