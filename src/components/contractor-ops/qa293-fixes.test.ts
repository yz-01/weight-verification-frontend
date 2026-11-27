/**
 * QA293 (browser walk of JB293, 客户 11-27g 材料中英文名称) - what the walk found, kept fixed:
 *
 * 1. A double click on 【保存】 in a project's material form made the same new
 *    material twice (two MAT- codes). One save per press now.
 * 2. The company 「材料分类（含规格）」 list printed the 说明 under the name; the
 *    presets' 说明 is their English name, so an English screen read
 *    「Rebar / Rebar」. The 说明 line is left out when it only repeats the name.
 * 3. The records window's 「By material」 rows read 「1 deliveries」 in English.
 *
 * Coordinator 11-28 on the four questions:
 * 4. A project's own material list refuses a name another material already
 *    has (either language): 「这个项目已经有「{name}」了。请换一个名称。」 in four languages.
 * 5. The starter request types read the client's English in English / Malay
 *    (「Material Request」 …): the pickers and the 「全部项目」 filter show
 *    `display_name` and still send the stored name.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { requestTypeNameOptions } from "@/lib/request-types";

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

describe("QA293 4. a project material name another material has is refused, in four languages", () => {
  it("errors.api.project_material_name_taken", () => {
    const words = Object.fromEntries(
      ["zh", "zh-TW", "en", "ms"].map((language) => [language, JSON.parse(read(`src/messages/${language}.json`)).errors.api.project_material_name_taken]),
    );
    expect(words.zh).toBe("这个项目已经有「{name}」了。请换一个名称。");
    expect(words["zh-TW"]).toBe("這個項目已經有「{name}」了。請換一個名稱。");
    expect(words.en).toBe('This project already has "{name}". Use another name.');
    expect(words.ms).toBe('Projek ini sudah ada "{name}". Gunakan nama lain.');
    for (const text of Object.values(words)) expect(text).not.toContain("您");
  });
});

describe("QA293 5. request types in the reader's language", () => {
  it("the 「全部项目」 filter shows display_name and filters by the stored name", () => {
    const options = requestTypeNameOptions([
      { name: "材料申请", display_name: "Material Request", sort_order: 0 },
      { name: "材料申请", display_name: "Material Request", sort_order: 0 },
      { name: "吊车申请", sort_order: 5 },
    ]);
    expect(options).toEqual([
      { value: "材料申请", label: "Material Request" },
      { value: "吊车申请", label: "吊车申请" },
    ]);
  });

  it("the request form's type picker and the one-project filter show display_name", () => {
    expect(read("src/components/material-requests/request-form.tsx")).toContain("{row.display_name || row.name}");
    expect(read("src/components/material-requests/material-requests-office.tsx")).toContain(
      "label: row.display_name || row.name",
    );
  });
});
