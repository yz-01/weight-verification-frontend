/**
 * Lucas 2026-10-23 (iOS 26): added to the Home Screen with Safari's own
 * Share from the workspace, the new icon opened on 「这个主屏幕图标还没绑定」.
 *
 * iPhone Safari installs from the manifest the server rendered for the page
 * (WebKit loads the first rel="manifest" once and keeps it), and that link was
 * the plain one, whose start_url is the PIN screen. Now every field page is
 * rendered with the hand-off from a first-party cookie, the manifest route
 * falls back to that cookie, the ready-page guide draws real icons, and the
 * "not linked" screen says why and logs it.
 */
import { readFileSync } from "node:fs";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";
import {
  FIELD_BOOTSTRAP_COOKIE,
  fieldManifestHref,
  fieldManifestStartUrl,
  installGuideVariant,
  manifestReloadNeeded,
  unboundCode,
} from "@/lib/field-install";
import { buildClientErrorReport } from "@/lib/client-error-report";

const TOKEN = "jsC_VZY1C-xi_XN8xJQ4xiFkICa2tF3xRfZqTuRqMMqC4tUG1trVwQ";
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));
vi.mock("@/components/field-staff/field-staff-shell", () => ({
  FieldStaffShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/field-staff/field-access", () => ({ FieldAccess: () => null }));
vi.mock("@/lib/branding-server", () => ({
  getPublicBranding: async () => ({
    name: "MSE Trace",
    short_name: "MSE",
    company_id: "c-1",
    icon_url: "",
  }),
}));

beforeEach(() => cookieJar.clear());

describe("the server renders the manifest link with the hand-off", () => {
  it("fieldManifestHref carries a valid token and nothing else", () => {
    expect(fieldManifestHref(TOKEN)).toBe(`/field-manifest.webmanifest?bootstrap=${TOKEN}`);
    expect(fieldManifestHref(null)).toBe("/field-manifest.webmanifest");
    expect(fieldManifestHref("short")).toBe("/field-manifest.webmanifest");
    expect(fieldManifestHref('x"><script>')).toBe("/field-manifest.webmanifest");
  });

  it("every workspace page: the layout reads the cookie", async () => {
    const { generateMetadata } = await import("@/app/(field-staff)/layout");
    expect((await generateMetadata()).manifest).toBe("/field-manifest.webmanifest");
    cookieJar.set(FIELD_BOOTSTRAP_COOKIE, TOKEN);
    const metadata = await generateMetadata();
    expect(metadata.manifest).toBe(`/field-manifest.webmanifest?bootstrap=${TOKEN}`);
    expect(metadata.referrer).toBe("strict-origin-when-cross-origin");
  });

  it("the PIN screen too", async () => {
    const { generateMetadata } = await import("@/app/(auth)/trace/field-login/page");
    cookieJar.set(FIELD_BOOTSTRAP_COOKIE, TOKEN);
    expect((await generateMetadata()).manifest).toBe(
      `/field-manifest.webmanifest?bootstrap=${TOKEN}`,
    );
  });
});

describe("the manifest route", () => {
  async function manifest(path: string, cookie?: string) {
    const { NextRequest } = await import("next/server");
    const { GET } = await import("@/app/field-manifest.webmanifest/route");
    const request = new NextRequest(`https://app.example${path}`, {
      headers: cookie ? { cookie: `${FIELD_BOOTSTRAP_COOKIE}=${cookie}` } : {},
    });
    return (await (await GET(request)).json()) as { start_url: string; scope: string };
  }

  it("uses the cookie when the link has no hand-off", async () => {
    const body = await manifest("/field-manifest.webmanifest", TOKEN);
    expect(body.start_url).toBe(`/field-pwa-bootstrap?token=${TOKEN}&next=%2Ffield-staff`);
  });

  it("the link's own hand-off wins; without either it is the PIN screen", async () => {
    const other = "b".repeat(40);
    expect(
      (await manifest(`/field-manifest.webmanifest?bootstrap=${other}`, TOKEN)).start_url,
    ).toBe(`/field-pwa-bootstrap?token=${other}&next=%2Ffield-staff`);
    expect((await manifest("/field-manifest.webmanifest")).start_url).toBe("/trace/field-login");
    expect((await manifest("/field-manifest.webmanifest", "bad")).start_url).toBe(
      "/trace/field-login",
    );
  });

  it("an invitation link is never swapped for the cookie", async () => {
    const invitation = "i".repeat(40);
    expect(
      (await manifest(`/field-manifest.webmanifest?invitation=${invitation}`, TOKEN)).start_url,
    ).toBe(`/trace/field-activate?token=${invitation}`);
  });

  it("start_url is same-origin and inside the scope", async () => {
    const body = await manifest("/field-manifest.webmanifest", TOKEN);
    const start = new URL(body.start_url, "https://app.example");
    const scope = new URL(body.scope, "https://app.example");
    expect(start.origin).toBe("https://app.example");
    expect(start.pathname.startsWith(scope.pathname)).toBe(true);
    expect(fieldManifestStartUrl(new URLSearchParams(), TOKEN)).toBe(body.start_url);
  });
});

describe("a page rendered before the cookie existed loads once more", () => {
  const base = {
    renderedHref: "/field-manifest.webmanifest",
    held: TOKEN,
    cookie: TOKEN,
    environment: "ios-safari" as const,
    standalone: false,
    alreadyReloaded: false,
  };
  it("iPhone Safari tab, plain link, cookie set: once", () => {
    expect(manifestReloadNeeded(base)).toBe(true);
    expect(manifestReloadNeeded({ ...base, alreadyReloaded: true })).toBe(false);
  });
  it("never when the link already carries it, in the app, off iPhone, or without the cookie", () => {
    expect(manifestReloadNeeded({ ...base, renderedHref: fieldManifestHref(TOKEN) })).toBe(false);
    expect(manifestReloadNeeded({ ...base, standalone: true })).toBe(false);
    expect(manifestReloadNeeded({ ...base, environment: "android" })).toBe(false);
    expect(manifestReloadNeeded({ ...base, environment: "ios-in-app" })).toBe(false);
    expect(manifestReloadNeeded({ ...base, cookie: null })).toBe(false);
    expect(manifestReloadNeeded({ ...base, held: null })).toBe(false);
  });
});

describe("the cookie copy of the hand-off", () => {
  let cookieWrites: string[] = [];
  function stub(standalone: boolean) {
    const store = new Map<string, string>();
    cookieWrites = [];
    vi.stubGlobal("window", {
      location: { protocol: "https:", origin: "https://app.example" },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
      sessionStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
      matchMedia: () => ({ matches: standalone }),
      dispatchEvent: () => true,
    });
    vi.stubGlobal("navigator", { standalone });
    vi.stubGlobal("document", {
      set cookie(value: string) {
        cookieWrites.push(value);
      },
      get cookie() {
        return "";
      },
    });
  }
  afterEach(() => vi.unstubAllGlobals());

  it("a Safari tab writes it host-only, path /, Lax, Secure", async () => {
    stub(false);
    const { setFieldBootstrapToken } = await import("@/lib/auth-token");
    setFieldBootstrapToken(TOKEN);
    const written = cookieWrites.find((line) =>
      line.startsWith(`${FIELD_BOOTSTRAP_COOKIE}=${TOKEN}`),
    );
    expect(written).toBeDefined();
    expect(written).toContain("path=/");
    expect(written).toContain("SameSite=Lax");
    expect(written).toContain("Secure");
    expect(written).not.toMatch(/domain=/i);
  });

  it("the installed app removes it; signing out removes it", async () => {
    stub(true);
    const { setFieldBootstrapToken, clearFieldTokens } = await import("@/lib/auth-token");
    setFieldBootstrapToken(TOKEN);
    expect(cookieWrites.some((line) => line.startsWith(`${FIELD_BOOTSTRAP_COOKIE}=;`))).toBe(true);
    expect(cookieWrites.some((line) => line.includes(TOKEN))).toBe(false);
    stub(false);
    clearFieldTokens();
    expect(cookieWrites.some((line) => line.startsWith(`${FIELD_BOOTSTRAP_COOKIE}=;`))).toBe(true);
  });
});

describe("the banner opens the ready page with a fresh hand-off", () => {
  it("makes one, keeps it, and loads the ready page in full", () => {
    const banner = read("components/field-staff/field-install-banner.tsx");
    expect(banner).toContain("await createFieldPwaBootstrap()");
    expect(banner).toContain("setFieldBootstrapToken(fresh.token)");
    expect(banner).toContain(
      'window.location.assign(fieldReadyPath(fresh.token, "/field-staff"))',
    );
    // The ready page renders its own token-carrying manifest on the server.
    expect(read("app/(auth)/trace/field-ready/page.tsx")).toContain(
      "`/field-manifest.webmanifest?bootstrap=${encodeURIComponent(token)}`",
    );
  });

  it("a hand-off made on the page never starts a reload racing that navigation", () => {
    const patcher = read("components/field-staff/field-manifest-token.tsx");
    expect(patcher).toContain("sync(true);");
    expect(patcher).toContain("const later = () => sync(false);");
  });
});

describe("why the phone is not linked", () => {
  it("names the reason", () => {
    const tab = { standalone: false, environment: "ios-safari" as const };
    const app = { standalone: true, environment: "ios-safari" as const };
    expect(unboundCode(app)).toBe("no-token");
    expect(unboundCode({ ...app, refusedCode: "field_pwa_bootstrap_invalid" })).toBe(
      "refused:field_pwa_bootstrap_invalid",
    );
    expect(unboundCode({ ...app, refusedCode: "field_companion_pin_required" })).toBe(
      "companion-pin",
    );
    expect(unboundCode({ ...app, joinLink: true })).toBe("companion-pin");
    expect(unboundCode({ ...app, deviceRefused: true })).toBe("device-refused");
    expect(unboundCode(tab)).toBe("not-standalone");
    expect(unboundCode({ standalone: false, environment: "ios-in-app" })).toBe("in-app");
  });

  it("the help shows 「原因：…」 and real icons, never □↑ or ⋯", async () => {
    const { FieldUnboundHelp } = await import("@/components/field-staff/field-unbound-help");
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <FieldUnboundHelp reason="installed-app" code="no-token" standalone />
      </NextIntlClientProvider>,
    );
    expect(html).toContain("原因：no-token");
    expect(html).toContain('aria-label="更多"');
    expect(html).not.toMatch(/□|↑|⋯|<more>/);
  });

  it("is reported as unbound, with the reason as its code", () => {
    const report = buildClientErrorReport(
      { name: "Unbound", message: "refused:field_link_replaced" },
      { boundary: "field-login", standalone: true, kind: "unbound" },
    );
    expect(report.kind).toBe("unbound");
    expect(report.code).toBe("refused:field_link_replaced");
    expect(buildClientErrorReport(new Error("x"), { boundary: "global" }).kind).toBe("crash");
    expect(read("components/field-staff/field-unbound-help.tsx")).toContain('kind: "unbound"');
    const access = read("components/field-staff/field-access.tsx");
    expect(access).toContain("setRefusedCode(cause.code)");
    expect(access).toContain("code={unboundCode({");
  });
});

describe("install steps draw real icons in all four languages", () => {
  it.each([
    ["zh", zh, "分享", "更多"],
    ["zh-TW", zhTW, "分享", "更多"],
    ["en", en, "Share", "More"],
    ["ms", ms, "Kongsi", "Lagi"],
  ])("%s", async (locale, messages, share, more) => {
    const { useInstallIconTags } = await import("@/components/field-staff/install-icons");
    function Render() {
      const t = useTranslations("fieldAccess");
      const icons = useInstallIconTags();
      return (
        <>
          <p>{t.rich("iosStep1", icons)}</p>
          <p>{t.rich("iosStep2", icons)}</p>
          <p>{t.rich("unboundAppStep3", icons)}</p>
          <p>{t.rich("unboundInAppBody", icons)}</p>
          <p>{t.rich("androidStep1", icons)}</p>
        </>
      );
    }
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kuala_Lumpur">
        <Render />
      </NextIntlClientProvider>,
    );
    expect(html).toContain(`aria-label="${share}"`);
    expect(html).toContain(`aria-label="${more}"`);
    expect(html.match(/<svg/g)?.length).toBeGreaterThanOrEqual(7);
    expect(html).not.toMatch(/□|↑|⋯|<share>|<more>|<menu>|<pagemenu>/);
    expect(JSON.stringify(messages.fieldAccess)).not.toMatch(/□|⋯/);
  });
});

describe("which install help the ready page shows", () => {
  it("iPhone Safari: steps; Android: the real prompt, else steps", () => {
    const variant = (
      environment: Parameters<typeof installGuideVariant>[0]["environment"],
      guideVisible: boolean,
      nativePromptReady: boolean,
    ) => installGuideVariant({ environment, guideVisible, nativePromptReady });
    expect(variant("ios-safari", false, false)).toBe("ios-steps");
    expect(variant("android", false, true)).toBe("none");
    expect(variant("android", false, false)).toBe("android-steps");
    expect(variant("android", true, true)).toBe("android-steps");
    expect(variant("desktop-chromium", false, false)).toBe("none");
  });

  it("the ready page wires the iPhone arrow and the Android steps", () => {
    const page = read("components/field-staff/field-install-ready.tsx");
    expect(page).toContain("<SafariBarArrow t={t} />");
    expect(page).toContain('"android-steps" && <AndroidSteps');
    expect(page).toContain('t.rich("iosStep1", icons)');
  });
});

describe("iPhones get metadata in <head>", () => {
  it("the config sends blocking metadata to iPhone Safari, keeps Next's crawlers", async () => {
    const config = (await import("../../next.config")).default as { htmlLimitedBots?: RegExp };
    const bots = config.htmlLimitedBots as RegExp;
    expect(
      bots.test(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(true);
    expect(bots.test("AdsBot-Google (+http://www.google.com/adsbot.html)")).toBe(true);
    expect(bots.test("Twitterbot/1.0")).toBe(true);
    expect(
      bots.test(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
      ),
    ).toBe(false);
  });
});
