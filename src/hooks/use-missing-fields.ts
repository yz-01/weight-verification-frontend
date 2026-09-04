"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { missingFields, type Requirement } from "@/lib/missing-fields";

/** What a form is still waiting for, ready to hand to a `Button`. */
export interface Blocker {
  /** True while something required is still empty. */
  blocked: boolean;
  /** The sentence naming what, or `undefined` when nothing is missing. */
  reason: string | undefined;
}

/**
 * Turn a form's required fields into both halves of a disabled button.
 *
 * The pattern this replaces is everywhere in this codebase:
 *
 * ```tsx
 * <Button disabled={!form.category || !form.name || !form.serial || pending}>
 * ```
 *
 * Correct, and silent: the person sees a grey button and cannot tell which of
 * the five fields is the empty one. Here the same list produces the disabling
 * *and* the explanation, so the two cannot drift apart — the sentence is
 * always about the fields actually being checked.
 *
 * ```tsx
 * const blocker = useMissingFields();
 * const need = blocker([
 *   [form.category, t("field.category")],
 *   [form.name, t("field.name")],
 * ]);
 * <Button disabled={need.blocked || save.isPending} disabledReason={need.reason} />
 * ```
 *
 * Pass the labels the fields already carry on screen, so the sentence points
 * at something the reader can actually see.
 */
export function useMissingFields(): (
  requirements: readonly Requirement[],
) => Blocker {
  const t = useTranslations("common");

  return useCallback(
    (requirements: readonly Requirement[]) => {
      const missing = missingFields(requirements);
      if (missing.length === 0) return { blocked: false, reason: undefined };
      return {
        blocked: true,
        reason: t("missingFields", {
          fields: missing.join(t("listSeparator")),
        }),
      };
    },
    [t],
  );
}
