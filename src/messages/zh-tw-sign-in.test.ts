import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Traditional Chinese says 「登入」 for signing in (JB164). 「登錄」 is the
 * mainland word; in Taiwan and Hong Kong it reads as "register / record", so
 * 「登錄記錄」 looked like a registry, not the sign-in history. Every 「登錄」 in
 * zh-TW.json meant signing in when this was written; a new text that means
 * registering should say 「登記」.
 */
function strings(node: unknown, prefix = ""): [string, string][] {
  if (typeof node === "string") return [[prefix, node]];
  if (!node || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([key, value]) => strings(value, prefix ? `${prefix}.${key}` : key));
}

const catalogue = JSON.parse(readFileSync(path.join(process.cwd(), "src/messages/zh-TW.json"), "utf8"));

describe("zh-TW signs in with 「登入」 (JB164)", () => {
  it("has no 「登錄」 left", () => {
    expect(strings(catalogue).filter(([, text]) => text.includes("登錄"))).toEqual([]);
  });

  it("names the sign-in page, its button and the field staff's sign-in 「登入」", () => {
    expect(catalogue.auth.login.title).toBe("登入");
    expect(catalogue.auth.login.submit).toBe("登入");
    expect(catalogue.auth.signedOut).toBe("已退出登入");
    expect(catalogue.auth.sessionExpired).toBe("登入已過期，請重新登入。");
  });
});
