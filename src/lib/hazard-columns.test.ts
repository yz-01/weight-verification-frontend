import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  PERMIT_COLUMN_CODE,
  RETIRED_VO_COLUMN_CODE,
  hazardColumns,
  titleForColumn,
} from "@/lib/hazard-columns";

/**
 * The two production bugs of 2026-10-10 on the 上报隐患 form.
 *
 * (a) 「我明明选的是施工准证申请，可是为什么名字会变成其他的」: PM-001 was titled
 *     「安全部整改」 and PM-003 「顾问要求整改」. The form filled the title from
 *     the first column picked and never again, and the phone - which has no
 *     title field - sent it anyway.
 * (b) 「如果是施工准证申请相机一个只有一个而已，为什么还是4个」: the permit column
 *     put the hazard's four site prompts and its 「上报隐患」 button in front of
 *     somebody filing a permit. Permits now have their own module (施工准证),
 *     so the hazard form no longer offers the column at all.
 */

const COLUMNS = [
  { id: "1", code: "EHS-SAFETY", name: "安全部整改" },
  { id: "2", code: "EHS-CONSULTANT", name: "顾问要求整改" },
  { id: "3", code: PERMIT_COLUMN_CODE, name: "施工准证申请" },
  { id: "4", code: RETIRED_VO_COLUMN_CODE, name: "整改 VO" },
  { id: "5", code: "EHS-OFFICE", name: "后台专用", is_visible_in_pwa: false },
];
const NAMES = COLUMNS.map((column) => column.name);

describe("the title follows the column (bug a)", () => {
  it("replaces a title the form wrote from the column picked before", () => {
    expect(titleForColumn("顾问要求整改", NAMES, "施工部整改")).toBe("施工部整改");
    expect(titleForColumn("安全部整改", NAMES, "施工部整改")).toBe("施工部整改");
  });

  it("fills an empty title", () => {
    expect(titleForColumn("  ", NAMES, "安全部整改")).toBe("安全部整改");
  });

  it("keeps a title somebody typed", () => {
    expect(titleForColumn("Scaffold at L3 loose", NAMES, "安全部整改")).toBe(
      "Scaffold at L3 loose",
    );
  });

  it("is what the form uses, and the phone sends no title", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/site-operations/safety.tsx"),
      "utf8",
    );
    expect(source).toContain("titleForColumn(value.title, offeredNames, next?.name");
    expect(source).toContain('title: fieldMode ? "" : draft.title.trim()');
    // The defect's own shape: the first column's name, kept for ever.
    expect(source).not.toContain('value.title.trim() || category?.name');
  });
});

describe("the hazard form offers hazard columns only (bug b)", () => {
  it("leaves out 施工准证申请 and the retired VO, in the office", () => {
    expect(hazardColumns(COLUMNS, false).map((column) => column.code)).toEqual([
      "EHS-SAFETY",
      "EHS-CONSULTANT",
      "EHS-OFFICE",
    ]);
  });

  it("and on the phone also a column hidden from it", () => {
    expect(hazardColumns(COLUMNS, true).map((column) => column.code)).toEqual([
      "EHS-SAFETY",
      "EHS-CONSULTANT",
    ]);
  });

  it("has no permit branch left in the hazard form", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/site-operations/safety.tsx"),
      "utf8",
    );
    const form = source.slice(source.indexOf("function SafetyCreateDialog("));
    expect(form).toContain("hazardColumns(categories.data?.results ?? [], fieldMode)");
    expect(form).not.toContain("ehs.permit.formPhotos");
    expect(form).not.toContain('record_type: "PERMIT"');
  });
});

describe("the 施工准证 form is one slot and its own button", () => {
  const parts = readFileSync(
    path.join(process.cwd(), "src/components/permits/permit-parts.tsx"),
    "utf8",
  );
  const form = parts.slice(parts.indexOf("export function PermitApplyForm("));

  it("asks for the permit's files once, not four site photos", () => {
    expect(form).toContain('label={t("field.files")} required');
    expect(form).toContain("<PermitFilesInput");
    expect(form).not.toContain("FieldEvidenceGrid");
    expect(form).not.toContain("fieldEvidence");
  });

  it("submits with 提交准证申请 and needs an approver", () => {
    expect(form).toContain('{t("submit")}');
    expect(form).toContain('[chosen, t("field.approver")]');
    for (const [locale, words] of [
      ["zh", "提交准证申请"],
      ["zh-TW", "提交准證申請"],
    ] as const) {
      const catalogue = JSON.parse(
        readFileSync(path.join(process.cwd(), `src/messages/${locale}.json`), "utf8"),
      );
      expect(catalogue.permits.submit).toBe(words);
      expect(catalogue.permits.field.files).toBe(locale === "zh" ? "准证文件" : "准證文件");
    }
  });
});
