/**
 * What a correction screen says when the server will not save (JB170).
 *
 * 客户 11-11 第四批 事项 1 (MI-PRJ-0003-008): a delivery's 「更正」 with only
 * the reason filled in was refused with 「The correction changes nothing.」
 * in English, under the reason - which went red - and 「请检查标红的字段后
 * 重试。」 in the corner. Read together: the reason was wrong, or the record
 * could not be corrected. Neither was true; nothing had been changed.
 *
 * Now the server answers `correction_unchanged`, about the whole form, and
 * the screens say that one sentence beside 「保存」 - where the eye is when
 * the button is pressed, never scrolled away at the bottom of the fields.
 */

import { ApiError } from "@/interfaces/api";

/** The refusal of a correction that changes nothing. */
export const CORRECTION_UNCHANGED = "correction_unchanged";

/** The sentence beside 「保存」 when nothing was changed, or null. */
export function unchangedRefusal(error: unknown): string | null {
  return error instanceof ApiError && error.code === CORRECTION_UNCHANGED ? error.message : null;
}

/**
 * The 「增加材料」 window's sentence for a refused save.
 *
 * The window has no field the server could mark red, so a refusal that names
 * the materials or the reason says that, not 「请检查标红的字段」.
 */
export function linesRefusal(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === "validation_failed") {
    const named =
      error.errors.lines ||
      error.errors.reason ||
      Object.entries(error.errors).find(([key]) => /^lines\.\d+\.id$/.test(key))?.[1];
    if (named) return named;
  }
  return error.message || fallback;
}
