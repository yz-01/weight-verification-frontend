/**
 * Category Management after 2026-09-26 (D-281, D-285).
 *
 * * a material category shows what it received per unit - concrete in cubic
 *   metres read 0.000 when only tonnes were counted (F-481) - and its records
 *   open grouped by material, each with its own total;
 * * 现场资料分类 is gone from the phone and the office: no 「现场资料」 tile, and
 *   an office 「拍照」 or 「其他」 task asks for no category.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { TASK_CATEGORY_KIND } from "@/components/contractor-ops/operations-workspaces";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const MANAGEMENT = "src/components/contractor-ops/category-management.tsx";

describe("a material category adds up per unit (D-281)", () => {
  const source = read(MANAGEMENT);

  it("shows the per-unit quantities, not tonnes only", () => {
    expect(source).toMatch(/<QuantityCell quantities=\{row\.column\.quantities \?\? \[\]\} \/>/);
    expect(source).not.toMatch(/tonnes_received \?\? "0"/);
    // Units are named in the reader's language, and a return is its own figure.
    expect(source).toMatch(/root\(`receipts\.unit\.\$\{unit\}`\)/);
    expect(source).toMatch(/quantityReturned/);
  });

  it("opens its records grouped by material, each with its own count and total", () => {
    expect(source).toMatch(/const groups = records\.data\?\.groups \?\? \[\];/);
    expect(source).toMatch(/t\("records\.byMaterial"\)/);
    expect(source).toMatch(/t\("records\.groupCount", \{ count: group\.deliveries \}\)/);
    expect(read("src/interfaces/contractor-ops.ts")).toMatch(/groups\?: MaterialGroup\[\];/);
  });

  it.each(["en", "zh", "zh-TW", "ms"])("is worded in %s", (locale) => {
    const messages = JSON.parse(read(`src/messages/${locale}.json`));
    const cm = messages.categoryManagement;
    for (const value of [cm.column.quantity, cm.quantityReturned, cm.records.byMaterial, cm.records.groupCount]) {
      expect(typeof value, locale).toBe("string");
    }
  });
});

describe("现场资料分类 is gone (D-285)", () => {
  it("leaves no 「现场资料」 tile on the phone", () => {
    const panel = read("src/components/field-staff/field-records-panel.tsx");
    expect(panel).not.toMatch(/key: "category"/);
    expect(panel).not.toMatch(/CategoryEvidenceCapture/);
    expect(existsSync(path.join(process.cwd(), "src/components/field-staff/category-evidence-capture.tsx"))).toBe(false);
  });

  it("asks an office photo or other task for no category", () => {
    expect(TASK_CATEGORY_KIND.PHOTO).toBeUndefined();
    expect(TASK_CATEGORY_KIND.OTHER).toBeUndefined();
    expect(TASK_CATEGORY_KIND.MATERIAL).toBe("MATERIAL");
    expect(TASK_CATEGORY_KIND.SAFETY).toBe("EHS");
    const workspaces = read("src/components/contractor-ops/operations-workspaces.tsx");
    expect(workspaces).toMatch(/\[!categoryKind \|\| form\.category, t\("field\.category"\)\]/);
    expect(workspaces).not.toMatch(/PHOTO: "FIELD"/);
  });

  it("still delivers a photo already waiting in a phone's offline queue", () => {
    // A 现场资料 upload queued before the change is replayed, not dropped.
    expect(read("src/services/offline-sync.service.ts")).toMatch(/job\.kind === "CATEGORY_EVIDENCE"/);
  });
});
