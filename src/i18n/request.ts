import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  resolveLocale,
  type Locale,
} from "@/i18n/config";

type Messages = Record<string, unknown>;

/**
 * Overlay a translation catalogue on top of English.
 *
 * English is the source of truth and the only catalogue guaranteed to be
 * complete. Chinese and Malay are allowed to lag behind a feature landing, but
 * a user must never see a raw key like `weighing.anomaly.suddenDrop` on screen.
 * Merging against English means an untranslated key degrades to readable
 * English instead of to something that looks like a bug.
 */
function withEnglishFallback(base: Messages, overlay: Messages): Messages {
  const merged: Messages = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const existing = merged[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      merged[key] = withEnglishFallback(
        existing as Messages,
        value as Messages,
      );
    } else if (value !== undefined && value !== "") {
      merged[key] = value;
    }
  }
  return merged;
}

async function loadMessages(locale: Locale): Promise<Messages> {
  const english = (await import("@/messages/en.json")).default as Messages;
  if (locale === DEFAULT_LOCALE) {
    return english;
  }
  const translated = (await import(`@/messages/${locale}.json`))
    .default as Messages;
  return withEnglishFallback(english, translated);
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);

  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: "Asia/Kuala_Lumpur",
    now: new Date(),
  };
});
