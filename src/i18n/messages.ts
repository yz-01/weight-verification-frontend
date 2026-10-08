import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";

/**
 * Loading a locale's message catalogue, shared by the server and the browser.
 *
 * The server's request config (`request.ts`) and the browser's provider
 * (`components/providers/intl-provider.tsx`) both call `loadMessages`, so the
 * two sides build the very same catalogue from the very same code. That
 * matters: the server renders the first paint with it and the browser then
 * hydrates that paint with its own copy; any difference would show up as a
 * hydration mismatch or as a word changing under the user's eyes.
 *
 * Why the browser loads it itself (perf #7, 2026-10-09): handed over by the
 * server, the whole catalogue (~650 KB of JSON) was written into every HTML
 * document, so every sign-in page, every PWA open and every reload after a
 * deploy downloaded it again. Imported here, the bundler emits each locale as
 * its own content-hashed file under `/_next/static/`, which the browser and the
 * service worker keep, so a phone downloads it once per catalogue change.
 */

export type Messages = Record<string, unknown>;

/**
 * Overlay a translation catalogue on top of English.
 *
 * English is the source of truth and the only catalogue guaranteed to be
 * complete. Chinese and Malay are allowed to lag behind a feature landing, but
 * a user must never see a raw key like `weighing.anomaly.suddenDrop` on screen.
 * Merging against English means an untranslated key degrades to readable
 * English instead of to something that looks like a bug.
 */
export function withEnglishFallback(base: Messages, overlay: Messages): Messages {
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

async function importMessages(locale: Locale): Promise<Messages> {
  // Both files are requested at once; one after the other would cost a
  // second round trip on a phone.
  const [english, translated] = await Promise.all([
    import("@/messages/en.json"),
    locale === DEFAULT_LOCALE ? null : import(`@/messages/${locale}.json`),
  ]);
  if (translated === null) {
    return english.default as Messages;
  }
  return withEnglishFallback(
    english.default as Messages,
    translated.default as Messages,
  );
}

/**
 * A promise React can read with `use()`, marked as settled once it is.
 *
 * React reads `status`/`value` on a thenable it is given; a promise that
 * already carries them is read synchronously, so a remount (or a second
 * render after the first load) never shows the loading state again.
 */
type TrackedPromise<T> = Promise<T> & {
  status?: "pending" | "fulfilled" | "rejected";
  value?: T;
  reason?: unknown;
};

export function tracked<T>(promise: Promise<T>): Promise<T> {
  const thenable = promise as TrackedPromise<T>;
  thenable.status = "pending";
  thenable.then(
    (value) => {
      thenable.status = "fulfilled";
      thenable.value = value;
    },
    (reason: unknown) => {
      thenable.status = "rejected";
      thenable.reason = reason;
    },
  );
  return thenable;
}

const loaded = new Map<Locale, Promise<Messages>>();

/**
 * The merged catalogue for a locale, loaded once per process (server) or per
 * page (browser) and shared by every caller afterwards.
 *
 * The result is never mutated by anyone, which is what makes sharing one copy
 * between requests safe on the server (it also spares the server merging
 * 650 KB of JSON again on every request, as it used to).
 */
export function loadMessages(locale: Locale): Promise<Messages> {
  const existing = loaded.get(locale);
  if (existing) return existing;

  const promise = tracked(importMessages(locale));
  promise.catch(() => {
    // Let the next caller try again instead of failing forever.
    if (loaded.get(locale) === promise) loaded.delete(locale);
  });
  loaded.set(locale, promise);
  return promise;
}
