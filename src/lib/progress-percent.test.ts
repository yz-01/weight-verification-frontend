import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { hasPercent, percentText } from "@/lib/progress-percent";
import en from "@/messages/en.json";
import zh from "@/messages/zh.json";

/**
 * The phone's 新增进度 (H5/H11, HD2): 「只是拍照选择施工分类下拉，然后备注提交」,
 * 「百分比可以保留，但是不一定要填，不要有红点」. One photograph, no star on
 * the percentage, and 「未填」 wherever a record without one is shown.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

function progressDialog(): string {
  const source = read("src/components/contractor-ops/operations-workspaces.tsx");
  const start = source.indexOf("export function ProgressDialog(");
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("\nexport function ", start + 1));
}

describe("an empty percentage reads 未填 (HD2)", () => {
  it("prints a figure as a percentage and nothing as 未填", () => {
    expect(percentText("45.00", "未填")).toBe("45.00%");
    expect(percentText(null, "未填")).toBe("未填");
    expect(percentText(undefined, "未填")).toBe("未填");
    expect(percentText("", "未填")).toBe("未填");
    expect(hasPercent("0.00")).toBe(true);
    expect(hasPercent(null)).toBe(false);
  });

  it("is worded in the catalogues", () => {
    expect(zh.contractorOps.progress.percentUnfilled).toBe("未填");
    expect(en.contractorOps.progress.percentUnfilled).toBe("Not filled");
  });

  it("no progress screen prints a raw `percent_complete}%` any more", () => {
    for (const file of [
      "src/components/contractor-ops/office-module-lists.tsx",
      "src/components/contractor-ops/operations-workspaces.tsx",
      "src/components/contractor-ops/progress-percent-editor.tsx",
      "src/components/progress/progress-photos.tsx",
      "src/components/schedule-planning/schedule-planning-workspace.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/percent_complete\}%/);
    }
  });
});

describe("the phone's progress form asks for one photo and no percentage (HD2)", () => {
  const dialog = progressDialog();

  it("has no star on the percentage and does not wait for it", () => {
    expect(dialog).toMatch(/<FieldWrapper label=\{t\("field\.percentComplete"\)\}>/);
    expect(dialog).not.toMatch(/\[percent, t\("field\.percentComplete"\)\]/);
  });

  it("needs one photograph, the four subjects only suggested", () => {
    expect(dialog).toMatch(/\[submissionPhotos\.length >= 1, t\("field\.photos"\)\]/);
    expect(dialog).not.toMatch(/hasRequiredFieldEvidence/);
    expect(dialog).toMatch(/t\("progressEvidenceSuggested"/);
    expect(zh.contractorOps.progressEvidenceSuggested).toContain("至少拍 1 张");
  });

  it("no longer says a manager must confirm the percentage", () => {
    expect(zh.contractorOps.progress.recordHelp).not.toContain("确认");
    expect(zh.contractorOps.progress.recordHelp).toContain("可以不填");
  });
});
