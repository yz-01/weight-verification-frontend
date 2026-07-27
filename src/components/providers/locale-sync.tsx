"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { resolveLocale } from "@/i18n/config";
import { setLocaleCookie } from "@/lib/auth-token";

/**
 * Make the account the authority on language, not the cookie.
 *
 * The server picks a locale from a cookie, because it has to choose one before
 * it can load the account. But the account is what the user actually set, and
 * it is what follows them between devices. On a machine where the cookie is
 * missing or stale — a new browser, a cleared profile, a colleague's laptop —
 * the two disagree, and without this the user gets English despite having
 * chosen Chinese.
 *
 * Writing the cookie and refreshing puts them back in agreement. It runs at
 * most once per mismatch: after the refresh the server reads the corrected
 * cookie, so the condition is false and there is no loop.
 */
export function LocaleSync() {
  const router = useRouter();
  const activeLocale = resolveLocale(useLocale());
  const { user } = useAuth();

  useEffect(() => {
    if (user === null) return;
    const accountLocale = resolveLocale(user.language);
    if (accountLocale === activeLocale) return;

    setLocaleCookie(accountLocale);
    router.refresh();
  }, [user, activeLocale, router]);

  return null;
}
