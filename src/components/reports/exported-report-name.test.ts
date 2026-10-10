/**
 * The MSE Admin report centre's 导出历史 lists every export on the platform, so
 * a row may be a contractor's or a recycler's report. Each is named from its
 * own centre's catalogue; nothing ever shows a raw message key, and a type no
 * catalogue knows reads 「其他报表」.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { exportedReportName } from "@/components/reports/exported-report-name";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

type Translator = Parameters<typeof exportedReportName>[0];

const CATALOGUES = { zh, "zh-TW": zhTW, en, ms } as const;

function translator(locale: keyof typeof CATALOGUES): Translator {
  return createTranslator({ locale, messages: CATALOGUES[locale] }) as unknown as Translator;
}

const PLATFORM = Object.keys(zh.adminReports.reportType);
const CONTRACTOR = Object.keys(zh.contractorReports.type);
const RECYCLER = Object.keys(zh.recyclerReports.type);

describe("exportedReportName", () => {
  it("names every kind of export the platform history can hold", () => {
    const t = translator("zh");
    expect(exportedReportName(t, "contractors")).toBe("建筑商报表");
    expect(exportedReportName(t, "progress")).toBe("建筑商 · 进度与照片报表");
    expect(exportedReportName(t, "dashboard")).toBe("建筑商 · 现场看板");
    expect(exportedReportName(t, "inventory")).toBe("回收商 · 库存");
    // A platform report and a recycler report share this type; the platform's
    // name, which is also what the recycler's report is about.
    expect(exportedReportName(t, "commission")).toBe("平台佣金报表");
  });

  it("calls a type no catalogue knows 「其他报表」", () => {
    const t = translator("zh");
    for (const unknown of ["mystery", "", "type", "export.title"]) {
      expect(exportedReportName(t, unknown)).toBe("其他报表");
    }
    expect(exportedReportName(translator("en"), "mystery")).toBe("Other report");
  });

  it("never shows a raw message key, in any language", () => {
    for (const locale of Object.keys(CATALOGUES) as (keyof typeof CATALOGUES)[]) {
      const t = translator(locale);
      for (const type of [...PLATFORM, ...CONTRACTOR, ...RECYCLER, "dashboard", "mystery"]) {
        const name = exportedReportName(t, type);
        expect(name, `${locale} ${type}`).toBeTruthy();
        expect(name, `${locale} ${type}`).not.toMatch(/Reports\.|reportType|\.type\.|export\.title|companies\./);
      }
    }
  });

  it("is what the admin history labels its rows with", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/reports/admin-report-workspace.tsx"),
      "utf8",
    );
    expect(source).toMatch(/exportedReportName\(root, row\.report_type\)/);
    expect(source).not.toMatch(/t\(`reportType\.\$\{row\.report_type\}`\)/);
  });
});
