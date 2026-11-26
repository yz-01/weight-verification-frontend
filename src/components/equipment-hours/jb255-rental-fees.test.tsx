/**
 * JB255 (客户 11-24b 事项 2): 设备租赁设定 and the 按月 page's five amounts.
 *
 * - 【设备租赁设定】 sits beside 【设备绑定司机】; its list shows supplier,
 *   equipment number and name, each with 【租赁条件】, machines without terms
 *   first and counted;
 * - the terms form has every condition the client listed;
 * - the 按月 table has 基本租金 / 超时费用 / 柴油费用 / 调整金额 / 租赁总金额
 *   right of 「后台修改次数」, the month's 合计 under them, and a confirmed
 *   month says who confirmed it instead of offering a change;
 * - every word is in the four catalogues.
 *
 * Rendered to static markup with the server's answers in the cache.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { EquipmentHoursMonthRow, RentalMachines } from "@/interfaces/equipment-hours";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "user-1" }, can: () => true }),
}));

const { RentalTermsBody, RentalFeeCells, RentalFeeHeads, RentalTotalCells, rowsToConfirm, draftOf, FEE_KEYS } =
  await import("@/components/equipment-hours/rental-fees");
const { TooltipProvider } = await import("@/components/ui/tooltip");
const { Table, TableBody, TableHeader, TableRow } = await import("@/components/ui/table");

const words = zh.equipmentRental;

function render(node: React.ReactNode, cache: [readonly unknown[], unknown][] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [key, value] of cache) client.setQueryData(key, value);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const TERMS = {
  id: "t1",
  method: "MONTHLY" as const,
  unit_price: "18000.00",
  standard_days: 26,
  normal_hours_per_day: "8.00",
  overtime_rate: "120.00",
  extra_day_rate: "700.00",
  stoppage_terms: "",
  start_date: "2026-09-01",
  end_date: "",
  diesel_supply: "SUPPLIER_CHARGED" as const,
  remarks: "",
  changed_at: "2026-11-24T08:00:00+08:00",
  changed_by: "pm",
};

const LIST: RentalMachines = {
  without_terms: 1,
  machines: [
    { id: "m2", number: "2", name: "Crane 50T", plate: "", supplier_name: "HH machinery sb", terms: null, history: [] },
    { id: "m1", number: "1", name: "挖土机", plate: "", supplier_name: "best concrete supply", terms: TERMS, history: [] },
  ],
};

function monthRow(extra: Partial<EquipmentHoursMonthRow>): EquipmentHoursMonthRow {
  return {
    equipment: "m1",
    equipment_name: "挖土机",
    equipment_code: "EQ0001",
    plate: "",
    supplier_name: "best concrete supply",
    project: "p1",
    project_name: "PUTRA_MAS",
    days_worked: 22,
    session_count: 30,
    normal_hours: "160.00",
    overtime_hours: "10.00",
    total_hours: "170.00",
    incomplete_count: 0,
    adjusted_count: 0,
    base_rent: "18000.00",
    overtime_fee: "1200.00",
    diesel_fee: "850.00",
    adjustment_amount: "-500.00",
    rental_total: "19550.00",
    rental_has_terms: true,
    rental_terms: TERMS,
    rental_confirmed: false,
    ...extra,
  };
}

describe("设备租赁设定 dialog", () => {
  it("lists supplier, number and name with 租赁条件, machines without terms first and counted", () => {
    const html = render(<RentalTermsBody project="p1" />, [[["equipment-rental", "p1"], LIST]]);
    expect(html).toContain("HH machinery sb · 2 号 · Crane 50T");
    expect(html).toContain("best concrete supply · 1 号 · 挖土机");
    expect(html.indexOf("Crane 50T")).toBeLessThan(html.indexOf("挖土机"));
    expect(html).toContain(words.noTerms);
    expect(html).toContain(words.withoutTerms.replace("{count}", "1"));
    expect(html.split(`>${words.open}<`).length - 1).toBeGreaterThanOrEqual(2);
    // The machine's terms in one line.
    expect(html).toContain("按月 · 单价 RM 18,000.00 · 超时 RM 120.00/小时 · 每月标准 26 天 · 每天正常 8 小时 · 供应商提供柴油另外收费 · 2026-09-01 起");
  });

  it("asks for a project first", () => {
    expect(render(<RentalTermsBody project="" />)).toContain(words.chooseProject);
  });

  it("the form keeps every condition the client listed", () => {
    const source = readFileSync(path.join(__dirname, "rental-fees.tsx"), "utf8");
    for (const key of ["method", "standardDays", "normalHours", "overtimeRate", "extraDayRate", "startDate", "endDate", "diesel", "stoppage", "remarks"]) {
      expect(source).toContain(`t("field.${key}")`);
    }
    expect(source).toContain("t(`field.unitPrice.${draft.method}`)");
    expect(Object.values(words.method)).toEqual(["按小时", "按天", "按月", "按年", "固定金额"]);
    expect(Object.values(words.diesel)).toEqual(["租金包含柴油", "建筑商自行提供柴油", "供应商提供柴油另外收费"]);
    expect(draftOf(null).diesel_supply).toBe("INCLUDED");
    expect(draftOf(TERMS).unit_price).toBe("18000.00");
  });

  it("sits beside 设备绑定司机 on the page", () => {
    const page = readFileSync(path.join(__dirname, "equipment-operator-hours.tsx"), "utf8");
    const binding = page.indexOf('tRoot("driverBinding.open")');
    const rental = page.indexOf('tRoot("equipmentRental.title")');
    expect(binding).toBeGreaterThan(0);
    expect(rental).toBeGreaterThan(binding);
    expect(rental - binding).toBeLessThan(600);
  });
});

describe("按月 table", () => {
  it("has the five amounts right of 后台修改次数, then the month's total", () => {
    const heads = render(
      <Table>
        <TableHeader>
          <TableRow>
            <RentalFeeHeads />
          </TableRow>
        </TableHeader>
      </Table>,
    );
    const order = ["基本租金（RM）", "超时费用（RM）", "柴油费用（RM）", "调整金额（RM）", "租赁总金额（RM）"];
    let last = -1;
    for (const label of order) {
      const at = heads.indexOf(label);
      expect(at).toBeGreaterThan(last);
      last = at;
    }
    expect(FEE_KEYS).toEqual(["base_rent", "overtime_fee", "diesel_fee", "adjustment_amount", "rental_total"]);
    const page = readFileSync(path.join(__dirname, "equipment-operator-hours.tsx"), "utf8");
    expect(page.indexOf("<RentalFeeHeads />")).toBeGreaterThan(page.indexOf('t("field.adjustedCount")}</TableHead>'));
    expect(page).toContain("<RentalTotalCells totals={monthly.data?.rental_totals} />");
    expect(page).toContain("...rentalExportColumns(tRental)");

    const total = render(
      <Table>
        <TableBody>
          <TableRow>
            <RentalTotalCells
              totals={{ base_rent: "27000.00", overtime_fee: "1200.00", diesel_fee: "850.00", adjustment_amount: "-500.00", rental_total: "28550.00" }}
            />
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(total).toContain("28,550.00");
    expect(total).toContain("-500.00");
  });

  it("an open month offers 柴油 / 调整; a confirmed one says who confirmed it", () => {
    const cells = (row: EquipmentHoursMonthRow) =>
      render(
        <Table>
          <TableBody>
            <TableRow>
              <RentalFeeCells row={row} canAdjust onAmounts={() => undefined} />
            </TableRow>
          </TableBody>
        </Table>,
      );
    const open = cells(monthRow({}));
    expect(open).toContain("19,550.00");
    expect(open).toContain(words.amounts.open);
    const done = cells(monthRow({ rental_confirmed: true, rental_confirmed_by: "pm", rental_confirmed_at: "2026-10-01T09:00:00+08:00" }));
    expect(done).toContain(words.confirmed);
    expect(done).not.toContain(words.amounts.open);
    const none = cells(monthRow({ rental_has_terms: false, rental_terms: {} }));
    expect(none).toContain(words.noTermsShort);
    // 金额查看 off: the server sends null, the screen shows 「—」.
    expect(cells(monthRow({ rental_total: null }))).toContain("—");
  });

  it("确认本月金额 takes the rows with terms not confirmed yet", () => {
    const rows = [monthRow({}), monthRow({ equipment: "m2", rental_confirmed: true }), monthRow({ equipment: "m3", rental_has_terms: false })];
    expect(rowsToConfirm(rows).map((row) => row.equipment)).toEqual(["m1"]);
  });
});

describe("words", () => {
  it("every new key is in the four catalogues", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      typeof value === "object" && value !== null
        ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix];
    const expected = keys(zh.equipmentRental).sort();
    for (const catalogue of [zhTW, en, ms]) {
      expect(keys(catalogue.equipmentRental).sort()).toEqual(expected);
    }
    for (const catalogue of [zh, zhTW, en, ms]) {
      for (const code of ["equipment_rental_no_terms", "equipment_rental_diesel_not_charged", "equipment_rental_month_confirmed", "equipment_rental_month_not_started"]) {
        expect(catalogue.errors.api[code as keyof typeof catalogue.errors.api]).toBeTruthy();
      }
    }
    expect(JSON.stringify(zh.equipmentRental)).not.toContain("您");
  });
});
