/**
 * JB257 (客户 11-24b 事项 4): 报表中心 「设备进退场报表」 → 「设备租赁费用报表」.
 *
 * - the report keeps its in / out records and adds the machine table: terms,
 *   进场 / 退场 dates, days on site, normal and overtime hours, the five
 *   amounts and the 累计总金额;
 * - 预览 · 打印 · 导出 offer 「包含照片 / 不包含照片」 and send the table's words;
 * - the menu and the title say 设备租赁费用报表 in the four languages.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { NextIntlClientProvider, useTranslations } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { RentalReport } from "@/interfaces/contractor-report";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "user-1" }, can: () => true }),
}));

const { RentalFeeTable, rentalLabels } = await import("@/components/reports/rental-fee-table");

const RENTAL: RentalReport = {
  rows: [
    {
      equipment_id: "m1",
      equipment: "EQ0008 - excavator",
      site_no: "8",
      supplier_name: "best concrete supply",
      rental_method: "MONTHLY",
      rental_terms: {
        method: "MONTHLY",
        unit_price: "9000.00",
        standard_days: null,
        normal_hours_per_day: "",
        overtime_rate: null,
        extra_day_rate: null,
        stoppage_terms: "",
        start_date: "2026-09-01",
        end_date: "",
        diesel_supply: "SUPPLIER_CHARGED",
        remarks: "",
      },
      entry_date: "2026-09-10",
      exit_date: "",
      days_on_site: 21,
      days_worked: 18,
      normal_hours: "140.00",
      overtime_hours: "6.00",
      base_rent: "9000.00",
      overtime_fee: "0.00",
      diesel_fee: "600.00",
      adjustment_amount: "-100.00",
      rental_total: "9500.00",
      confirmed_months: ["2026-09"],
    },
  ],
  totals: {
    days_worked: 18,
    normal_hours: "140.00",
    overtime_hours: "6.00",
    base_rent: "9000.00",
    overtime_fee: "0.00",
    diesel_fee: "600.00",
    adjustment_amount: "-100.00",
    rental_total: "9500.00",
  },
};

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
      {node}
    </NextIntlClientProvider>,
  );
}

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("设备租赁费用报表", () => {
  it("shows each machine's terms, in / out, days, hours, amounts and the grand total", () => {
    const html = render(<RentalFeeTable rental={RENTAL} />);
    for (const text of [
      "EQ0008 - excavator",
      "best concrete supply",
      "按月 · 单价 RM 9,000.00",
      "供应商提供柴油另外收费",
      "21",
      "140.00",
      "6.00",
      "9,000.00",
      "600.00",
      "-100.00",
      "累计总金额",
      "RM 9,500.00",
      "已确认：2026-09",
      zh.jb257.onSite,
    ]) {
      expect(html).toContain(text);
    }
    for (const heading of Object.values(zh.jb257.column)) expect(html).toContain(heading);
  });

  it("the page puts the table above the records and offers the photo choice", () => {
    const page = read("src/components/contractor-ops/contractor-report-workspace.tsx");
    expect(page).toContain("<RentalFeeTable rental={report.data.rental} />");
    expect(page.indexOf("<RentalFeeTable")).toBeLessThan(page.indexOf('t("preview")'));
    expect(page).toContain("photoChoice={rentalReport}");
    expect(page).toContain("include_photos: false");
    expect(page).toContain("rental_labels: rentalLabels(tRentalReport, tRental)");
  });

  it("sends the file the same words as the screen", () => {
    const labels = render(<Labels />);
    expect(labels).toContain("累计总金额");
    expect(labels).toContain("租赁总金额（RM）");
    expect(labels).toContain("供应商提供柴油另外收费");
  });

  it("is named 设备租赁费用报表 in the menu and the title, in four languages", () => {
    expect(zh.contractorReports.type.equipment).toBe("设备租赁费用报表");
    expect(zh.nav.submodule.equipmentRentalReport).toBe("设备租赁费用报表");
    expect(read("src/lib/navigation.ts")).toMatch(/"nav\.submodule\.equipmentRentalReport",\s*"\/reports\/contractor\/equipment"/);
    const keys = (value: unknown, prefix = ""): string[] =>
      typeof value === "object" && value !== null
        ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix];
    for (const catalogue of [zhTW, en, ms]) {
      expect(keys(catalogue.jb257).sort()).toEqual(keys(zh.jb257).sort());
      expect(catalogue.nav.submodule.equipmentRentalReport).toBeTruthy();
      expect(catalogue.jb256.withoutPhotos).toBeTruthy();
    }
  });
});

function Labels() {
  const labels = rentalLabels(useTranslations("jb257"), useTranslations("equipmentRental"));
  return <pre>{JSON.stringify(labels)}</pre>;
}
