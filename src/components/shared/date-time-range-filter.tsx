"use client";

/**
 * 「开始日期 时间 – 结束日期 时间」 on a 24-hour clock (I15, ID62), for the
 * three 工地门禁 lists: 日常拍照记录, 门岗事项 and 访客进退场记录.
 *
 * Lucas: 「门岗筛选是按日期和时间24小时的时间，不是日期至日期」. Each end is a
 * date and a time typed as `HH:mm` - a typed box, not the browser's time
 * picker, which shows AM / PM wherever the computer is set to a 12-hour
 * clock. Quick buttons 今天 · 昨天 · 最近 1 小时. The range lives in the address
 * (`occurred_from` / `occurred_to`), so a filtered list is a link, and the
 * export follows it. The rules are in `@/lib/gate-time-range`.
 */

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { useListQuery } from "@/hooks/use-list-query";
import {
  QUICK_RANGES,
  isBackwards,
  normalizeClock,
  quickRange,
  rangeFromDates,
  rangeFromParts,
  splitLocal,
  wallClock,
  type LocalRange,
} from "@/lib/gate-time-range";
import { cn } from "@/lib/utils";

/** The keys a list using this filter reads from the address. */
export const DATE_TIME_RANGE_KEYS = ["occurred_from", "occurred_to", "date_from", "date_to"] as const;

/** The company's clock, the one the office reads every time on (`useDateFormat`). */
export function useCompanyTimeZone(): string {
  const { user } = useAuth();
  return user?.company_preferences?.timezone || user?.timezone || "Asia/Kuala_Lumpur";
}

type Parts = { fromDate: string; fromTime: string; toDate: string; toTime: string };

function partsOf(range: LocalRange): Parts {
  const from = splitLocal(range.occurred_from);
  const to = splitLocal(range.occurred_to);
  return { fromDate: from.date, fromTime: from.time, toDate: to.date, toTime: to.time };
}

export function DateTimeRangeFilter({ list }: { list: ReturnType<typeof useListQuery> }) {
  const t = useTranslations("dateTimeRange");
  const timeZone = useCompanyTimeZone();
  const { filters, setFilters } = list;
  const legacy = Boolean(filters.date_from || filters.date_to);
  const current: LocalRange = legacy
    ? rangeFromDates(filters)
    : { occurred_from: filters.occurred_from, occurred_to: filters.occurred_to };

  // The boxes follow the address (a quick button, the back button, a link).
  const shownKey = `${current.occurred_from ?? ""}|${current.occurred_to ?? ""}`;
  const [seen, setSeen] = useState(shownKey);
  const [parts, setParts] = useState<Parts>(() => partsOf(current));
  const [badTime, setBadTime] = useState<"from" | "to" | null>(null);
  if (seen !== shownKey) {
    setSeen(shownKey);
    setParts(partsOf(current));
    setBadTime(null);
  }

  // An older link's whole days (`date_from` / `date_to`) become the same
  // range in the new parameters, once, so the boxes show what is listed.
  const { occurred_from: legacyFrom, occurred_to: legacyTo } = current;
  useEffect(() => {
    if (!legacy) return;
    setFilters({
      date_from: undefined,
      date_to: undefined,
      occurred_from: legacyFrom,
      occurred_to: legacyTo,
    });
  }, [legacy, legacyFrom, legacyTo, setFilters]);

  const apply = (next: LocalRange) =>
    setFilters({
      occurred_from: next.occurred_from,
      occurred_to: next.occurred_to,
      date_from: undefined,
      date_to: undefined,
    });

  const commit = (next: Parts) => {
    setParts(next);
    const range = rangeFromParts(next, wallClock(new Date(), timeZone).date);
    // Leaving a box without changing it is not a new search: the list keeps
    // its page.
    if (
      !legacy &&
      range.occurred_from === current.occurred_from &&
      range.occurred_to === current.occurred_to
    ) {
      return;
    }
    apply(range);
  };

  /** A typed time, tidied to HH:mm, or flagged and kept off the list. */
  const commitTime = (end: "from" | "to", text: string) => {
    const key = end === "from" ? "fromTime" : "toTime";
    if (!text.trim()) {
      setBadTime(null);
      commit({ ...parts, [key]: "" });
      return;
    }
    const clock = normalizeClock(text);
    if (!clock) {
      setBadTime(end);
      return;
    }
    setBadTime(null);
    commit({ ...parts, [key]: clock });
  };

  const hasRange = Boolean(current.occurred_from || current.occurred_to);
  const backwards = isBackwards(current);

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto" data-date-time-range>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <span className="flex min-w-0 flex-1 items-center gap-1 sm:flex-none">
          <Input
            type="date"
            aria-label={t("startDate")}
            title={t("startDate")}
            className="min-w-0 flex-1 sm:w-36 sm:flex-none"
            value={parts.fromDate}
            onChange={(event) => commit({ ...parts, fromDate: event.target.value })}
          />
          <ClockInput
            label={t("startTime")}
            placeholder={t("timePlaceholder")}
            value={parts.fromTime}
            invalid={badTime === "from"}
            onDraft={(text) => setParts((draft) => ({ ...draft, fromTime: text }))}
            onCommit={(text) => commitTime("from", text)}
          />
        </span>
        <span className="text-xs text-muted-foreground">{t("to")}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1 sm:flex-none">
          <Input
            type="date"
            aria-label={t("endDate")}
            title={t("endDate")}
            className="min-w-0 flex-1 sm:w-36 sm:flex-none"
            value={parts.toDate}
            onChange={(event) => commit({ ...parts, toDate: event.target.value })}
          />
          <ClockInput
            label={t("endTime")}
            placeholder={t("timePlaceholder")}
            value={parts.toTime}
            invalid={badTime === "to"}
            onDraft={(text) => setParts((draft) => ({ ...draft, toTime: text }))}
            onCommit={(text) => commitTime("to", text)}
          />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {QUICK_RANGES.map((kind) => (
          <Button
            key={kind}
            type="button"
            size="sm"
            variant="outline"
            data-quick-range={kind}
            onClick={() => apply(quickRange(kind, timeZone))}
          >
            {t(`quick.${kind}`)}
          </Button>
        ))}
        {hasRange ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            title={t("clear")}
            aria-label={t("clear")}
            onClick={() => apply({})}
          >
            <X />
          </Button>
        ) : null}
      </div>
      {badTime ? (
        <p role="alert" className="w-full text-xs text-destructive">
          {t("badTime")}
        </p>
      ) : backwards ? (
        <p role="alert" className="w-full text-xs text-destructive">
          {t("backwards")}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A time typed as HH:mm (24-hour). Written to the list when the box is left
 * or Enter is pressed - not on every key, which would search for 「1」 on the
 * way to 「14:00」.
 */
function ClockInput({
  label,
  placeholder,
  value,
  invalid,
  onDraft,
  onCommit,
}: {
  label: string;
  placeholder: string;
  value: string;
  invalid: boolean;
  onDraft: (text: string) => void;
  onCommit: (text: string) => void;
}) {
  return (
    <Input
      inputMode="numeric"
      autoComplete="off"
      maxLength={5}
      aria-label={label}
      title={label}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      className={cn("w-20 shrink-0 tabular", invalid && "border-destructive")}
      value={value}
      onChange={(event) => onDraft(event.target.value)}
      onBlur={(event) => onCommit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommit(event.currentTarget.value);
      }}
    />
  );
}
