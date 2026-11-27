/**
 * QA293 (browser walk of JB293, 客户 11-27g 材料中英文名称) - what the walk found, kept fixed:
 *
 * 1. A double click on 【保存】 in a project's material form made the same new
 *    material twice (two MAT- codes). One save per press now.
 * 2. The company 「材料分类（含规格）」 list printed the 说明 under the name; the
 *    presets' 说明 is their English name, so an English screen read
 *    「Rebar / Rebar」. The 说明 line is left out when it only repeats the name.
 * 3. The records window's 「By material」 rows read 「1 deliveries」 in English.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

describe("QA293 1. one save per press in the material form", () => {
  it("【保存】 goes through the guarded saveOnce()", () => {
    const code = read("src/components/contractor-ops/operations-workspaces.tsx");
    const dialog = code.slice(code.indexOf("export function CategoryDialog("));
    const body = dialog.slice(0, dialog.indexOf("\nexport function ", 10));
    expect(body).toContain("const saving = useRef(false);");
    expect(body).toMatch(/if \(saving\.current\) return;\s+saving\.current = true;/);
    expect(body).toContain("onClick={saveOnce}");
    expect(body).not.toContain("onClick={() => save.mutate()}");
  });
});

describe("QA293 2. the company list does not repeat a name as its 说明", () => {
  it("the 说明 line is shown only when it differs from the name", () => {
    const code = read("src/components/contractor-ops/company-material-list.tsx");
    expect(code).toContain("!sameName(row.description, row.name)");
    expect(code).toMatch(/function sameName\(/);
  });
});

describe("QA293 3. 「1 delivery」 in English", () => {
  it("records.groupCount is a plural in en", () => {
    const en = JSON.parse(read("src/messages/en.json"));
    expect(en.categoryManagement.records.groupCount).toBe("{count, plural, one {# delivery} other {# deliveries}}");
  });
});
