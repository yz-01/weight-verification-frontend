/**
 * JB211 (walk 11-17 F-A7): 「系统已更新」 promises 「你还是登录着的」, so a
 * refused sign-in check (426 强制更新, 503 系统维护) must never read as signed
 * out - not on the first answer, and not when the check is asked again.
 *
 * The bug lived in the query library's behaviour, so the first test drives
 * the real one: a query that has failed and never held an answer goes back to
 * "pending" when it is asked again, and the shell read "pending, asked
 * before" as "no account" and sent the customer to the sign-in page.
 */
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/interfaces/api";
import { retrySessionCheck, sessionCheckState } from "@/lib/session-check";

const OUTDATED = new ApiError("System updated", 426, {}, "client_update_required");
const MAINTENANCE = new ApiError("Under maintenance", 503, {}, "platform_maintenance");
const ACCOUNT = { id: "u1", email: "admin@contractor.test" };

function untilError(observer: QueryObserver<unknown, Error>): Promise<void> {
  return new Promise((resolve) => {
    if (observer.getCurrentResult().isError) return resolve();
    const stop = observer.subscribe((result) => {
      if (result.isError) {
        stop();
        resolve();
      }
    });
  });
}

describe("JB211-F9 a refused sign-in check keeps the session (walk F-A7)", () => {
  it("still not signed out when the check is asked again after a 426", async () => {
    const client = new QueryClient();
    let calls = 0;
    let answer: "outdated" | "account" = "outdated";
    const observer = new QueryObserver<unknown, Error>(client, {
      queryKey: ["auth", "me", "standard"],
      queryFn: async () => {
        calls += 1;
        if (answer === "outdated") throw OUTDATED;
        return ACCOUNT;
      },
      retry: retrySessionCheck,
      retryDelay: 0,
      networkMode: "always",
    });
    const stop = observer.subscribe(() => undefined);
    await untilError(observer);

    // One ask, not four: the server says the same until MSE lifts it.
    expect(calls).toBe(1);
    let result = observer.getCurrentResult();
    expect(sessionCheckState({ asking: true, data: result.data, isFetched: result.isFetched })).toEqual({
      isLoading: false,
      sessionUnreachable: true,
    });

    // Asked again (every minute, or coming back to the window). The library
    // puts the query back to "pending" - which used to read as signed out.
    const again = observer.refetch();
    result = observer.getCurrentResult();
    expect(result.status).toBe("pending");
    expect(result.isFetched).toBe(true);
    expect(sessionCheckState({ asking: true, data: result.data, isFetched: result.isFetched })).toEqual({
      isLoading: false,
      sessionUnreachable: true,
    });
    await again;

    // The floor lifted (or the new build loaded): he carries on, signed in.
    answer = "account";
    await observer.refetch();
    result = observer.getCurrentResult();
    expect(result.data).toEqual(ACCOUNT);
    expect(sessionCheckState({ asking: true, data: result.data, isFetched: result.isFetched })).toEqual({
      isLoading: false,
      sessionUnreachable: false,
    });
    stop();
    client.clear();
  });

  it("reads the other states as before", () => {
    // No token: nothing to ask, nothing to wait for (the shell goes to sign-in).
    expect(sessionCheckState({ asking: false, data: undefined, isFetched: false })).toEqual({
      isLoading: false,
      sessionUnreachable: false,
    });
    // First check under way.
    expect(sessionCheckState({ asking: true, data: undefined, isFetched: false })).toEqual({
      isLoading: true,
      sessionUnreachable: false,
    });
    // A refused session (401 / 403, its tokens already dropped) is null: not "unreachable".
    expect(sessionCheckState({ asking: true, data: null, isFetched: true })).toEqual({
      isLoading: false,
      sessionUnreachable: false,
    });
    // An account in hand.
    expect(sessionCheckState({ asking: true, data: ACCOUNT, isFetched: true })).toEqual({
      isLoading: false,
      sessionUnreachable: false,
    });
  });

  it("asks again at once only for the transient failures", () => {
    expect(retrySessionCheck(0, OUTDATED)).toBe(false);
    expect(retrySessionCheck(0, MAINTENANCE)).toBe(false);
    expect(retrySessionCheck(0, new ApiError("", 401))).toBe(false);
    expect(retrySessionCheck(0, new ApiError("", 403))).toBe(false);
    // A proxy's own 503, a 502, no answer at all: worth another try (F-365).
    expect(retrySessionCheck(0, new ApiError("busy", 503, {}, "server_busy"))).toBe(true);
    expect(retrySessionCheck(1, new ApiError("", 502))).toBe(true);
    expect(retrySessionCheck(2, new ApiError("offline", 0))).toBe(true);
    expect(retrySessionCheck(3, new ApiError("", 502))).toBe(false);
  });
});
