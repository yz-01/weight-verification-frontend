"use client";

import { useLocale, useMessages } from "next-intl";
import { useEffect } from "react";

import { resolveLocale } from "@/i18n/config";
import { publishTranslator } from "@/lib/i18n-runtime";

/**
 * Hand the active catalogue to the non-React translator.
 *
 * Services toast their own success and failure messages, and services are
 * plain modules that cannot call hooks. This publishes the same messages the
 * React tree is using so those toasts stay translated and stay in sync when
 * the user switches language.
 *
 * Runs during render rather than only in an effect: a mutation fired from the
 * first paint would otherwise toast a raw message key.
 */
export function TranslationBridge() {
  const locale = useLocale();
  const messages = useMessages();

  publishTranslator(resolveLocale(locale), messages as Record<string, unknown>);

  useEffect(() => {
    publishTranslator(resolveLocale(locale), messages as Record<string, unknown>);
  }, [locale, messages]);

  return null;
}
