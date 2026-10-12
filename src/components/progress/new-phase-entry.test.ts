import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";

/**
 * 「＋新增施工分类」 where a 施工分类 is chosen, and the site's note shown (H14, HD3).
 *
 * The phases could only be made on the 施工分类 tab; the dropdowns people use
 * - the phone's 新增进度, the photo wall and the record list filters - had no
 * way in, and the note was only in a record's detail.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

describe("「＋新增施工分类」 is in every 施工分类 dropdown (HD3)", () => {
  it("is the last entry of the phone form's dropdown", () => {
    const source = read("src/components/contractor-ops/operations-workspaces.tsx");
    const dialog = source.slice(source.indexOf("export function ProgressDialog("));
    expect(dialog).toMatch(/<SelectItem value=\{NEW_PHASE_OPTION\}/);
    expect(dialog).toMatch(/value === NEW_PHASE_OPTION \? setAddingPhase\(true\) : setPhase\(value\)/);
    expect(dialog).toMatch(/<NewPhaseDialog/);
  });

  it("is on the photo wall's and the record list's filters", () => {
    expect(read("src/components/progress/progress-page.tsx")).toMatch(
      /param="phase"[\s\S]*?onAdd=\{[\s\S]*?setAddingPhase\(true\)/,
    );
    expect(read("src/components/contractor-ops/office-module-lists.tsx")).toMatch(
      /param="phase"[\s\S]*?onAdd=\{[\s\S]*?setAddingPhase\(true\)/,
    );
  });

  it("asks for the name only", () => {
    const dialog = read("src/components/progress/new-phase-dialog.tsx");
    expect(dialog).toMatch(/createConstructionPhase\(\{ project, name: name\.trim\(\) \}\)/);
    expect(dialog).not.toMatch(/field\.code/);
  });
});

describe("the note is shown and 阶段 reads 施工分类 (H14)", () => {
  it("puts the note on the wall's card and in the record list", () => {
    expect(read("src/components/progress/progress-photos.tsx")).toMatch(/photo\.description/);
    expect(read("src/components/contractor-ops/office-module-lists.tsx")).toMatch(
      /id: "description",\s+meta: \{ label: t\("progress\.note"\) \}/,
    );
    expect(zh.contractorOps.progress.note).toBe("备注");
  });

  it("names the field 施工分类 in the phone's history", () => {
    expect(zh.mySubmissions.field.phase).toBe("施工分类");
    expect(zhTW.mySubmissions.field.phase).toBe("施工分類");
    expect(en.mySubmissions.field.phase).toBe(en.contractorOps.field.phase);
    expect(JSON.stringify(zh)).not.toMatch(/"phase": "阶段"/);
  });
});
