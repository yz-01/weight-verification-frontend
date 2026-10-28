import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ApiError } from "@/interfaces/api";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import { assistantErrorField } from "./sign-off-assistants";

/**
 * JB56 (客户 10-28 事项 9): 「助理副密码」 on the profile. A refusal is said
 * where the person can act on it: a wrong / locked / missing owner PIN under
 * the owner's PIN box, a PIN already in use under the assistant's PIN box,
 * anything else below the form.
 */
describe("where an assistant refusal is shown", () => {
  it.each([
    ["sign_off_pin_incorrect", "owner_pin"],
    ["sign_off_pin_locked", "owner_pin"],
    ["sign_off_pin_not_set", "owner_pin"],
    ["sign_off_assistant_pin_taken", "pin"],
    ["sign_off_assistant_limit", "form"],
    ["sign_off_assistant_not_found", "form"],
  ])("%s goes under %s", (code, field) => {
    expect(assistantErrorField(new ApiError("x", 409, {}, code))).toBe(field);
  });

  it("a field error the server names wins", () => {
    const failure = new ApiError("Fill in.", 400, { owner_pin: "Required." }, "validation_failed");
    expect(assistantErrorField(failure)).toBe("owner_pin");
  });

  it("a failure with no answer is said below the form", () => {
    expect(assistantErrorField(new Error("offline"))).toBe("form");
  });
});

describe("the words, in all four languages", () => {
  const source = readFileSync(join(__dirname, "sign-off-assistants.tsx"), "utf8");
  const used = [...source.matchAll(/\bt\("([a-zA-Z.]+)"/g)].map((match) => match[1]);

  it.each([
    ["zh", zh],
    ["zh-TW", zhTW],
    ["en", en],
    ["ms", ms],
  ])("%s has every key the panel uses", (_lang, messages) => {
    const block = (messages as unknown as { signOff: { assistants: Record<string, unknown> } })
      .signOff.assistants;
    expect(used.length).toBeGreaterThan(20);
    for (const key of used) {
      const value = key.split(".").reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        block,
      );
      expect(typeof value, `signOff.assistants.${key}`).toBe("string");
    }
    const api = (messages as unknown as { errors: { api: Record<string, string> } }).errors.api;
    for (const code of [
      "session_replaced",
      "sign_off_assistant_limit",
      "sign_off_assistant_pin_taken",
      "sign_off_assistant_not_found",
    ]) {
      expect(api[code]).toBeTruthy();
    }
    const actions = (messages as unknown as { signOff: { action: Record<string, string> } }).signOff.action;
    expect(actions.archive_confirm).toBeTruthy();
    expect(actions.assistant_manage).toBeTruthy();
  });

  it("the other-computer message is the client's own words", () => {
    expect(zh.errors.api.session_replaced).toContain("这个账号已在另一台电脑登录");
  });
});
