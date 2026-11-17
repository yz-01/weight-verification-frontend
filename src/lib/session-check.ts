/**
 * What the shell makes of the sign-in check (`get_me`), kept apart from the
 * provider so it can be tested against the query library itself.
 *
 * JB211 (walk 11-17 F-A7): a customer who pressed 【重新载入】 on 「系统已更新」
 * ended up on the sign-in page, although the screen had just told him
 * 「您还是登录着的」. The page loaded again on the same old build, so `get_me`
 * was answered 426 every time; when the query asked again (every minute, or
 * on coming back to the window), TanStack Query v5 put it back to "pending"
 * because it had never held an answer, and "pending, but asked before" read as
 * "no account" - the shell sent him to the sign-in page. The same happened
 * after any run of failures (系统维护's 503, a server down for a while), which
 * F-365 had meant to rule out.
 */

import { ApiError } from "@/interfaces/api";
import { gateForRefusal } from "@/lib/platform-gate";

export interface SessionCheckState {
  /** First check, no answer yet: wait. */
  isLoading: boolean;
  /**
   * Asked, and never answered with an account or a refusal - including while
   * it is being asked again. The session is kept (F-365); this is never
   * "signed out".
   */
  sessionUnreachable: boolean;
}

/**
 * ``data``: the query's answer - the account, ``null`` for a refused session
 * (its tokens already dropped), ``undefined`` for none yet. ``isFetched``: the
 * query has finished at least once, with an answer or a failure.
 */
export function sessionCheckState({
  asking,
  data,
  isFetched,
}: {
  asking: boolean;
  data: unknown;
  isFetched: boolean;
}): SessionCheckState {
  const noAnswer = asking && data === undefined;
  return {
    isLoading: noAnswer && !isFetched,
    sessionUnreachable: noAnswer && isFetched,
  };
}

/**
 * Whether to ask `get_me` again at once after a failure (F-365: only the
 * transient ones). Never a refused credential - `api-client` ends that
 * session itself - and never 系统维护 / 强制更新 (JB211): the server gives the
 * same answer until MSE lifts it, and the full-screen notice already says so
 * and checks again by itself.
 */
export function retrySessionCheck(count: number, error: unknown): boolean {
  if (count >= 3) return false;
  if (!(error instanceof ApiError)) return true;
  if (error.status === 401 || error.status === 403) return false;
  return gateForRefusal(error.status, error.code) === null;
}
