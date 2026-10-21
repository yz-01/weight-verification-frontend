"use client";

import { useLocale, useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";

/**
 * The PDPA notice on a visitor's pass form (J33-4, Lucas 10-20: 要加).
 *
 * The company's own words for the reader's language when it wrote some, else
 * the system's, with the keeping time from the company setting (J33-5). The
 * visitor ticks 「我同意」 and the pass cannot be made without it; the very
 * text shown travels with the pass, so what was agreed to is on record.
 */
export function pdpaNoticeText(
  custom: Partial<Record<string, string>> | undefined,
  locale: string,
  fallback: string,
  months: number,
): string {
  // 「告知文字里的保存期限跟着这个设定自动显示」: {months} in the company's words.
  const own = custom?.[locale]?.trim().replaceAll("{months}", String(months));
  return own || fallback;
}

export function VisitorConsent({
  notice,
  checked,
  onChange,
}: {
  notice: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const t = useTranslations("siteControl.pdpa");
  return (
    <section className="space-y-2 rounded-lg border bg-muted/30 p-3" data-pdpa-notice>
      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">{notice}</p>
      <label className="flex items-start gap-2 text-sm font-medium">
        <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} aria-label={t("agree")} />
        <span>{t("agree")}</span>
      </label>
    </section>
  );
}

/** The notice to show and send: the company's for this language, else the system's. */
export function useVisitorNotice(custom: Partial<Record<string, string>> | undefined, months: number) {
  const t = useTranslations("siteControl.pdpa");
  const locale = useLocale();
  return pdpaNoticeText(custom, locale, t("defaultNotice", { months }), months);
}
