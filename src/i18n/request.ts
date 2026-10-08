import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";

/**
 * The server's i18n config. Its messages serve server components only
 * (`getTranslations` in `app/not-found.tsx` and `app/offline/page.tsx`); they
 * are no longer handed to the browser. Client components get the same
 * catalogue from `IntlProvider`, built by the same `loadMessages`.
 */
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
