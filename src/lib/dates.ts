"use client";

import { format, formatDistanceToNow } from "date-fns";
import { enGB, ms, zhCN } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";
import { useLocale } from "next-intl";
import { useMemo } from "react";

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
  ms,
};

export const DATE_PATTERN = "dd MMM yyyy";
export const DATE_TIME_PATTERN = "dd MMM yyyy HH:mm";
export const PRECISE_PATTERN = "dd MMM yyyy HH:mm:ss";

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
  const locale = DATE_LOCALES[resolveLocale(useLocale())];

  return useMemo(() => {
    // A record can carry a null date, and an API can return something
    // unparseable. Neither is worth crashing a table over: `Invalid Date`
    // throws inside `format`, which would take the whole page down.
    function parse(value: DateInput) {
      if (value === null || value === undefined || value === "") return null;
      const parsed = value instanceof Date ? value : new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return {
      date: (value) => {
        const parsed = parse(value);
        return parsed ? format(parsed, DATE_PATTERN, { locale }) : "";
      },
      dateTime: (value) => {
        const parsed = parse(value);
        return parsed ? format(parsed, DATE_TIME_PATTERN, { locale }) : "";
      },
      precise: (value) => {
        const parsed = parse(value);
        return parsed ? format(parsed, PRECISE_PATTERN, { locale }) : "";
      },
      relative: (value) => {
        const parsed = parse(value);
        return parsed
          ? formatDistanceToNow(parsed, { addSuffix: true, locale })
          : "";
      },
    };
  }, [locale]);
}
