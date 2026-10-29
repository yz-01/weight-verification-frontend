import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import messages from "@/messages/zh.json";

/**
 * JB78 (客户 10-29 晚 事项 6): 「退出账号了不是应该显示登录吗？他到底什么意思」.
 * Pressing 退出登录 lands on the sign-in page, which now says why it is there.
 */
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("the sign-in page after 退出登录 (JB78)", () => {
  it("is told the person signed out, on the office computer only", () => {
    expect(read("src/components/providers/auth-provider.tsx")).toContain(
      "if (!fieldSession && !driverSession) rememberSignOutReason(SIGNED_OUT);",
    );
  });

  it("says it in words, not the code", () => {
    expect(read("src/components/auth/login.tsx")).toContain(
      'signedOutReason === SIGNED_OUT ? t("auth.login.signedOut") : signedOutReason',
    );
    expect(messages.auth.login.signedOut).toBe("你已退出登录。要再用，输入电子邮箱和密码登录。");
  });
});
