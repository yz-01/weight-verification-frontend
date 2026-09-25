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

describe("consultant submissions file under their own columns (D-274)", () => {
  it("asks the phone for CONSULTANT columns, not the site-record ones", () => {
    const panel = functionBody(read(PHONE), "function ConsultantCapturePanel(");
    expect(panel).toMatch(/<ProjectColumnPicker[^>]*kind="CONSULTANT"/);
    expect(panel).not.toMatch(/kind="FIELD"/);
  });
});

describe("three more modules on Category Management", () => {
  const modules: Array<[string, string, string]> = [
    ["consultant", "CONSULTANT", "顾问资料分类"],
    ["sundry", "SUNDRY", "杂费报销分类"],
    ["claim", "CLAIM", "Claim 分类"],
  ];

  it.each(modules)(
    "%s is a column module, so it creates, edits, reorders and deletes in place",
    (key, kind) => {
      // `columnModule` gives the shared column dialog, `deleteProjectCategory`
      // and the reorder - the same as the other column modules.
      expect(read(MANAGEMENT)).toContain(`columnModule("${key}", "${kind}")`);
      expect(KIND_MODULE[kind]).toBe(key);
    },
  );

  it.each(modules)(
    "%s can be chosen in the column form, under the module's own name",
    (key, kind) => {
      const dialog = functionBody(read(WORKSPACES), "export function CategoryDialog(");
      expect(dialog).toMatch(
        new RegExp(`<SelectItem value="${kind}">\\s*\\{modules\\("module\\.${key}"\\)\\}`),
      );
    },
  );

  it.each(modules)("%s is named, explained and sourced in all four languages", (key, _kind, zhName) => {
    for (const locale of ["en", "zh", "zh-TW", "ms"]) {
      const messages = JSON.parse(read(`src/messages/${locale}.json`));
      const cm = messages.categoryManagement;
      expect(cm.module[key], `${locale} module.${key}`).toBeTruthy();
      expect(cm.moduleHelp[key], `${locale} moduleHelp.${key}`).toBeTruthy();
      expect(cm.moduleSource[key], `${locale} moduleSource.${key}`).toBeTruthy();
    }
    const zh = JSON.parse(read("src/messages/zh.json"));
    expect(zh.categoryManagement.module[key]).toBe(zhName);
  });
});

describe("sundry claims are filed in the office, never on the phone (D-275)", () => {
  it("offers 【归入栏目】 in the detail to the reviewer, on SUNDRY columns", () => {
    const detail = functionBody(read(SUNDRY_OFFICE), "function SundryClaimDetail(");
    expect(detail).toMatch(/can\("sundry_claim\.review"\) && \(\s*<Button[^>]*onClick=\{\(\) => setFiling\(true\)\}/);
    expect(detail).toMatch(/\{ops\("filing\.title"\)\}/);
    expect(detail).toMatch(/<FileIntoColumnDialog[\s\S]*?kind="SUNDRY"[\s\S]*?fileSundryClaim\(claim\.id, \{ category, reason: why \}\)/);
    // The facts say where it is, or 未归类.
    expect(detail).toMatch(/claim\.category_name \|\| ops\("filing\.unfiled"\)/);
  });

  it("filters the list by SUNDRY column, 未归类 included", () => {
    const office = read(SUNDRY_OFFICE);
    expect(office).toMatch(/useListQuery\(\[[^\]]*"category", "uncategorised"\]\)/);
    expect(office).toContain('<ColumnFilter list={list} kind="SUNDRY" />');
  });

  it("posts to the filing endpoint", () => {
    expect(read("src/services/sundry-claim.service.ts")).toContain(
      "`/api/sundry-claims/${id}/file_claim/`",
    );
  });

  it("has no column picker on the phone form", () => {
    const phone = read(SUNDRY_PHONE);
    expect(phone).not.toMatch(/ProjectColumnPicker|getProjectCategories|category/);
  });
});

describe("period claims are filed in the office (D-275)", () => {
  it("offers 【归入栏目】 in the claim sheet to claim.manage, on CLAIM columns", () => {
    const sheet = functionBody(read(CLAIMS), "function ClaimSheet(");
    expect(sheet).toMatch(/can\("claim\.manage"\) && \(\s*<Button[^>]*onClick=\{\(\) => setFiling\(true\)\}/);
    expect(sheet).toMatch(/<FileIntoColumnDialog[\s\S]*?kind="CLAIM"[\s\S]*?fileClaim\(data\.id, \{ category, reason \}\)/);
    expect(sheet).toMatch(/data\.category_name \|\| ops\("filing\.unfiled"\)/);
  });

  it("filters the list by CLAIM column, 未归类 included", () => {
    const source = read(CLAIMS);
    const list = functionBody(source, "export function ClaimEngineWorkspace(");
    expect(list).toMatch(/<ClaimColumnFilter/);
    expect(list).toMatch(/uncategorised: column === UNFILED \? "true" : undefined/);
    const filter = functionBody(source, "function ClaimColumnFilter(");
    expect(filter).toMatch(/kind: "CLAIM"/);
    expect(filter).toMatch(/<SelectItem value=\{UNFILED\}>/);
    expect(filter).toMatch(/<QueryFailedNote query=\{columns\}/);
  });

  it("posts to the filing endpoint", () => {
    expect(read("src/services/contractor-ops.service.ts")).toContain(
      "`/api/claims/${id}/file_claim/`",
    );
  });
});
