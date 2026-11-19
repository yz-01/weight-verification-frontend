/**
 * Walk 11-18 (JB218 FAIL 1 + 2 and the silent 500): a refusal of a save is
 * said in the window, in its own words; a server fault says the save did not
 * go through and to try again; a closed PIN dialog says nothing.
 */
import { describe, expect, it } from "vitest";

import { ApiError } from "@/interfaces/api";
import { saveRefusalLine } from "@/lib/save-refusal";
import { SIGN_OFF_CANCELLED } from "@/lib/sign-off";
import zh from "@/messages/zh.json";

const NOT_SAVED = zh.common.saveFailed;

describe("saveRefusalLine", () => {
  it("says the server's refusal in its own words (409 role_self_lockout, the grant 403s)", () => {
    const lockout = new ApiError(zh.errors.api.role_self_lockout, 409, {}, "role_self_lockout");
    expect(saveRefusalLine(lockout, NOT_SAVED)).toBe(zh.errors.api.role_self_lockout);
    const type = new ApiError(zh.errors.api.role_self_lockout_type, 409, {}, "role_self_lockout_type");
    expect(saveRefusalLine(type, NOT_SAVED)).toBe(zh.errors.api.role_self_lockout_type);
    const grant = new ApiError(zh.errors.api.grant_not_held, 403, {}, "grant_not_held");
    expect(saveRefusalLine(grant, NOT_SAVED)).toBe(zh.errors.api.grant_not_held);
  });

  it("says a 5xx did not save and to try again - never 「出了点问题。」 or nothing", () => {
    for (const status of [500, 502, 503]) {
      const fault = new ApiError(zh.errors.generic, status, {}, "server_error");
      expect(saveRefusalLine(fault, NOT_SAVED)).toBe(NOT_SAVED);
    }
    expect(NOT_SAVED).toContain("没有保存成功");
    expect(NOT_SAVED).toContain("再试一次");
    expect(saveRefusalLine(new TypeError("boom"), NOT_SAVED)).toBe(NOT_SAVED);
  });

  it("says nothing when the PIN dialog was closed, or there is no error", () => {
    expect(saveRefusalLine(new ApiError("", 403, {}, SIGN_OFF_CANCELLED), NOT_SAVED)).toBeNull();
    expect(saveRefusalLine(null, NOT_SAVED)).toBeNull();
  });

  it("falls back to the not-saved line for a refusal with no words", () => {
    expect(saveRefusalLine(new ApiError("", 409), NOT_SAVED)).toBe(NOT_SAVED);
  });
});
