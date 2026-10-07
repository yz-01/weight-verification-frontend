import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { KIND_MODULE } from "@/lib/category-modules";

/**
 * Consultant submissions, sundry claims and the period claims each have
 * columns of their own (T-394, T-395; D-274, D-275).
 *
 * Lucas 2026-09-25: 「顾问资料提交的栏目为什么是放在现场资料分类？应该要分开的
 * 才对然后杂费报销或者claim都需要放在栏目里面 … 应该是归档去他们对应的栏目，要
 * 容易找的」, and on sundry claims 「后台处理时再归」.
 *
 * Asserted by source, because the way this drifts is one `kind="FIELD"` left
 * behind, or a filing button wired to another module's columns.
 */

const ROOT = process.cwd();
const read = (file: string) =>
  readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

/** The body of one top-level function, up to the next top-level function. */
function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `${signature} exists`).toBeGreaterThan(-1);
  const next = source.slice(start + signature.length).search(/\n(export )?function /);
  return next === -1
    ? source.slice(start)
    : source.slice(start, start + signature.length + next);
}

const PHONE = "src/components/field-staff/field-records-panel.tsx";
const MANAGEMENT = "src/components/contractor-ops/category-management.tsx";
const WORKSPACES = "src/components/contractor-ops/operations-workspaces.tsx";
const SUNDRY_OFFICE = "src/components/sundry-claims/sundry-claims-office.tsx";
const SUNDRY_PHONE = "src/components/field-staff/sundry-claim-capture.tsx";
const CLAIMS = "src/components/contractor-ops/claim-engine.tsx";

describe("the phone's 顾问资料提交 has no category at all (2026-10 B1, F4, Q19)", () => {
  const panel = () => functionBody(read(PHONE), "function ConsultantCapturePanel(");

  it("asks for no column of any kind", () => {
    // 「为什么会有整改 VO？」: the 「材料分类」 list held hazard categories.
    expect(panel()).not.toMatch(/ProjectColumnPicker|getProjectCategories|kind="/);
    expect(panel()).not.toMatch(/\bcategory: column\b|consultantCapture\.category/);
  });

  it("asks one question with four big buttons, the four types of Q2", () => {
    const source = read(PHONE);
    expect(source).toMatch(
      /CONSULTANT_ASK_FOR = \[\s*"MATERIAL_APPROVAL",\s*"MATERIAL_CERT_SUBMISSION",\s*"RFI",\s*"OTHER",\s*\]/,
    );
    expect(panel()).toMatch(/t\("consultantCapture\.askFor"\)/);
    expect(panel()).toMatch(/application_category: chosen/);
    const zh = JSON.parse(read("src/messages/zh.json")).fieldStaffPwa.consultantCapture;
    expect(zh.askFor).toBe("这次要顾问看什么");
    expect(zh.askOption).toEqual({
      MATERIAL_APPROVAL: "材料申请",
      MATERIAL_CERT_SUBMISSION: "材料证书提交",
      RFI: "RFI（问顾问问题）",
      OTHER: "其他",
    });
  });

  it("needs one photo, and the four old subjects are only a hint", () => {
    expect(panel()).toMatch(/\[photos\.length >= 1, t\("consultantCapture\.photos"\)\]/);
    expect(panel()).not.toMatch(/hasRequiredFieldEvidence|FieldEvidenceGrid/);
    expect(panel()).toMatch(/hint=\{t\("consultantCapture\.photoHint"\)\}/);
    for (const locale of ["en", "zh", "zh-TW", "ms"]) {
      const capture = JSON.parse(read(`src/messages/${locale}.json`)).fieldStaffPwa.consultantCapture;
      for (const key of ["askFor", "photoHint", "description", "optional", "takePhoto", "morePhoto"]) {
        expect(capture[key], `${locale} ${key}`).toBeTruthy();
      }
      for (const gone of ["category", "categoryOption"]) {
        expect(capture, `${locale} ${gone}`).not.toHaveProperty(gone);
      }
    }
  });

  it("leaves an old draft's category unread rather than shown", () => {
    expect(panel()).not.toMatch(/useDraftState\("category"|useDraftState\("column"/);
    // The photographs of an old draft are kept: the same key, empty slots dropped.
    expect(panel()).toMatch(/useDraftState\("evidence", createEmptyFieldEvidence\)/);
    expect(panel()).toMatch(/completedFieldEvidence\(evidence\)/);
  });
});

describe("consultant and sundry categories are retired (2026-10 B1, X5)", () => {
  it.each(["consultant", "sundry"])("%s is no module on Category Management", (key) => {
    expect(read(MANAGEMENT)).not.toMatch(new RegExp(`columnModule\\("${key}"`));
    expect(Object.values(KIND_MODULE)).not.toContain(key);
  });

  it.each(["CONSULTANT", "SUNDRY"])("%s cannot be chosen in the column form", (kind) => {
    const dialog = functionBody(read(WORKSPACES), "export function CategoryDialog(");
    // The kind picker, not the submission-mode one with its 顾问审批 option.
    const start = dialog.indexOf('label={t("categories.kind")}');
    expect(start).toBeGreaterThan(-1);
    const picker = dialog.slice(start, dialog.indexOf("</Select>", start));
    expect(picker).not.toContain(`<SelectItem value="${kind}">`);
  });
});

describe("sundry claims are not filed under a category (2026-10 B1)", () => {
  it("has no filing button, dialog or category filter in the office", () => {
    const office = read(SUNDRY_OFFICE);
    for (const gone of [
      /setFiling/,
      /<FileIntoColumnDialog/,
      /fileSundryClaim/,
      /<ColumnFilter/,
      /"uncategorised"/,
      /filing\.unfiled/,
    ]) {
      expect(office).not.toMatch(gone);
    }
    // A claim filed before keeps its category, shown in the facts.
    expect(office).toMatch(/claim\.category_name\s*\?\s*\[\{ label: ops\("field\.category"\), value: claim\.category_name \}\]/);
  });

  it("no longer calls the filing endpoint", () => {
    expect(read("src/services/sundry-claim.service.ts")).not.toContain("file_claim");
  });

  it("has no column picker on the phone form", () => {
    const phone = read(SUNDRY_PHONE);
    expect(phone).not.toMatch(/ProjectColumnPicker|getProjectCategories|category/);
  });
});

describe("period claims are not filed under a category (D-286)", () => {
  // 「杂费报销分类和 Claim 分类重复……这里只保留一套」: the set, the button
  // and the filter all went, and the backend endpoint with them.
  it("has no filing button, dialog or category filter", () => {
    const source = read(CLAIMS);
    for (const gone of [
      /setFiling/,
      /<FileIntoColumnDialog/,
      /fileClaim/,
      /ClaimColumnFilter/,
      /kind: "CLAIM"/,
      /filing\.unfiled/,
    ]) {
      expect(source).not.toMatch(gone);
    }
  });

  it("no longer calls the filing endpoint", () => {
    expect(read("src/services/contractor-ops.service.ts")).not.toContain("file_claim");
  });
});
