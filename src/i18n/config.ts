/**
 * Locale configuration.
 *
 * MSE Trace is sold into Malaysia, where a single company routinely has an
 * English-speaking head office, Chinese-speaking finance staff and Malay-
 * speaking site crews. Language is therefore a per-user setting rather than a
 * per-tenant one, and it is persisted on the account.
 *
 * There is deliberately no locale segment in any URL. The locale travels in a
 * cookie so the server can render the first paint in the right language, but
 * the account is the source of truth and the cookie is refreshed from it on
 * every sign-in.
 */

export const LOCALES = ["en", "zh", "ms"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Cookie the server reads to pick a locale before the account is loaded. */
export const LOCALE_COOKIE = "mse_locale";

/** One year. The cookie is a cache of the account setting, not a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Native names, shown in the language switcher in the language itself. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  ms: "Bahasa Malaysia",
};

/** Date-fns locale module names, keyed by app locale. */
export const DATE_FNS_LOCALES: Record<Locale, string> = {
  en: "en-GB",
  zh: "zh-CN",
  ms: "ms",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
