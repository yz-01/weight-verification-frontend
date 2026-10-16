import { describe, expect, it } from "vitest";

import { pinStatusKey } from "@/components/profile/sign-off-pin-settings";
import { modeFor, pinDigits } from "@/components/shared/sign-off-dialog";
import type { SignOffPinStatus } from "@/services/sign-off.service";

const status = (patch: Partial<SignOffPinStatus>): SignOffPinStatus => ({
  has_pin: true,
  was_reset: false,
  locked_until: null,
  attempts_left: 5,
  exempt: false,
  updated_at: null,
  ...patch,
});

describe("the sign-off dialog opens on the right screen (I29)", () => {
  it("asks somebody with no PIN to set one, and carries on after", () => {
    expect(modeFor("sign_off_pin_required", status({ has_pin: false }))).toBe("setup");
    expect(modeFor("sign_off_pin_not_set", null)).toBe("setup");
  });

  it("says a lock instead of asking for a PIN that would be refused", () => {
    expect(modeFor("sign_off_pin_required", status({ locked_until: "2026-10-16T10:15:00Z" }))).toBe("locked");
    expect(modeFor("sign_off_pin_locked", null)).toBe("locked");
  });

  it("asks for the PIN otherwise, again after a wrong one", () => {
    expect(modeFor("sign_off_pin_required", status({}))).toBe("enter");
    expect(modeFor("sign_off_pin_incorrect", null)).toBe("enter");
    // The status could not be read: ask anyway, the server decides.
    expect(modeFor("sign_off_pin_required", null)).toBe("enter");
  });

  it("keeps six digits of whatever was typed", () => {
    expect(pinDigits("12a3 45-678")).toBe("123456");
    expect(pinDigits("")).toBe("");
  });
});

describe("「我的签核密码」 says where the PIN stands", () => {
  it("locked, reset by an administrator, set or not", () => {
    expect(pinStatusKey(status({ locked_until: "2026-10-16T10:15:00Z" }))).toBe("locked");
    expect(pinStatusKey(status({ has_pin: false, was_reset: true }))).toBe("reset");
    expect(pinStatusKey(status({}))).toBe("set");
    expect(pinStatusKey(status({ has_pin: false }))).toBe("notSet");
  });
});
