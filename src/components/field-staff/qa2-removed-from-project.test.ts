/**
 * QA2 (JB245 walk): a phone signed out by 「移出项目」 (his last project) read
 * 「办公室已重新发出链接，请用新链接重新绑定。」 - a link nobody sent. The
 * server now says `field_removed_from_project`; the phone keeps it for its PIN
 * screen like the office's other sign-outs, and the PIN box is not offered
 * (a PIN cannot bring the project back).
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { FIELD_EXPLAINED_SIGN_OUTS, FIELD_OFFICE_SIGN_OUTS, FIELD_REMOVED_FROM_PROJECT } from "@/lib/auth-token";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const access = readFileSync("src/components/field-staff/field-access.tsx", "utf-8");

describe("QA2 JB245: taken off the project, the phone says so", () => {
  it("is one of the office's sign-outs the phone explains", () => {
    expect(FIELD_REMOVED_FROM_PROJECT).toBe("field_removed_from_project");
    expect(FIELD_OFFICE_SIGN_OUTS).toContain(FIELD_REMOVED_FROM_PROJECT);
    expect(FIELD_EXPLAINED_SIGN_OUTS).toContain(FIELD_REMOVED_FROM_PROJECT);
  });

  it("the PIN screen treats it as a PIN cannot help", () => {
    expect(access.match(/FIELD_REMOVED_FROM_PROJECT/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("four languages, plain, 你", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect((messages as unknown as { errors: { api: Record<string, string> } }).errors.api.field_removed_from_project).toBeTruthy();
    }
    expect(zh.errors.api.field_removed_from_project).toContain("移出项目");
    expect(zh.errors.api.field_removed_from_project).not.toContain("您");
    expect(zh.errors.api.field_removed_from_project).not.toContain("链接");
  });
});
