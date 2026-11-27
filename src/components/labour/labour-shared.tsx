"use client";

/**
 * 人工费用 (JB295): the small pieces the 人工费用 page, the 人工单价设定 window
 * and the 人工结算单 page share - who may do what, the month helpers, and how
 * a rate, a group and a company are written on screen.
 */

import { useTranslations } from "next-intl";

import { rentalMoney } from "@/components/equipment-hours/rental-fees";
import { StatusBadge } from "@/components/shared/page-primitives";
import type { LabourGroup, LabourMethod, LabourRatePiece, LabourRateUsed } from "@/services/labour.service";

/** Reads the pages and the live figures. */
export const LABOUR_VIEW = "labour.view";
/** Rates, 正常工时, 调整, 确认 / 取消确认, 结算单, 核对 and 结算. */
export const LABOUR_MANAGE = "labour.manage";

/** RM with two places, or 「—」 (no rate, or 金额查看 off). */
export const labourMoney = rentalMoney;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `YYYY-MM` of the month before the one `now` is in: the last one that is over. */
export function lastFinishedMonth(now: Date = new Date()): string {
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${previous.getFullYear()}-${pad(previous.getMonth() + 1)}`;
}

/** `YYYY-MM-DD` of today in the browser. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whether `value` is a `YYYY-MM` month. */
export function isMonth(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

/** The last day of a `YYYY-MM` month as `DD/MM` - 「这个月还没过完（到 30/11）」. */
export function monthEndShort(month: string): string {
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return `${pad(last)}/${pad(number)}`;
}

/** Hours as the screen writes them: 「8」, 「8.5」, 「7.25」 - never 「8.00」. */
export function hoursText(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return String(Math.round(number * 100) / 100);
}

/** An hours box: a number from 0 to 24, at most two places. */
export function validHours(value: string): boolean {
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(value.trim())) return false;
  const number = Number(value);
  return number >= 0 && number <= 24;
}

/** 「人员名单」 or 「App 账号」, as a small badge beside the name. */
export function GroupBadge({ group }: { group: LabourGroup }) {
  const t = useTranslations("jb295");
  return <StatusBadge label={t(`group.${group}`)} tone={group === "app" ? "info" : "neutral"} />;
}

type Translate = ReturnType<typeof useTranslations>;

/** 「日薪 RM 120.00」 / 「时薪 RM 15.00」. */
export function ratePrice(t: Translate, method: LabourMethod, unitPrice: string | null): string {
  return t("rate.methodPrice", { method: t(`method.${method}`), amount: labourMoney(unitPrice) });
}

/** 「超时 RM 20.00 / 小时」, or 「没有超时单价」. */
export function overtimeText(t: Translate, overtimeRate: string | null | undefined): string {
  return overtimeRate && Number(overtimeRate) > 0
    ? t("rate.overtimePrice", { amount: labourMoney(overtimeRate) })
    : t("rate.noOvertime");
}

/** One rate in a line: 「日薪 RM 120.00 · 超时 RM 20.00 / 小时」. */
export function rateLine(t: Translate, rate: LabourRateUsed | LabourRatePiece): string {
  return `${ratePrice(t, rate.method, rate.unit_price)} · ${overtimeText(t, rate.overtime_rate)}`;
}

/** The company as written: 「本公司」 and 「未填所属公司」 in the reader's words. */
export function companyText(t: Translate, key: string, name: string): string {
  if (key === "self") return t("company.self");
  if (key === "none" || !key) return t("company.none");
  return name;
}

/** The trade as written: 「未填工种」 when there is none. */
export function tradeText(t: Translate, name: string | null | undefined): string {
  return name?.trim() ? name : t("trade.none");
}
