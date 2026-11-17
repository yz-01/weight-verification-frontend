import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh.json";
import { ApiError } from "@/interfaces/api";
import { publishTranslator } from "@/lib/i18n-runtime";
import { APP_VERSION } from "@/lib/app-version";
import {
  clearPlatformGate,
  gateForRefusal,
  getPlatformGate,
  reloadedForUpdateRecently,
  rememberUpdateReload,
  reportPlatformGate,
  UPDATE_RELOAD_WINDOW_MS,
} from "@/lib/platform-gate";
import { api } from "./api-client";
import {
  QUEUE_ERROR_MAINTENANCE,
  QUEUE_ERROR_UPDATE,
  isRefusal,
  platformGateHold,
  queueErrorKey,
} from "./offline-sync.service";

/**
 * JB211 (Lucas 11-16 「把它们真的做出来」): 11.2.11 系统维护 and 11.2.9 强制更新
 * reach the screen. The server answers a customer with 503
 * `platform_maintenance` or 426 `client_update_required`; the page shows one
 * full-screen notice, keeps the session, and the phone's queue waits instead
 * of marking records 「需要处理」.
 */

const clearTokens = vi.fn();
vi.mock("@/lib/auth-token", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-token")>()),
  clearTokens: () => clearTokens(),
  getAccessToken: () => "access-token",
  getRefreshToken: () => "refresh-token",
  getSessionPortal: () => "MSE_TRACE",
  isFieldSessionContext: () => false,
  isDriverSessionContext: () => false,
}));

let navigatedTo = "";
const sent: Array<{ url: string; headers: Record<string, string> }> = [];

function serverSays(body: unknown, status: number) {
  sent.length = 0;
  globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    sent.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) } });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

const OK = { success: true, message: "", data: { ok: true } };
const MAINTENANCE = {
  success: false,
  message: "MSE Trace is under maintenance.",
  code: "platform_maintenance",
  errors: {},
};
const OUTDATED = {
  success: false,
  message: "The system has been updated. Reload the page to continue.",
  code: "client_update_required",
  errors: {},
};

const session = new Map<string, string>();

beforeEach(() => {
  clearTokens.mockClear();
  clearPlatformGate();
  session.clear();
  navigatedTo = "";
  publishTranslator("en", en as unknown as Record<string, unknown>);
  vi.stubGlobal("window", {
    location: {
      pathname: "/material-receipts",
      get href() {
        return navigatedTo;
      },
      set href(value: string) {
        navigatedTo = value;
      },
    },
    localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    sessionStorage: {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => void session.set(key, value),
      removeItem: (key: string) => void session.delete(key),
    },
    matchMedia: () => ({ matches: false }),
  });
  vi.stubGlobal("navigator", { userAgent: "test", standalone: false, onLine: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("JB211-F1 every call says which build it is", () => {
  it("sends X-Client-Version on a signed-in call and on a sign-in", async () => {
    serverSays(OK, 200);
    await api.get("/api/projects/get_projects/");
    expect(sent[0].headers["X-Client-Version"]).toBe(APP_VERSION);

    serverSays(OK, 200);
    await api.post("/api/field-access/field_login/", { pin: "123456" }, { auth: false, silent: true });
    expect(sent[0].headers["X-Client-Version"]).toBe(APP_VERSION);
  });

  it("leaves a public read a plain request", async () => {
    serverSays(OK, 200);
    await api.get("/api/branding/", undefined, { auth: false, silent: true });
    expect(sent[0].headers["X-Client-Version"]).toBeUndefined();
  });

  it("is package.json's own version in a build, whatever the deployment sets", async () => {
    const { readFileSync } = await import("node:fs");
    const config = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");
    const source = readFileSync(new URL("../lib/app-version.ts", import.meta.url), "utf8");
    expect(config).toMatch(/readFileSync\(path\.join\(process\.cwd\(\), "package\.json"\)/);
    expect(config).toMatch(/env: \{ MSE_PACKAGE_VERSION: packageVersion \}/);
    expect(source).toMatch(/APP_VERSION = process\.env\.MSE_PACKAGE_VERSION \|\| "0\.1\.0"/);
    expect(source).not.toMatch(/process\.env\.NEXT_PUBLIC_APP_VERSION/);
  });
});

describe("JB211-F2 系统维护: one full-screen notice, the session kept", () => {
  it("raises the maintenance notice on 503 platform_maintenance and does not sign out", async () => {
    serverSays(MAINTENANCE, 503);
    const failure = await api
      .get("/api/projects/get_projects/")
      .then(() => null)
      .catch((error: unknown) => error as ApiError);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure?.code).toBe("platform_maintenance");
    expect(failure?.message).toBe(en.errors.api.platform_maintenance);
    expect(getPlatformGate()).toBe("maintenance");
    expect(clearTokens).not.toHaveBeenCalled();
    expect(navigatedTo).toBe("");
  });

  it("leaves a refused sign-in to its own form, where MSE staff may still sign in", async () => {
    serverSays(MAINTENANCE, 503);
    await api.post("/api/auth/login/", {}, { silent: true }).catch(() => undefined);
    expect(getPlatformGate()).toBeNull();
  });

  it("a proxy's own 503 is still only 「服务器忙」, not maintenance", async () => {
    globalThis.fetch = vi.fn(async () => new Response("<html>busy</html>", { status: 503 })) as unknown as typeof fetch;
    await api.get("/api/projects/get_projects/", undefined, { silent: true }).catch(() => undefined);
    expect(getPlatformGate()).toBeNull();
  });
});

describe("JB211-F3 强制更新: 「请重新载入」", () => {
  it("raises the update notice on 426, signing nobody out", async () => {
    serverSays(OUTDATED, 426);
    await api.get("/api/projects/get_projects/").catch(() => undefined);
    expect(getPlatformGate()).toBe("update");
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it("maintenance wins over an update", () => {
    reportPlatformGate("maintenance");
    reportPlatformGate("update");
    expect(getPlatformGate()).toBe("maintenance");
  });

  it("knows when the same old build came back after a reload", () => {
    const now = 1_000_000;
    expect(reloadedForUpdateRecently("0.1.0", now)).toBe(false);
    rememberUpdateReload("0.1.0", now);
    expect(reloadedForUpdateRecently("0.1.0", now + 60_000)).toBe(true);
    expect(reloadedForUpdateRecently("0.2.0", now + 60_000)).toBe(false);
    expect(reloadedForUpdateRecently("0.1.0", now + UPDATE_RELOAD_WINDOW_MS + 1)).toBe(false);
  });

  it("tells the two refusals apart from ordinary ones", () => {
    expect(gateForRefusal(503, "platform_maintenance")).toBe("maintenance");
    expect(gateForRefusal(426, "client_update_required")).toBe("update");
    expect(gateForRefusal(503, "server_busy")).toBeNull();
    expect(gateForRefusal(403, "permission_denied")).toBeNull();
  });
});

describe("JB211-F4 the phone's queue waits instead of flagging records", () => {
  it("a 426 is not a refusal: the record goes again after the reload", () => {
    const outdated = new ApiError("", 426, {}, "client_update_required");
    expect(isRefusal(outdated)).toBe(false);
    expect(isRefusal(new ApiError("", 400, {}, "validation_failed"))).toBe(true);
    expect(platformGateHold(outdated)).toBe(QUEUE_ERROR_UPDATE);
  });

  it("maintenance holds the pass and says why on the record", () => {
    const down = new ApiError("", 503, {}, "platform_maintenance");
    expect(isRefusal(down)).toBe(false);
    expect(platformGateHold(down)).toBe(QUEUE_ERROR_MAINTENANCE);
    expect(platformGateHold(new ApiError("", 503, {}, "server_busy"))).toBeNull();
    expect(queueErrorKey(QUEUE_ERROR_MAINTENANCE)).toBe("offline.reason.maintenance");
    expect(queueErrorKey(QUEUE_ERROR_UPDATE)).toBe("offline.reason.updateRequired");
    expect(zh.offline.reason.maintenance).toContain("维护结束后会自动上传");
  });
});
