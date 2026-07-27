/**
 * A translator the service layer can reach without React.
 *
 * The design system puts toasts in the service layer, not in components, so a
 * mutation toasts once no matter how many screens call it. But services are
 * plain modules, and `useTranslations` is a hook. This module holds a
 * translator built from the same catalogue the React tree uses, published by
 * `TranslationBridge` on mount and refreshed whenever the locale changes.
 *
 * Components must keep using `useTranslations`. This exists only for code that
 * runs outside the tree.
 */

import { createTranslator } from "next-intl";

import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";

type Messages = Record<string, unknown>;
type Translate = (key: string, values?: Record<string, unknown>) => string;

let translate: Translate | null = null;
let activeLocale: Locale = DEFAULT_LOCALE;

export function publishTranslator(locale: Locale, messages: Messages): void {
  activeLocale = locale;
  const translator = createTranslator({ locale, messages: messages as never });
  translate = (key, values) =>
    (translator as unknown as Translate)(key, values);
}

export function getLocale(): Locale {
  return activeLocale;
}

/**
 * Translate a key from outside React.
 *
 * Falls back to the key itself only before the bridge has mounted, which in
 * practice means never: nothing can call a service before the tree renders.
 */
export function t(key: string, values?: Record<string, unknown>): string {
  if (translate === null) return key;
  try {
    return translate(key, values);
  } catch {
    return key;
  }
}
