/**
 * iPhone follow-ups, Lucas 2026-10-22 (iOS 26):
 *
 * 1. 「我点了一次打开拍照工作台然后还是会跳回去一样的页面…需要点两次」 - one tap
 *    must open the workspace: one full page load, nothing racing it.
 * 2. 「如果我在工作台里面添加去主屏幕就会显示还没有绑定」 - in a Safari tab every
 *    workspace page carries the live hand-off in its address; inside the
 *    installed app it does not; any workspace page opened with a hand-off and
 *    no session signs in with it.
 * 3. The first open of the home-screen app flashed 「This page couldn't load」:
 *    the page being left must not reload itself or show an error.
 * 4./5. Relaunch, reload or return to the tab keeps the session: the link is
 *    never exchanged again while this storage is signed in.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fieldBootstrapStep,
  fieldJoinWithPinPath,
  fieldWorkspaceAddress,
  fieldWorkspaceSignIn,
  validBootstrap,
  withBootstrapParam,
} from "@/lib/field-install";

const TOKEN = "jsC_VZY1C-xi_XN8xJQ4xiFkICa2tF3xRfZqTuRqMMqC4tUG1trVwQ";
const OLD = "oldOldOldOldOldOldOldOldOldOldOldOld_123";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function fakeWindow(path = "/trace/field-ready?bootstrap=x") {
  const url = new URL(path, "https://app.example");
  const replace = vi.fn();
  const reload = vi.fn();
  const storage = new Map<string, string>();
  const win = {
    location: {
      origin: url.origin,
      pathname: url.pathname,
      search: url.search,
      hash: "",
      replace,
      reload,
    },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    setTimeout,
  };
  vi.stubGlobal("window", win);
  return { replace, reload };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("one tap opens the workspace (1, 3)", () => {
  it("replacePage is a single full page load and marks the page as leaving", async () => {
    const { replace } = fakeWindow();
    const { isPageLeaving, replacePage } = await import("@/lib/portal");
    expect(isPageLeaving()).toBe(false);
    replacePage("/field-staff");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/field-staff");
    expect(isPageLeaving()).toBe(true);
  });

  it("does nothing when already there", async () => {
    const { replace } = fakeWindow("/field-staff");
    const { replacePage } = await import("@/lib/portal");
    replacePage("/field-staff");
    expect(replace).not.toHaveBeenCalled();
  });

  it("a script the page load cancelled does not reload the page being left", async () => {
    const { reload } = fakeWindow();
    const { replacePage } = await import("@/lib/portal");
    const { reloadAfterVersionSkew } = await import(
      "@/components/providers/navigation-recovery"
    );
    replacePage("/field-staff");
    reloadAfterVersionSkew();
    expect(reload).not.toHaveBeenCalled();
  });

  it("a real file-from-an-old-release still reloads when nothing is leaving", async () => {
    const { reload } = fakeWindow();
    const { reloadAfterVersionSkew } = await import(
      "@/components/providers/navigation-recovery"
    );
    reloadAfterVersionSkew();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("the phone's sign-in hops never race a route change against a page load", () => {
    for (const file of [
      "components/field-staff/field-install-ready.tsx",
      "components/field-staff/field-pwa-bootstrap.tsx",
      "components/field-staff/field-access.tsx",
      "components/field-staff/field-staff-shell.tsx",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(/redirectWithFallback\(/);
      expect(source, file).not.toMatch(/router\.(replace|push)\(/);
    }
    expect(read("components/field-staff/field-install-ready.tsx")).toMatch(
      /onClick=\{\(\) => replacePage\(workspace\)\}/,
    );
  });
});

describe("the hand-off on workspace addresses (2)", () => {
  const base = { environment: "ios-safari" as const, standalone: false };

  it("a Safari tab shows the live hand-off on every workspace page", () => {
    expect(
      fieldWorkspaceAddress({ ...base, address: "/field-staff", token: TOKEN }),
    ).toBe(`/field-staff?bootstrap=${TOKEN}`);
    expect(
      fieldWorkspaceAddress({
        ...base,
        address: "/field-staff/incidents?tab=mine#top",
        token: TOKEN,
      }),
    ).toBe(`/field-staff/incidents?tab=mine&bootstrap=${TOKEN}#top`);
  });

  it("an older hand-off on the address is replaced by the live one", () => {
    expect(
      fieldWorkspaceAddress({ ...base, address: `/field-staff?bootstrap=${OLD}`, token: TOKEN }),
    ).toBe(`/field-staff?bootstrap=${TOKEN}`);
  });

  it("an address that already carries the live one is left alone", () => {
    expect(
      fieldWorkspaceAddress({ ...base, address: `/field-staff?bootstrap=${TOKEN}`, token: TOKEN }),
    ).toBeNull();
  });

  it("inside the installed app the hand-off comes off the address", () => {
    expect(
      fieldWorkspaceAddress({
        address: `/field-staff?tab=mine&bootstrap=${TOKEN}`,
        token: TOKEN,
        environment: "ios-safari",
        standalone: true,
      }),
    ).toBe("/field-staff?tab=mine");
    expect(
      fieldWorkspaceAddress({
        address: "/field-staff",
        token: TOKEN,
        environment: "ios-safari",
        standalone: true,
      }),
    ).toBeNull();
  });

  it("Android and desktop browsers are not given the hand-off on screen", () => {
    expect(
      fieldWorkspaceAddress({
        address: "/field-staff",
        token: TOKEN,
        environment: "android",
        standalone: false,
      }),
    ).toBeNull();
  });

  it("a malformed hand-off is never written", () => {
    expect(validBootstrap("short")).toBeNull();
    expect(
      fieldWorkspaceAddress({ ...base, address: "/field-staff", token: "<script>" }),
    ).toBeNull();
  });

  it("the installed app opened on a workspace page with a hand-off and no session signs in with it and comes back without it", () => {
    expect(fieldWorkspaceSignIn(`/field-staff/incidents?tab=mine&bootstrap=${TOKEN}`, true)).toBe(
      `/field-pwa-bootstrap?token=${TOKEN}&next=${encodeURIComponent("/field-staff/incidents?tab=mine")}`,
    );
  });

  it("without a hand-off the PIN screen comes back to the same page", () => {
    expect(fieldWorkspaceSignIn("/field-staff?tab=mine", true)).toBe(
      `/trace/field-login?next=${encodeURIComponent("/field-staff?tab=mine")}`,
    );
  });

  it("a browser tab with the link is not signed in by it alone: the PIN screen joins with it (Lucas 2026-10-23)", () => {
    expect(fieldWorkspaceSignIn(`/field-staff?tab=mine&bootstrap=${TOKEN}`, false)).toBe(
      `/trace/field-login?bootstrap=${TOKEN}&next=${encodeURIComponent("/field-staff?tab=mine")}`,
    );
  });

  it("withBootstrapParam keeps every other part of the address", () => {
    expect(withBootstrapParam(`/field-staff?a=1&bootstrap=${OLD}&b=2#x`, null)).toBe(
      "/field-staff?a=1&b=2#x",
    );
  });

  it("the shell asks the address what to do when nobody is signed in", () => {
    const shell = read("components/field-staff/field-staff-shell.tsx");
    expect(shell).toMatch(/replacePage\(fieldWorkspaceSignIn\(currentPath, isStandaloneApp\(\)\)\)/);
    expect(shell).toMatch(/<FieldWorkspaceAddress \/>/);
  });

  it("another site never gets more than the origin as referrer from a workspace page", () => {
    expect(read("app/(field-staff)/layout.tsx")).toMatch(
      /referrer: "strict-origin-when-cross-origin"/,
    );
  });
});

describe("reload, return and relaunch keep the session (4, 5)", () => {
  it("a signed-in storage never exchanges the link again", () => {
    for (const standalone of [true, false]) {
      expect(fieldBootstrapStep({ token: TOKEN, hasSession: true, standalone })).toBe("keep-session");
      expect(fieldBootstrapStep({ token: "", hasSession: true, standalone })).toBe("keep-session");
    }
  });

  it("only empty storage exchanges it (the first open of the app)", () => {
    expect(fieldBootstrapStep({ token: TOKEN, hasSession: false, standalone: true })).toBe("exchange");
    expect(fieldBootstrapStep({ token: "", hasSession: false, standalone: true })).toBe("missing");
  });

  it("a browser tab with a link and no session never exchanges it", () => {
    expect(fieldBootstrapStep({ token: TOKEN, hasSession: false, standalone: false })).toBe(
      "tab-refused",
    );
    const source = read("components/field-staff/field-pwa-bootstrap.tsx");
    // It asks for the PIN, which signs the tab in with the link.
    expect(source).toMatch(/step === "tab-refused"[\s\S]*?replacePage\(fieldJoinWithPinPath\(token, next\)\)/);
    expect(source).toMatch(/context: "standalone"/);
  });

  it("the PIN screen signs in with the link it holds, in the address or kept from before", () => {
    expect(fieldJoinWithPinPath(TOKEN, "/field-staff")).toBe(
      `/trace/field-login?bootstrap=${TOKEN}&next=${encodeURIComponent("/field-staff")}`,
    );
    const source = read("components/field-staff/field-access.tsx");
    expect(source).toMatch(/const link = joinLink \?\? validBootstrap\(getFieldBootstrapToken\(\)\)/);
    expect(source).toMatch(/bootstrap: link/);
  });

  it("tapping the activation link again where already signed in goes straight in (Lucas 2026-10-23)", () => {
    const source = read("components/field-staff/field-access.tsx");
    expect(source).toMatch(/!token \|\| invitation\.isLoading \|\| !hasFieldSession\(\)/);
    expect(source).toMatch(/invitation\.data\?\.user_id === holder/);
    expect(source).not.toMatch(/browserWarning/);
  });

  it("the ready page shows install help only when sent there; opened later it goes on", () => {
    const source = read("components/field-staff/field-install-ready.tsx");
    expect(source).toMatch(/helpWanted\.current \?\?= fieldInstallHelpWanted\(\);\s*if \(!helpWanted\.current\)/);
    expect(read("components/field-staff/field-access.tsx")).toMatch(/markFieldInstallHelp\(\);\s*openPage\(/);
    expect(read("components/field-staff/field-install-banner.tsx")).toMatch(/markFieldInstallHelp\(\)/);
  });

  it("the start page decides before it calls the server", () => {
    const source = read("components/field-staff/field-pwa-bootstrap.tsx");
    const decide = source.indexOf("fieldBootstrapStep({");
    const exchange = source.indexOf("restoreFieldPwaSession({");
    expect(decide).toBeGreaterThan(0);
    expect(exchange).toBeGreaterThan(decide);
  });
});

describe("a refused session keeps the way back in (4)", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("window", {
      location: { pathname: "/field-staff" },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal("document", { cookie: "" });
  });

  it("clearFieldSession drops the tokens but keeps the hand-off, the drafts and the queue", async () => {
    const auth = await import("@/lib/auth-token");
    store.set("mse_field_access_token", "a");
    store.set("mse_field_refresh_token", "r");
    store.set("mse_field_pwa_bootstrap_token", TOKEN);
    store.set("mse-form-draft:v1:[\"c\",\"u\",\"receipt\"]", "{\"plate\":\"WXX 1\"}");
    auth.clearFieldSession();
    expect(store.has("mse_field_access_token")).toBe(false);
    expect(store.has("mse_field_refresh_token")).toBe(false);
    expect(auth.getFieldBootstrapToken()).toBe(TOKEN);
    expect(store.get("mse-form-draft:v1:[\"c\",\"u\",\"receipt\"]")).toBe("{\"plate\":\"WXX 1\"}");
  });

  it("signing out still forgets the hand-off", async () => {
    const auth = await import("@/lib/auth-token");
    store.set("mse_field_pwa_bootstrap_token", TOKEN);
    auth.clearFieldTokens();
    expect(auth.getFieldBootstrapToken()).toBeNull();
  });

  it("the session check uses the keeping variant on a 401", () => {
    const provider = read("components/providers/auth-provider.tsx");
    expect(provider).toMatch(/if \(fieldSession\) clearFieldSession\(\);/);
    expect(provider).not.toMatch(/clearFieldTokens\(\)/);
  });
});
