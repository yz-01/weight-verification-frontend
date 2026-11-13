"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { formatRainDuration } from "@/lib/rain-record";

/**
 * A rain record's duration in the reader's language (JB192): 「1 小时 5 分」,
 * 「45 分钟」 - under an hour only the minutes. The phone and the office both
 * say it this way. Stable while the language is, so a table's columns built
 * with it are not rebuilt on every render.
 */
export function useRainDuration() {
  const t = useTranslations("rainRecords");
  return useCallback(
    (minutes: number | null | undefined) =>
      formatRainDuration(minutes, (key, values) => t(key as "duration.hm", values)),
    [t],
  );
}
