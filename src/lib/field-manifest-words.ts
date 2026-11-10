import { createTranslator } from "next-intl";

import { isLocale, type Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";

/**
 * The language of the phone app's install name (JB164, screens 11-10: the
 * home-screen icon of a Chinese company was called 「示范建筑有限公司 Field
 * Staff」).
 *
 * In order: the company's own language when the branding carries it; the
 * locale cookie - a copy of the account's language, which a phone account
 * takes from its company - when the browser sends it with the manifest; the
 * phone's own languages; English.
 */
export function fieldManifestLocale({
  companyLanguage,
  cookie,
  acceptLanguage,
}: {
  companyLanguage?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(companyLanguage)) return companyLanguage;
  if (isLocale(cookie)) return cookie;
  for (const part of (acceptLanguage ?? "").split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    if (!tag) continue;
    if (tag === "zh-tw" || tag === "zh-hk" || tag === "zh-mo" || tag.startsWith("zh-hant")) return "zh-TW";
    if (tag.startsWith("zh")) return "zh";
    if (tag.startsWith("ms")) return "ms";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

/** The install name and description, in `locale`: 「{公司} 现场」, 「{company} Field Staff」. */
export async function fieldManifestWords(company: string, locale: Locale): Promise<{ name: string; description: string }> {
  const translator = createTranslator({ locale, messages: (await loadMessages(locale)) as never });
  const t = translator as unknown as (key: string, values?: Record<string, string>) => string;
  return { name: t("fieldManifest.name", { company }), description: t("fieldManifest.description") };
}
