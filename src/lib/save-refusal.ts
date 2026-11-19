import { ApiError } from "@/interfaces/api";
import { isSignOffCancelled } from "@/lib/sign-off";

/**
 * The sentence a window keeps beside its 「保存」 when a save did not go
 * through (JB218 walk 11-18, FAIL 1 + 2): the role window showed only a
 * field's problem, so a refusal from the server - 「你自己也是这个角色的人…」,
 * 「你自己没有这项权限…」 - left it open with nothing said, the toast unseen
 * behind it, and a server fault (500) said nothing at all.
 *
 * - The PIN dialog closed: `null` - the person chose not to go on.
 * - The server failed (5xx) or the error is not the server's: `notSaved`,
 *   which says the save did not go through and to try again.
 * - Any other refusal: its own words, already in the reader's language
 *   (`errors.api.<code>`, worded by the API client).
 */
export function saveRefusalLine(error: unknown, notSaved: string): string | null {
  if (!error || isSignOffCancelled(error)) return null;
  if (!(error instanceof ApiError) || error.status >= 500) return notSaved;
  return error.message || notSaved;
}
