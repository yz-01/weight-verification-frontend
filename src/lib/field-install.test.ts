/**
 * iPhone field activation (Lucas 2026-10-22, iOS 26):
 * 「为什么iPhone 手机端不能绑定…关了又不见了」 and
 * 「我第一次输入了又跳回去输入pin的页面，然后需要再输入多一次」.
 *
 * - The page added to the Home Screen carries the sign-in hand-off in its own
 *   address, and the manifest of that page starts the app on it.
 * - One PIN: once accepted, the screen never shows the form again.
 * - A PIN screen in storage that was never linked says the way in.
 * - iOS / in-app browser detection decides who sees which guide.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  contextReason,
  detectInstallEnvironment,
  fieldAccessView,
  fieldManifestStartUrl,
  fieldReadyPath,
  fieldSignInDestination,
  showIosInstallGuide,
  unboundReason,
} from "@/lib/field-install";

const TOKEN = "jsC_VZY1C-xi_XN8xJQ4xiFkICa2tF3xRfZqTuRqMMqC4tUG1trVwQ";

const UA = {
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1",
  iosWeChat:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x1800323a) NetType/4G Language/zh_CN",
  iosFacebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.0]",
  iosBareWebView:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  ipadDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
};

describe("iOS detection", () => {
  it("tells Safari, Chrome, chat apps and a bare web view apart", () => {
    expect(detectInstallEnvironment({ userAgent: UA.iosSafari })).toBe("ios-safari");
    expect(detectInstallEnvironment({ userAgent: UA.iosChrome })).toBe("ios-chrome");
    expect(detectInstallEnvironment({ userAgent: UA.iosWeChat })).toBe("ios-in-app");
    expect(detectInstallEnvironment({ userAgent: UA.iosFacebook })).toBe("ios-in-app");
    expect(detectInstallEnvironment({ userAgent: UA.iosBareWebView })).toBe("ios-in-app");
    expect(detectInstallEnvironment({ userAgent: UA.android })).toBe("android");
  });

  it("treats an iPad asking for the desktop site as iOS", () => {
    expect(
      detectInstallEnvironment({
        userAgent: UA.ipadDesktop,
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
    ).toBe("ios-safari");
  });

  it("shows the iPhone install guide only in an iOS browser tab", () => {
    expect(showIosInstallGuide({ environment: "ios-safari", standalone: false })).toBe(true);
    expect(showIosInstallGuide({ environment: "ios-in-app", standalone: false })).toBe(true);
    expect(showIosInstallGuide({ environment: "ios-safari", standalone: true })).toBe(false);
    expect(showIosInstallGuide({ environment: "android", standalone: false })).toBe(false);
  });
});

describe("the page added to the Home Screen carries the token", () => {
  it("after the PIN in Safari, the next page's own address holds the hand-off", () => {
    const destination = fieldSignInDestination({
      bootstrapToken: TOKEN,
      standalone: false,
    });
    expect(destination).toBe(`/trace/field-ready?bootstrap=${TOKEN}`);
    expect(new URL(destination, "https://x.test").searchParams.get("bootstrap")).toBe(TOKEN);
    expect(fieldReadyPath(TOKEN, "/field-staff/incidents")).toBe(
      `/trace/field-ready?bootstrap=${TOKEN}&next=%2Ffield-staff%2Fincidents`,
    );
  });

  it("inside the installed app the PIN goes straight to the workspace", () => {
    expect(fieldSignInDestination({ bootstrapToken: TOKEN, standalone: true })).toBe(
      "/field-staff",
    );
    expect(fieldSignInDestination({ bootstrapToken: null, standalone: false })).toBe(
      "/field-staff",
    );
  });

  it("the manifest starts the app on the hand-off, or on the activation link", () => {
    expect(fieldManifestStartUrl(new URLSearchParams({ bootstrap: TOKEN }))).toBe(
      `/field-pwa-bootstrap?token=${TOKEN}`,
    );
    expect(fieldManifestStartUrl(new URLSearchParams({ invitation: TOKEN }))).toBe(
      `/trace/field-activate?token=${TOKEN}`,
    );
    expect(fieldManifestStartUrl(new URLSearchParams())).toBe("/trace/field-login");
    expect(fieldManifestStartUrl(new URLSearchParams({ bootstrap: "x" }))).toBe(
      "/trace/field-login",
    );
  });

  it("the activation and ready pages declare the token-carrying manifest", () => {
    expect(readFileSync("src/app/(auth)/trace/field-activate/page.tsx", "utf8")).toContain(
      "/field-manifest.webmanifest?invitation=",
    );
    expect(readFileSync("src/app/(auth)/trace/field-ready/page.tsx", "utf8")).toContain(
      "/field-manifest.webmanifest?bootstrap=",
    );
  });

  it("the PIN moves on with a real page load, so Safari holds the ready page's manifest", () => {
    const source = readFileSync("src/components/field-staff/field-access.tsx", "utf8");
    expect(source).toContain("window.location.replace(path)");
    expect(source).toMatch(/openPage\(\s*fieldSignInDestination\(/);
  });
});

describe("one PIN per activation", () => {
  it("once the PIN is accepted the form never comes back, even while the invitation reloads", () => {
    expect(
      fieldAccessView({
        signedIn: true,
        hasInvitation: true,
        invitationLoading: true,
        invitationError: false,
        resuming: false,
      }),
    ).toBe("opening");
    expect(
      fieldAccessView({
        signedIn: true,
        hasInvitation: true,
        invitationLoading: false,
        invitationError: false,
        resuming: false,
      }),
    ).toBe("opening");
  });

  it("before the PIN it shows the form, the spinner or the invalid link as before", () => {
    const base = {
      signedIn: false,
      hasInvitation: true,
      invitationLoading: false,
      invitationError: false,
      resuming: false,
    };
    expect(fieldAccessView(base)).toBe("form");
    expect(fieldAccessView({ ...base, invitationLoading: true })).toBe("loading");
    expect(fieldAccessView({ ...base, invitationError: true })).toBe("invalid");
    expect(fieldAccessView({ ...base, hasInvitation: false, resuming: true })).toBe("resuming");
  });
});

describe("tokens written at activation are read on the ready page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("the field session survives the move from field-activate to field-ready", async () => {
    const store = new Map<string, string>();
    const location = { pathname: "/trace/field-activate", protocol: "https:" };
    vi.stubGlobal("window", {
      location,
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", { cookie: "" });
    const auth = await import("@/lib/auth-token");

    auth.setFieldTokens({ access: "field-access", refresh: "field-refresh" });
    location.pathname = "/trace/field-ready";

    expect(auth.hasFieldSession()).toBe(true);
    expect(auth.getAccessToken()).toBe("field-access");
    expect(auth.getRefreshToken()).toBe("field-refresh");
  });
});

describe("a PIN screen that cannot work says the way in", () => {
  it("an installed iPhone app that was never linked", () => {
    expect(
      unboundReason({
        linked: false,
        hasBootstrapToken: false,
        standalone: true,
        environment: "ios-safari",
      }),
    ).toBe("installed-app");
  });

  it("a chat app's browser, and a plain browser", () => {
    expect(
      unboundReason({
        linked: false,
        hasBootstrapToken: false,
        standalone: false,
        environment: "ios-in-app",
      }),
    ).toBe("in-app");
    expect(
      unboundReason({
        linked: false,
        hasBootstrapToken: false,
        standalone: false,
        environment: "ios-safari",
      }),
    ).toBe("browser");
  });

  it("a linked phone, or one holding a hand-off, just gets the PIN", () => {
    const base = { standalone: true, environment: "ios-safari" as const };
    expect(unboundReason({ ...base, linked: true, hasBootstrapToken: false })).toBeNull();
    expect(unboundReason({ ...base, linked: false, hasBootstrapToken: true })).toBeNull();
    expect(contextReason(base)).toBe("installed-app");
  });
});
