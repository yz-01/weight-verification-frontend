/**
 * JB294 on 设备操作员工时 › 按月, the 租赁金额 cell:
 *
 * - 【取消确认】 (Lucas 11-27, the client asked how to undo a confirmed month):
 *   only for someone who may confirm, greyed out with the statement number when
 *   the month is in a 设备租赁月结单; its window asks for a reason, then the PIN;
 *   the server's refusal is shown in its words.
 * - 「这里难看啊，弄好看弄整齐」: the cell stays short - the badge, one
 *   「name · time」 line, 「本月分 2 段计算」 with 【看分段】 - and 【看分段】 opens a
 *   small table (期间, 租赁方式 · 单价, 超时单价, 天数, 基本租金, 合计).
 * - Two periods with the same priced terms are one period, not a price change.
 *
 * Rendered to static markup (the dialogs inline).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { EquipmentHoursMonthRow, RentalTermsValues } from "@/interfaces/equipment-hours";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u1", company_preferences: { date_format: "DD/MM/YYYY", time_format: "24H" } },
    can: () => true,
  }),
}));

const { RentalFeeCells, RentalPiecesDialog, UnconfirmRentalMonthDialog, displayPieces, monthPieces } = await import(
  "@/components/equipment-hours/rental-fees"
);
const { TooltipProvider } = await import("@/components/ui/tooltip");
const { Table, TableBody, TableRow } = await import("@/components/ui/table");

const words = zh.jb294;

function render(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function text(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

const TERMS: RentalTermsValues = {
  id: "t1",
  method: "MONTHLY",
  unit_price: "14000.00",
  standard_days: null,
  normal_hours_per_day: "8.00",
  overtime_rate: "100.96",
  extra_day_rate: null,
  stoppage_terms: "",
  start_date: "2026-01-01",
  end_date: "",
  diesel_supply: "INCLUDED",
  remarks: "",
};

function piecesTerms(second: Partial<RentalTermsValues>, rents = ["12133.33", "1866.67"]): RentalTermsValues {
  return {
    ...TERMS,
    ...second,
    pieces: [
      { from: "2026-11-01", to: "2026-11-26", terms: TERMS, base_rent: rents[0], days_worked: 4 },
      { from: "2026-11-27", to: "2026-11-30", terms: { ...TERMS, id: "t2", ...second }, base_rent: rents[1], days_worked: 1 },
    ],
  };
}

function row(extra: Partial<EquipmentHoursMonthRow> = {}): EquipmentHoursMonthRow {
  return {
    equipment: "m2",
    equipment_name: "Crane 50T",
    equipment_code: "EQ0002",
    plate: "",
    supplier_name: "HH machinery sb",
    project: "p1",
    project_name: "PUTRA_MAS",
    days_worked: 5,
    session_count: 6,
    total_hours: "2.06",
    incomplete_count: 0,
    adjusted_count: 1,
    base_rent: "14000.00",
    overtime_fee: "0.00",
    diesel_fee: "0.00",
    adjustment_amount: "0.00",
    rental_total: "14000.00",
    rental_has_terms: true,
    rental_terms: TERMS,
    rental_confirmed: true,
    rental_confirmed_at: "2026-11-27T22:40:00+08:00",
    rental_confirmed_by: "mike",
    ...extra,
  };
}

function cells(value: EquipmentHoursMonthRow, canAdjust = true) {
  return render(
    <Table>
      <TableBody>
        <TableRow>
          <RentalFeeCells row={value} canAdjust={canAdjust} onAmounts={() => undefined} month="2026-11" />
        </TableRow>
      </TableBody>
    </Table>,
  );
}

function button(html: string, testId: string) {
  const match = html.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`));
  return match ? match[0] : null;
}

describe("【取消确认】", () => {
  it("shows next to the confirmed badge for someone who may confirm", () => {
    const html = cells(row());
    expect(text(html)).toContain(zh.equipmentRental.confirmed);
    expect(text(html)).toContain("mike · 27/11/2026 22:40");
    const open = button(html, "rental-unconfirm-open");
    expect(open).not.toBeNull();
    expect(open).not.toMatch(/ disabled=""/);
    expect(html).toContain(`>${words.unconfirm.open}<`);
  });

  it("is not there without the right to confirm, nor on an unconfirmed month", () => {
    expect(button(cells(row(), false), "rental-unconfirm-open")).toBeNull();
    expect(button(cells(row({ rental_confirmed: false })), "rental-unconfirm-open")).toBeNull();
  });

  it("is greyed out with the statement number when the month is in a 月结单", () => {
    const html = cells(row({ statements: [{ id: "s1", statement_no: "EQ-MS003", state: "PENDING" }] }));
    expect(button(html, "rental-unconfirm-open")).toMatch(/ disabled=""/);
    // The reason the button is greyed out (its tooltip / title).
    expect(html).toContain(words.unconfirm.inStatement.replace("{statement_no}", "EQ-MS003"));
    // A cancelled statement no longer holds it.
    const freed = cells(row({ statements: [{ id: "s1", statement_no: "EQ-MS003", state: "CANCELLED" }] }));
    expect(button(freed, "rental-unconfirm-open")).not.toMatch(/ disabled=""/);
  });

  it("the window asks for a reason, says the PIN comes next, and cannot go without the reason", () => {
    const html = render(<UnconfirmRentalMonthDialog row={row()} month="2026-11" onClose={() => undefined} />);
    expect(text(html)).toContain(words.unconfirm.title.replace("{name}", "EQ0002 · Crane 50T").replace("{month}", "2026-11"));
    expect(html).toContain('data-testid="rental-unconfirm-reason"');
    expect(text(html)).toContain(words.unconfirm.reason);
    expect(text(html)).toContain(words.unconfirm.pin);
    // Greyed out until a reason is written, and says so.
    expect(html).toContain(words.unconfirm.needReason);
    const doButtons = html.match(/<button[^>]*>(?:(?!<\/button>).)*取消确认(?:(?!<\/button>).)*<\/button>/g) ?? [];
    expect(doButtons.some((tag) => / disabled=""/.test(tag))).toBe(true);
  });

  it("shows the server's refusal: the error words name the statement, in four languages", () => {
    for (const catalogue of [zh, zhTW, en, ms]) {
      const api = catalogue.errors.api as Record<string, string>;
      expect(api.equipment_rental_month_in_statement).toContain("{statement_no}");
      expect(api.equipment_rental_month_not_confirmed).toBeTruthy();
    }
    const source = readFileSync(path.join(process.cwd(), "src/components/equipment-hours/rental-fees.tsx"), "utf8");
    expect(source).toContain('data-testid="rental-unconfirm-error"');
    expect(source).toContain("unconfirmRentalMonth({ project: row.project, equipment: row.equipment, month, reason: reason.trim() })");
    const service = readFileSync(path.join(process.cwd(), "src/services/equipment-rental.service.ts"), "utf8");
    expect(service).toContain('"/api/equipment-rental/unconfirm_month/"');
  });
});

describe("the 租赁金额 cell with parts", () => {
  it("stays short: one line and 【看分段】, not the long run of text", () => {
    const html = cells(row({ rental_terms: piecesTerms({ unit_price: "15000.00" }) }));
    expect(text(html)).toContain(words.pieces.count.replace("{count}", "2"));
    expect(button(html, "rental-pieces-open")).not.toBeNull();
    expect(text(html)).not.toContain("本月改过价");
    expect(text(html)).not.toContain("2026-11-01 至 2026-11-26");
  });

  it("【看分段】 is a neat table with a 合计 equal to the cell's 基本租金", () => {
    const value = row({
      base_rent: "14133.33",
      rental_terms: piecesTerms({ unit_price: "15000.00" }, ["12133.33", "2000.00"]),
    });
    const html = render(<RentalPiecesDialog row={value} month="2026-11" onClose={() => undefined} />);
    const plain = text(html);
    for (const head of [words.pieces.period, words.pieces.method, words.pieces.overtime, words.pieces.days, words.pieces.rent, words.pieces.total]) {
      expect(plain).toContain(head);
    }
    expect(plain).toContain("01/11/2026 – 26/11/2026");
    expect(plain).toContain("27/11/2026 – 30/11/2026");
    expect(plain).toContain("按月 RM 14,000.00");
    expect(plain).toContain("按月 RM 15,000.00");
    expect(plain).toContain("RM 100.96/小时");
    expect(plain).toContain("12,133.33");
    expect(plain).toContain("2,000.00");
    expect(html.match(/data-slot="rental-piece-row"/g)?.length).toBe(2);
    expect(html).toMatch(/data-slot="rental-piece-total"[^>]*>14,133.33</);
    // 天数: the days of each part inside the rental period.
    expect(html).toMatch(/>26<\/td>/);
    expect(html).toMatch(/>4<\/td>/);
    expect(plain).toContain(words.pieces.close);
  });

  it("two parts with the same priced terms are one period - no 「分段」", () => {
    const same = row({ rental_terms: piecesTerms({ remarks: "only the note changed" }) });
    expect(monthPieces(same)).toBeNull();
    const html = cells(same);
    expect(text(html)).not.toContain(words.pieces.count.replace("{count}", "2"));
    expect(button(html, "rental-pieces-open")).toBeNull();
    const merged = displayPieces(piecesTerms({ remarks: "x" }).pieces);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ from: "2026-11-01", to: "2026-11-30", base_rent: "14000.00", days_worked: 5 });
  });
});

describe("words", () => {
  it("every jb294 word is in the four catalogues, and none says 您", () => {
    const keys = (value: object, prefix = ""): string[] =>
      Object.entries(value).flatMap(([key, inner]) =>
        typeof inner === "object" && inner ? keys(inner, `${prefix}${key}.`) : [`${prefix}${key}`],
      );
    const wanted = keys(zh.jb294).sort();
    for (const catalogue of [zhTW, en, ms]) {
      expect(keys(catalogue.jb294).sort()).toEqual(wanted);
    }
    for (const catalogue of [zh, zhTW]) {
      expect(JSON.stringify(catalogue.jb294)).not.toContain("您");
    }
  });
});
