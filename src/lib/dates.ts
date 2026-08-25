"use client";

import { formatDistanceToNow } from "date-fns";
import { enGB, ms, zhCN, zhTW } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";
import { useLocale } from "next-intl";
import { useMemo } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { resolveLocale, type Locale } from "@/i18n/config";

/**
 * Dates, in the reader's language.
 *
 * `dd MMM yyyy` throughout — day first, month named. Malaysia writes dates day
 * first, and a named month is the only way `03/04` stops being ambiguous
 * between a Malaysian reader and an American one on the same settlement.
 *
 * The pattern is fixed; the language is not. Passing the locale is what turns
 * `23 Jul 2026` into `23 7月 2026` and `23 Jul 2026` respectively, which is
 * the whole point: a screen the platform promises in three languages should
 * not print its dates in one.
 */

const DATE_LOCALES: Record<Locale, DateFnsLocale> = {
  en: enGB,
  zh: zhCN,
  "zh-TW": zhTW,
  ms,
};

const INTL_LOCALES: Record<Locale, string> = {
  en: "en-GB",
  zh: "zh-CN",
  "zh-TW": "zh-TW",
  ms: "ms-MY",
};

type DateInput = string | number | Date | null | undefined;

export interface DateFormatter {
  /** `23 Jul 2026`. Empty string for a null or unparseable value. */
  date: (value: DateInput) => string;
  /** `23 Jul 2026 14:59`. */
  dateTime: (value: DateInput) => string;
  /** `23 Jul 2026 14:59:07`. For audit and weighing, where seconds matter. */
  precise: (value: DateInput) => string;
  /** `3 hours ago`. For liveness, never for a record's own timestamp. */
  relative: (value: DateInput) => string;
}

export function useDateFormat(): DateFormatter {
  const resolvedLocale = resolveLocale(useLocale());
  const locale = DATE_LOCALES[resolvedLocale];
  const { user } = useAuth();
  const dateFormat = user?.company_preferences?.date_format;
  const timeFormat = user?.company_preferences?.time_format ?? "24H";
  const configuredTimezone =
    user?.company_preferences?.timezone || user?.timezone || "Asia/Kuala_Lumpur";

  return useMemo(() => {
    // A record can carry a null date, and an API can return something
    // unparseable. Neither is worth crashing a table over: `Invalid Date`
    // throws inside `format`, which would take the whole page down.
    function parse(value: DateInput) {
      if (value === null || value === undefined || value === "") return null;
      const parsed = value instanceof Date ? value : new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function parts(
      value: Date,
      options: Intl.DateTimeFormatOptions,
    ): Record<string, string> {
      return Object.fromEntries(
        new Intl.DateTimeFormat(INTL_LOCALES[resolvedLocale], {
          ...options,
          timeZone: configuredTimezone,
        })
          .formatToParts(value)
          .filter((part) => part.type !== "literal")
          .map((part) => [part.type, part.value]),
      );
    }

    function renderDate(value: Date): string {
      if (!dateFormat) {
        return new Intl.DateTimeFormat(INTL_LOCALES[resolvedLocale], {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: configuredTimezone,
        }).format(value);
      }
      const dateParts = parts(value, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      if (dateFormat === "MM/DD/YYYY") {
        return `${dateParts.month}/${dateParts.day}/${dateParts.year}`;
      }
      if (dateFormat === "YYYY-MM-DD") {
        return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
      }
      return `${dateParts.day}/${dateParts.month}/${dateParts.year}`;
    }

    function renderTime(value: Date, includeSeconds = false): string {
      const timeParts = parts(value, {
        hour: "2-digit",
        minute: "2-digit",
        ...(includeSeconds ? { second: "2-digit" } : {}),
        hour12: timeFormat === "12H",
        ...(timeFormat === "24H" ? { hourCycle: "h23" } : {}),
      });
      const clock = [
        timeParts.hour,
        timeParts.minute,
        ...(includeSeconds ? [timeParts.second] : []),
      ].join(":");
      return timeParts.dayPeriod ? `${clock} ${timeParts.dayPeriod}` : clock;
    }

    return {
      date: (value) => {
        const parsed = parse(value);
        return parsed ? renderDate(parsed) : "";
      },
      dateTime: (value) => {
        const parsed = parse(value);
        return parsed ? `${renderDate(parsed)} ${renderTime(parsed)}` : "";
      },
      precise: (value) => {
        const parsed = parse(value);
        return parsed
          ? `${renderDate(parsed)} ${renderTime(parsed, true)}`
          : "";
      },
      relative: (value) => {
        const parsed = parse(value);
        return parsed
          ? formatDistanceToNow(parsed, { addSuffix: true, locale })
          : "";
      },
    };
  }, [configuredTimezone, dateFormat, locale, resolvedLocale, timeFormat]);
}
