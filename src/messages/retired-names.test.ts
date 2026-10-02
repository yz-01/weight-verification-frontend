import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Names the customer retired (Phase 2, 2026-10).
 *
 * - 考勤 → 电子围栏 / 人员进场, 人员进场记录, 紧急在场名单 (C21:
 *   「统一名称……不用『考勤』」).
 * - 总栏目 → 现场记录中心 (B05).
 * - 合作回收商 → 环保材料管理 (B08).
 *
 * A renamed menu that a toast or a help sentence still calls by its old name
 * sends the reader looking for something that is no longer there.
 */
const RETIRED: Record<string, RegExp> = {
  zh: /考勤|总栏目|合作回收商/,
  "zh-TW": /考勤|總欄目|合作回收商/,
};

function strings(node: unknown, prefix = ""): [string, string][] {
  if (typeof node === "string") return [[prefix, node]];
  if (!node || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([key, value]) =>
    strings(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("retired names stay retired", () => {
  it.each(Object.keys(RETIRED))("in %s", (locale) => {
    const catalogue = JSON.parse(
      readFileSync(path.join(process.cwd(), `src/messages/${locale}.json`), "utf8"),
    );
    const offenders = strings(catalogue)
      .filter(([, text]) => RETIRED[locale].test(text))
      .map(([key, text]) => `${key}: ${text}`);
    expect(offenders).toEqual([]);
  });
});
