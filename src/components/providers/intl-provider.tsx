"use client";

import { Loader2 } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { Suspense, use } from "react";

import { reloadAfterVersionSkew } from "@/components/providers/navigation-recovery";
import { isLocale, type Locale } from "@/i18n/config";
import { loadMessages, tracked, type Messages } from "@/i18n/messages";

type Props = {
  locale: Locale;
  timeZone: string;
  now: Date;
  children: React.ReactNode;
};

/**
 * The app's translations, loaded by the browser instead of sent in the page.
 *
 * Replaces the server `NextIntlClientProvider`, which wrote the whole
 * catalogue into every HTML document and every `router.refresh()` payload
 * (perf #7: /login was 631 KB). The catalogue now comes from `loadMessages`,
 * one content-hashed file per locale under `/_next/static/`, which the
 * browser and the service worker keep.
 *
 * What the user sees does not change:
 * - The server still renders the first paint fully translated (it loads the
 *   same catalogue on its side, with the same English fallback), so the page
 *   appears with its words in place; the browser makes it interactive once its
 *   own copy has arrived - from the service worker's cache after the first
 *   visit, so an installed phone also opens offline.
 * - Changing language (`router.refresh()`, always a transition) keeps the
 *   current screen up while the other catalogue loads, then swaps.
 * - Only when there is nothing to show yet does the fallback appear, and it is
 *   the same centred spinner the app shell shows while it loads the account.
 *
 * Nothing that translates may render outside this provider; the root layout
 * puts the whole body inside it.
 */
export function IntlProvider({ locale, timeZone, now, children }: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <WithMessages locale={locale} timeZone={timeZone} now={now}>
        {children}
      </WithMessages>
    </Suspense>
  );
}

function WithMessages({ locale, timeZone, now, children }: Props) {
  const messages = use(messagesFor(locale));
  return (
    <NextIntlClientProvider
      locale={locale}
      timeZone={timeZone}
      now={now}
      messages={messages}
    >
      {children}
    </NextIntlClientProvider>
  );
}

const browserLoads = new Map<Locale, Promise<Messages>>();

/**
 * The catalogue as this page reads it.
 *
 * In the browser a failed download never reaches React as an error: that
 * would replace the page with an error screen. Turbopack remembers a failed
 * file for the life of the page, so trying again cannot help either; the
 * only cure is a reload. A file that fails while online belongs to an older
 * deployment (or a 4G drop), so reload now (at most once per 30 s, shared
 * with `NavigationRecovery`, and again once that pause is over); while
 * offline, reload when the connection returns. Until then the server's
 * translated first paint stays on screen, or, mid language switch, the
 * current screen.
 */
function messagesFor(locale: Locale): Promise<Messages> {
  if (typeof window === "undefined") return loadMessages(locale);

  const existing = browserLoads.get(locale);
  if (existing) return existing;

  const promise = tracked(
    loadMessages(locale).catch(() => {
      recoverFromFailedLoad();
      return new Promise<Messages>(() => {});
    }),
  );
  browserLoads.set(locale, promise);
  return promise;
}

const RELOAD_RETRY_MS = 30_000;

function recoverFromFailedLoad(): void {
  if (!navigator.onLine) {
    window.addEventListener("online", recoverFromFailedLoad, { once: true });
    return;
  }
  reloadAfterVersionSkew();
  // Still here: a reload ran less than 30 s ago. A page that cannot load its
  // words never becomes usable, so try again when the pause is over.
  window.setTimeout(recoverFromFailedLoad, RELOAD_RETRY_MS);
}

/*
 * Start the download while the rest of the page's code is still arriving,
 * rather than when React first reaches the provider. The root layout writes
 * the locale into <html lang>, so it is known before anything renders.
 */
if (typeof document !== "undefined") {
  const pageLocale = document.documentElement.lang;
  if (isLocale(pageLocale)) void messagesFor(pageLocale);
}
