import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

/**
 * JB95 guard (客户 11-03 「供应商编号能不能系统自己自动生成？」): a new
 * supplier may be saved without a code and the server numbers it SUP-0001
 * on. An existing supplier keeps a code.
 */
const read = (file: string) =>
  readFileSync(path.join(process.cwd(), "src/components/suppliers", file), "utf8");

describe("供应商编号 is numbered by the system when left blank", () => {
  it("asks for a code only when editing on the supplier page", () => {
    const form = read("create-supplier.tsx");
    expect(form).toMatch(/validators=\{isEdit \? \{ onSubmit: required\(/);
    expect(form).toMatch(/required=\{isEdit\}/);
    expect(form).toMatch(/t\("suppliers\.hint\.codeAuto"\)/);
  });

  it("lets the quick add save without a code", () => {
    const quick = read("quick-add-supplier.tsx");
    expect(quick).not.toMatch(/\[code\.trim\(\), t\("suppliers\.field\.code"\)\]/);
    expect(quick).toMatch(/label=\{t\("suppliers\.field\.code"\)\} optional=/);
  });

  it("says so in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.suppliers.placeholder.code.trim()).not.toBe("");
      expect(messages.suppliers.hint.codeAuto).toContain("SUP-0001");
    }
    expect(zh.suppliers.placeholder.code).toBe("留空由系统自动生成");
  });
});
