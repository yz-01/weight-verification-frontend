"use client";

/**
 * 「待补规格」 (J39, Lucas 2026-10-22): a delivery or a return the phone sent
 * without its specification - the site did not know it, and 规格 no longer
 * stops the phone. The office sees this tag in the 规格 column and fills the
 * specification in on the record (a spec alone needs no PIN, J7); the tag
 * then goes, and the record counts under that specification.
 */

import { useTranslations } from "next-intl";

/** The 规格 cell of a material list: the words, the tag, or a dash. */
export function SpecCell({ spec, needsSpec }: { spec: string; needsSpec?: boolean }) {
  if (spec) {
    return (
      <span className="block max-w-40 truncate text-foreground" title={spec}>
        {spec}
      </span>
    );
  }
  if (needsSpec) return <SpecPendingTag />;
  return <span className="text-muted-foreground">—</span>;
}

export function SpecPendingTag() {
  const t = useTranslations("receipts");
  return (
    <span
      data-slot="spec-pending-tag"
      className="inline-flex shrink-0 items-center rounded-full border border-tone-amber/35 bg-tone-amber/12 px-1.5 py-0 text-2xs font-medium leading-5 text-tone-amber-fg"
      title={t("specPendingHint")}
    >
      {t("specPending")}
    </span>
  );
}
