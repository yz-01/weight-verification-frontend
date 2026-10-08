import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";
import { api, REFRESH_TIMEOUT_MS } from "./api-client";

/**
 * A session renewal with no answer is no answer, not a refusal.
 *
 * The access token lasts 30 minutes. A 材料进场 typed in over a longer stretch
 * is sent, refused with 401, and the session is renewed before it is sent
 * again. On a weak site signal that renewal could hang with nothing to end it
 * (提交 spun for good), and when it failed the error reached the form bare -
 * 「操作失败」 - instead of as "no answer", which is what sends a delivery to
 * the offline queue (`isNetwork`).
 */

const clearTokens = vi.fn();

vi.mock("@/lib/auth-token", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-token")>()),
  clearTokens: () => clearTokens(),
  getAccessToken: () => "an-expired-access-token",
  getRefreshToken: () => "a-refresh-token",
  getSessionPortal: () => null,
}));

const expired = () =>
  new Response(JSON.stringify({ success: false, message: "Token expired.", errors: {} }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

function delivery() {
  const data = new FormData();
  data.append("delivery_note_no", "DO-TYPED-1");
  return data;
}

beforeEach(() => {
  clearTokens.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("renewing the session on a weak signal", () => {
  it("gives up after REFRESH_TIMEOUT_MS and reports no answer, so the delivery is queued", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (String(url).includes("/api/auth/refresh_token/")) {
        // A stalled link: only the abort ends it.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        });
      }
      return Promise.resolve(expired());
    }) as unknown as typeof fetch;

    const failure = api
      .post("/api/receipts/create_receipt/", delivery(), { silent: true })
      .catch((error: unknown) => error);
    let settled = false;
    void failure.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(REFRESH_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const error = await failure;
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isNetwork).toBe(true);
    // No answer is not a signed-out session.
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it("reports a renewal that cannot reach the server as no answer", async () => {
    globalThis.fetch = vi.fn((url: string) =>
      String(url).includes("/api/auth/refresh_token/")
        ? Promise.reject(new TypeError("Load failed"))
        : Promise.resolve(expired()),
    ) as unknown as typeof fetch;

    const error = await api
      .post("/api/receipts/create_receipt/", delivery(), { silent: true })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isNetwork).toBe(true);
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it("reports a resend that gets no answer after the renewal as no answer", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn((url: string) => {
      if (String(url).includes("/api/auth/refresh_token/")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ success: true, data: { access: "new-access", refresh: "new-refresh" } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      calls += 1;
      return calls === 1 ? Promise.resolve(expired()) : Promise.reject(new TypeError("Load failed"));
    }) as unknown as typeof fetch;

    const error = await api
      .post("/api/receipts/create_receipt/", delivery(), { silent: true })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isNetwork).toBe(true);
  });

  it("still signs out when the server refuses the renewal", async () => {
    globalThis.fetch = vi.fn((url: string) =>
      Promise.resolve(
        String(url).includes("/api/auth/refresh_token/")
          ? new Response(JSON.stringify({ success: false, errors: {} }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            })
          : expired(),
      ),
    ) as unknown as typeof fetch;

    const error = await api
      .post("/api/receipts/create_receipt/", delivery(), { silent: true })
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({ status: 401 });
    expect(clearTokens).toHaveBeenCalled();
  });
});
