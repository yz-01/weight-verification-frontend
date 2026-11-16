import { ApiError } from "@/interfaces/api";

/**
 * Why a driver's step or photo did not reach the server (JB207-5, Lucas 11-16
 * audit), for the one line the trip screen shows under its buttons.
 *
 * The trip link has no offline queue: a press without signal is simply lost,
 * and the API client keeps quiet about it while the phone says it is offline.
 * So the screen says it - 「没有网络，这一步没有记录，有网络后请再按一次」 -
 * rather than leaving the driver to think it went. A request that got no
 * answer at all (status 0: offline, unreachable, an upload cut off) is
 * `"offline"`; one the server refused carries its reason, already in the
 * driver's language.
 *
 * Anything else is not ours to word: the photo's 「需要定位」 has its own
 * sentence, and a signed-in driver's offline queue returns `"queued"` instead
 * of failing.
 */
export type NotRecorded = { kind: "offline" } | { kind: "refused"; reason: string } | null;

export function notRecorded(error: unknown): NotRecorded {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 0) return { kind: "offline" };
  return { kind: "refused", reason: error.message };
}
