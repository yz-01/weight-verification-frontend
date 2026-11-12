"use client";

/**
 * 每 48 小时提醒 (JB184, 客户 11-13 「请说明目前系统实际的提醒规则」).
 *
 * A claim that is not finished - waiting for 确认, or confirmed and waiting
 * for the voucher and 【确认已付款】 - says the rule at the top of its detail,
 * and once reminders have gone out, how many and when the last one was. A
 * finished claim (paid, rejected, withdrawn) says nothing. The office's
 * detail and the phone's 我的提交 show the same lines.
 */

import { BellRing } from "lucide-react";
import { useTranslations } from "next-intl";

import { useDateFormat } from "@/lib/dates";

/** The server's rule (`contractor_ops.sundry_reminders.REMINDER_HOURS`). */
export const SUNDRY_REMINDER_HOURS = 48;

/** Still waiting for 确认, or confirmed and waiting for payment. */
export function sundryReminderOpen(status: string | null | undefined): boolean {
  return status === "SUBMITTED" || status === "CONFIRMED";
}

export function SundryReminderNote({
  status,
  hours,
  count,
  lastAt,
}: {
  /** The claim's one status: `sundryStatus(claim)` on the office, the row's on the phone. */
  status: string | null | undefined;
  hours?: number | null;
  count?: number | null;
  lastAt?: string | null;
}) {
  const t = useTranslations("sundryClaim.reminder");
  const df = useDateFormat();
  if (!sundryReminderOpen(status)) return null;
  return (
    <div
      role="note"
      data-slot="sundry-reminder"
      className="flex gap-2 rounded-lg border border-info/25 bg-info/5 px-3 py-2 text-sm leading-6"
    >
      <BellRing className="mt-1 size-4 shrink-0 text-info" aria-hidden />
      <div className="min-w-0">
        <p>{t("rule", { hours: hours || SUNDRY_REMINDER_HOURS })}</p>
        {count && lastAt ? (
          <p className="font-medium">{t("sent", { count, at: df.dateTime(lastAt) })}</p>
        ) : null}
      </div>
    </div>
  );
}
