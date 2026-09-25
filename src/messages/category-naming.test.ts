/**
 * 栏目 is a business entry, 分类 is what sits under it (D-284).
 *
 * The customer, 2026-09-26: 「栏目 = 业务入口，例如：材料进场、设备管理、工程
 * 进度、隐患整改、Sundry Claim。而：混凝土、钢筋、洋灰 = 材料分类」. The screens
 * had it backwards - 「页面叫【栏目管理】，按钮叫【新增栏目】，但实际新增的却是
 * 『混凝土、钢筋、洋灰』这种分类项」. Every string that meant a category now says
 * 分类; this keeps it that way.
 *
 * Allowed: 总栏目 (all business entries' records), and 业务栏目 where a sentence
 * really means the business entry.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ALLOWED = [/总栏目/g, /業務欄目|业务栏目/g, /總欄目/g];
const WORD: Record<string, RegExp> = { zh: /栏目/, "zh-TW": /欄目/ };

function strings(node: unknown, prefix = ""): [string, string][] {
  if (typeof node === "string") return [[prefix, node]];
  if (!node || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([key, value]) =>
    strings(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("栏目 never names a category", () => {
  it.each(Object.keys(WORD))("in %s", (locale) => {
    const catalogue = JSON.parse(
      readFileSync(path.join(process.cwd(), `src/messages/${locale}.json`), "utf8"),
    );
    const offenders = strings(catalogue)
      .filter(([, text]) => WORD[locale].test(ALLOWED.reduce((rest, allowed) => rest.replace(allowed, ""), text)))
      .map(([key, text]) => `${key}: ${text}`);
    expect(offenders).toEqual([]);
  });

  it("names the screen and its button for what they manage", () => {
    const zh = JSON.parse(readFileSync(path.join(process.cwd(), "src/messages/zh.json"), "utf8"));
    expect(zh.categoryManagement.title).toBe("分类管理");
    expect(zh.categoryManagement.create).toBe("新增分类");
    expect(zh.nav.submodule.categoryManagement).toBe("分类管理");
    expect(zh.contractorOps.filing.action).toBe("归入分类");
    // Named after the business entry each belongs to (D-287).
    expect(zh.categoryManagement.module).toMatchObject({
      equipment: "设备分类",
      recycle: "环保材料出场分类",
      debris: "工地清运分类",
    });
    expect(zh.categoryManagement.module).not.toHaveProperty("field");
    expect(zh.categoryManagement.module).not.toHaveProperty("claim");
  });
});
