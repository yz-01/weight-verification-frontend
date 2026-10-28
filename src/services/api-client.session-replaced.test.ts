import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh.json";
import { publishTranslator } from "@/lib/i18n-runtime";
import { api } from "./api-client";

/**
 * JB56 (客户 10-28 事项 9, Lucas 10-28): one computer at a time. When the same
 * account signs in on a second computer, the first one's next request is
 * refused with `session_replaced`, its renewal too, and it goes back to its
 * sign-in page saying why - 「这个账号已在另一台电脑登录」 - instead of the
 * usual "session expired", so nobody wonders what went wrong.
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

const REPLACED = {
  success: false,
  message: "This account has signed in on another computer. Sign in again to use it here.",
  code: "session_replaced",
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

describe("signed in on another computer", () => {
  it("goes to the sign-in page and says why, in the reader's language", async () => {
    publishTranslator("zh", zh as unknown as Record<string, unknown>);
    const urls = serverSays(REPLACED, 401);

    await expect(api.get("/api/material-receipts/get_receipts/")).rejects.toThrow();

    // The request, then one renewal - both refused - and no third try.
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain("/api/auth/refresh_token/");
    expect(clearTokens).toHaveBeenCalled();
    expect(navigatedTo).toBe("/trace/login");
    expect(remembered).toEqual([zh.errors.api.session_replaced]);
    expect(remembered[0]).toContain("这个账号已在另一台电脑登录");
  });

  it("an ordinary expiry is still said as an expiry, not as another computer", async () => {
    publishTranslator("en", en as unknown as Record<string, unknown>);
    serverSays({ success: false, message: "Expired.", code: "session_expired", errors: {} }, 401);

    await expect(api.get("/api/material-receipts/get_receipts/")).rejects.toThrow();

    expect(navigatedTo).toBe("/trace/login");
    expect(remembered).toEqual([]);
  });
});
