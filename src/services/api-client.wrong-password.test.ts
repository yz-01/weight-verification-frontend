import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import { publishTranslator } from "@/lib/i18n-runtime";
import { api } from "./api-client";

/**
 * Where a wrong password leaves you.
 *
 * There are three back-office entrances - `/admin/login`, `/trace/login` and
 * `/scrap/login` - and all three render the same form against the same
 * endpoint. A user reported that typing the wrong password at any of them
 * threw them onto `/login`, the contractor entrance: "输入错密码应该是会留在
 * 一样的登录入口才对，不然很乱啊一直跳来跳去，登录去哪里也不知道"
 * (2026-09-05).
 *
 * The cause was the sign-out path treating the login request itself as an
 * expired session. `login()` does not pass `auth: false`, so a 401 from it
 * looked exactly like a 401 from any other call: clear the tokens, say "your
 * session has expired", and navigate to the entrance for the portal in
 * storage - and with no session yet there is no portal in storage, so
 * `portalLoginPath(null)` returns the default `/login`.
 *
 * Both halves matter, so both are tested: the credential exchange must be
 * exempt, and everything else must not be. An exemption that quietly grew to
 * cover ordinary calls would leave a dead session running until something
 * else broke.
 */

const clearTokens = vi.fn();

vi.mock("@/lib/auth-token", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-token")>()),
  clearTokens: () => clearTokens(),
  getAccessToken: () => "an-access-token",
  getRefreshToken: () => null,
  getSessionPortal: () => null,
}));

function respondWith(body: unknown, status: number) {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

const WRONG_PASSWORD = {
  success: false,
  message: "No active account found with the given credentials.",
  code: "authentication_failed",
  errors: {},
};

let navigatedTo = "";

beforeEach(() => {
  publishTranslator("en", en as unknown as Record<string, unknown>);
  clearTokens.mockClear();
  navigatedTo = "";
  vi.stubGlobal("window", {
    location: {
      pathname: "/admin/login",
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
    // `send` asks for the active project, which asks whether this is the
    // field app, which asks the display mode. Leaving any of them out makes
    // the request throw before it is sent, and then every assertion about
    // where the user did *not* end up passes for the wrong reason - which is
    // how the first draft of this file reported four passes and proved
    // nothing.
    matchMedia: () => ({ matches: false }),
  });
  // A separate global, not `window.navigator`: the standalone-app check reads
  // the bare `navigator`, and Node 20 does not define one.
  vi.stubGlobal("navigator", { userAgent: "test", standalone: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function attempt(path: string) {
  try {
    await api.post(path, {}, { silent: true });
  } catch (error) {
    return error as Error;
  }
  throw new Error("The request was expected to fail and did not.");
}

describe("a 401 from the login form itself", () => {
  it("leaves the user on the entrance they were typing into", async () => {
    respondWith(WRONG_PASSWORD, 401);

    await attempt("/api/auth/login/");

    expect(navigatedTo).toBe("");
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it("hands the form the server's reason, not a session notice", async () => {
    respondWith(WRONG_PASSWORD, 401);

    const failure = await attempt("/api/auth/login/");

    expect(failure.message).not.toBe(en.auth.sessionExpired);
    expect(failure.message).toBe(WRONG_PASSWORD.message);
  });

  it.each([
    "/api/field-access/field_login/",
    "/api/field-access/activate/",
    "/api/field-access/pwa_bootstrap/",
  ])("is exempt for the field entrance %s too", async (path) => {
    respondWith(WRONG_PASSWORD, 401);

    await attempt(path);

    expect(navigatedTo).toBe("");
    expect(clearTokens).not.toHaveBeenCalled();
  });
});

describe("a 401 from an ordinary call", () => {
  it("still ends the session, because that one really has expired", async () => {
    respondWith(
      { success: false, message: "Token expired.", code: "", errors: {} },
      401,
    );

    await attempt("/api/projects/");

    expect(clearTokens).toHaveBeenCalled();
    expect(navigatedTo).toBe("/login");
  });
});
