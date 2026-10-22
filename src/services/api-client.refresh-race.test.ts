import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lucas 2026-10-22: 「我一段时间没有用就会自动登出到输入PIN的页面」.
 *
 * Waking the phone after the 30-minute access token ran out sends several
 * requests at once (the session check, the bell, the to-do count). They must
 * renew once, and nothing short of the server refusing the renewal may end
 * the session: not a busy minute (429 / 5xx), and not another tab having
 * rotated the refresh token a moment earlier.
 */

const store = { access: "expired-access", refresh: "refresh-1" };
const clearTokens = vi.fn();

vi.mock("@/lib/auth-token", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-token")>()),
  clearTokens: () => clearTokens(),
  getAccessToken: () => store.access,
  getRefreshToken: () => store.refresh,
  setTokens: (tokens: { access: string; refresh: string }) => {
    store.access = tokens.access;
    store.refresh = tokens.refresh;
  },
  getSessionPortal: () => null,
}));

const { api } = await import("./api-client");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const ok = (data: unknown) => json(200, { success: true, data, message: "" });
const expired = () => json(401, { success: false, message: "Token expired.", errors: {} });

function server(refreshAnswer: () => Response | Promise<Response>) {
  const refreshCalls: string[] = [];
  const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).includes("/api/auth/refresh_token/")) {
      refreshCalls.push(JSON.parse(String(init?.body)).refresh);
      return refreshAnswer();
    }
    const auth = new Headers(init?.headers).get("Authorization");
    return auth === "Bearer fresh-access" ? ok({ fine: true }) : expired();
  });
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  return { fetch, refreshCalls };
}

beforeEach(() => {
  store.access = "expired-access";
  store.refresh = "refresh-1";
  clearTokens.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renewing after the phone wakes", () => {
  it("several requests at once renew once and all succeed", async () => {
    const { refreshCalls } = server(() =>
      ok({ access: "fresh-access", refresh: "refresh-2" }),
    );
    const results = await Promise.all([
      api.get("/api/auth/get_me/", { silent: true }),
      api.get("/api/notifications/get_unread_count/", { silent: true }),
      api.get("/api/field-staff/get_todo_count/", { silent: true }),
    ]);
    expect(results).toEqual([{ fine: true }, { fine: true }, { fine: true }]);
    expect(refreshCalls).toEqual(["refresh-1"]);
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it("a request refused after somebody else already renewed is just sent again", async () => {
    const refreshCalls: string[] = [];
    let first = true;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/auth/refresh_token/")) {
        refreshCalls.push("renewed again");
        return expired();
      }
      const auth = new Headers(init?.headers).get("Authorization");
      if (first) {
        first = false;
        // Renewed elsewhere while this request was on its way.
        store.access = "fresh-access";
        store.refresh = "refresh-2";
        return expired();
      }
      return auth === "Bearer fresh-access" ? ok({ fine: true }) : expired();
    }) as unknown as typeof fetch;
    await expect(api.get("/api/auth/get_me/", { silent: true })).resolves.toEqual({ fine: true });
    expect(refreshCalls).toEqual([]);
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it("another tab rotated the refresh token first: no sign-out", async () => {
    server(() => {
      // The other tab's answer landed while ours was in flight.
      store.access = "fresh-access";
      store.refresh = "refresh-2";
      return json(401, { success: false, code: "session_expired", message: "", errors: {} });
    });
    await expect(api.get("/api/auth/get_me/", { silent: true })).resolves.toEqual({ fine: true });
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it("a busy server on waking is no answer, not a sign-out", async () => {
    server(() => json(503, { success: false, message: "Service unavailable", errors: {} }));
    const failure = (await api
      .get("/api/auth/get_me/", { silent: true })
      .catch((error: unknown) => error)) as { isNetwork?: boolean };
    expect(failure.isNetwork).toBe(true);
    expect(clearTokens).not.toHaveBeenCalled();
    server(() => json(429, { success: false, message: "Slow down", errors: {} }));
    await api.get("/api/auth/get_me/", { silent: true }).catch(() => undefined);
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it("the server refusing the renewal still ends the session", async () => {
    server(() => json(401, { success: false, code: "session_expired", message: "", errors: {} }));
    await expect(api.get("/api/auth/get_me/", { silent: true })).rejects.toMatchObject({
      status: 401,
    });
    expect(clearTokens).toHaveBeenCalled();
  });
});

describe("the office signs a phone out (重新生成链接 / 停用)", () => {
  async function refusedWith(code: string) {
    const session = new Map<string, string>();
    const assigned: string[] = [];
    vi.stubGlobal("window", {
      location: {
        pathname: "/field-staff",
        set href(value: string) {
          assigned.push(value);
        },
      },
      sessionStorage: {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => session.set(key, value),
        removeItem: (key: string) => session.delete(key),
      },
      localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
      matchMedia: () => ({ matches: false }),
    });
    const { publishTranslator } = await import("@/lib/i18n-runtime");
    const zh = (await import("@/messages/zh.json")).default;
    publishTranslator("zh", zh as never);
    server(() => json(401, { success: false, code, message: "", errors: {} }));
    await api.get("/api/auth/get_me/", { silent: true }).catch(() => undefined);
    const { takeFieldSignOutReason } = await import("@/lib/auth-token");
    const reason = takeFieldSignOutReason();
    vi.unstubAllGlobals();
    return { reason, assigned };
  }

  it("a new link signs the phone out at once and says so in plain words", async () => {
    const { reason, assigned } = await refusedWith("field_link_replaced");
    expect(reason).toBe("办公室已重新发出链接，请用新链接重新绑定。");
    expect(assigned).toEqual(["/trace/field-login"]);
    expect(clearTokens).toHaveBeenCalled();
  });

  it("a stopped account says it was stopped", async () => {
    const { reason } = await refusedWith("field_account_stopped");
    expect(reason).toBe("这个账号已被停用。");
  });

  it("an ordinary expiry is not dressed up as the office's doing", async () => {
    const { reason } = await refusedWith("session_expired");
    expect(reason).toBe("");
  });
});
