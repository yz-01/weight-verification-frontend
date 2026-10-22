"use client";

import { useEffect, useState } from "react";

import { reloadAfterVersionSkew } from "@/components/providers/navigation-recovery";
import { isStandaloneApp } from "@/lib/auth-token";
import { clientErrorLine, reportClientError } from "@/lib/client-error-report";
import { isPageLeaving } from "@/lib/portal";

type Lang = "en" | "zh" | "zh-TW" | "ms";

/**
 * Fixed words in the four languages. This screen appears when something
 * failed - possibly the translations themselves - so it does not depend on
 * them.
 */
const TEXT: Record<Lang, { title: string; body: string; reload: string; code: string }> = {
  en: {
    title: "This page couldn't open",
    body: "Tap Reload to try again. If it keeps happening, send a screenshot of this screen to the office.",
    reload: "Reload",
    code: "Error code",
  },
  zh: {
    title: "页面打不开",
    body: "请点「重新加载」再试一次。如果一直这样，请把这个画面截图发给办公室。",
    reload: "重新加载",
    code: "错误代码",
  },
  "zh-TW": {
    title: "頁面打不開",
    body: "請點「重新載入」再試一次。如果一直這樣，請把這個畫面截圖發給辦公室。",
    reload: "重新載入",
    code: "錯誤代碼",
  },
  ms: {
    title: "Halaman ini tidak dapat dibuka",
    body: "Tekan Muat semula untuk cuba lagi. Jika masih berlaku, hantar tangkapan skrin ini kepada pejabat.",
    reload: "Muat semula",
    code: "Kod ralat",
  },
};

export function errorScreenLang(value: string | null | undefined): Lang {
  const lang = (value ?? "").toLowerCase();
  if (lang === "zh-tw" || lang === "zh-hant" || lang.startsWith("zh-hant")) return "zh-TW";
  if (lang.startsWith("zh")) return "zh";
  if (lang.startsWith("ms")) return "ms";
  return "en";
}

export function errorScreenText(value: string | null | undefined) {
  return TEXT[errorScreenLang(value)];
}

const VERSION_SKEW =
  /ChunkLoadError|Loading chunk|dynamically imported module|module script|Failed to load Next\.js script|RSC payload/i;

export function RouteErrorScreen({
  error,
  boundary,
}: {
  error: Error & { digest?: string };
  boundary: string;
}) {
  // An error screen is drawn in the browser, after something there failed.
  const [lang] = useState<string | null>(() =>
    typeof document === "undefined"
      ? null
      : document.documentElement.lang || navigator.language,
  );
  const [leaving] = useState(() => isPageLeaving());

  useEffect(() => {
    reportClientError(error, {
      boundary,
      standalone: isStandaloneApp(),
      leaving: isPageLeaving(),
    });
    // A file from an older release (or one a page load just cancelled): the
    // automatic recovery reloads at most once per 30 s, and not at all while
    // a page load is already under way.
    if (VERSION_SKEW.test(`${error?.name ?? ""}: ${error?.message ?? ""}`)) {
      reloadAfterVersionSkew();
    }
  }, [boundary, error]);

  // The page is already being replaced; the next one is a moment away.
  if (leaving) {
    return <main className="min-h-dvh" aria-busy="true" />;
  }

  const text = errorScreenText(lang);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="surface-panel flex w-full max-w-md flex-col items-center gap-3 rounded-xl px-6 py-10 text-center">
        <h1 className="text-lg font-semibold text-foreground">{text.title}</h1>
        <p className="text-sm text-muted-foreground">{text.body}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          {text.reload}
        </button>
        <p
          className="mt-2 break-all font-mono text-xs text-muted-foreground"
          data-testid="error-code"
        >
          {text.code}: {clientErrorLine(error)}
        </p>
      </div>
    </main>
  );
}
