import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import { publishTranslator } from "@/lib/i18n-runtime";
import { api } from "./api-client";

/**
 * JB265 (INT37): head office saving 顾问项目授权 ends the consultant's session so
 * his new rights load. The server answers `consultant_grant_changed` (not the
 * generic `session_revoked` twenty causes share), and the sign-in page says
 * 「你的项目权限已更新，请重新登录。」.
 */

const clearTokens = vi.fn();
const remembered: string[] = [];

vi.mock("@/lib/auth-token", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-token")>()),
  clearTokens: () => clearTokens(),
  getAccessToken: () => "old-access",
  getRefreshToken: () => "old-refresh",
  getSessionPortal: () => "MSE_TRACE",
  isFieldSessionContext: () => false,
  isDriverSessionContext: () => false,
  rememberSignOutReason: (message: string) => remembered.push(message),
}));

const GRANT_CHANGED = {
  success: false,
  message: "Your project access was updated. Sign in again.",
  code: "consultant_grant_changed",
  errors: {},
};

let navigatedTo = "";

function serverSays(body: unknown, status: number) {
  const urls: string[] = [];
  globalThis.fetch = vi.fn(async (url: unknown) => {
    urls.push(String(url));
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return urls;
}

beforeEach(() => {
  clearTokens.mockClear();
  remembered.length = 0;
  navigatedTo = "";
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
    localStorage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
    matchMedia: () => ({ matches: false }),
  });
  vi.stubGlobal("navigator", { userAgent: "test", standalone: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("signed out because head office changed his project access", () => {
  it("goes to the sign-in page and says 「你的项目权限已更新，请重新登录。」", async () => {
    publishTranslator("zh", zh as unknown as Record<string, unknown>);
    const urls = serverSays(GRANT_CHANGED, 401);

    await expect(api.get("/api/consultant-dashboard/get_dashboard/")).rejects.toThrow();

    expect(urls[1]).toContain("/api/auth/refresh_token/");
    expect(clearTokens).toHaveBeenCalled();
    expect(navigatedTo).toBe("/trace/login");
    expect(remembered).toEqual(["你的项目权限已更新，请重新登录。"]);
  });

  it("every other revocation keeps the plain expiry", async () => {
    publishTranslator("zh", zh as unknown as Record<string, unknown>);
    serverSays({ success: false, message: "Revoked.", code: "session_expired", errors: {} }, 401);

    await expect(api.get("/api/consultant-dashboard/get_dashboard/")).rejects.toThrow();

    expect(remembered).toEqual([]);
  });

  it("has its words in four languages, saying 你", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.errors.api.consultant_grant_changed).toBeTruthy();
    }
    expect(zh.errors.api.consultant_grant_changed).not.toContain("您");
  });
});
