/**
 * JB288 (客户 11-27b): 「在「设备租赁月结单」页面右上方「生成月结单」旁边设置一个
 * 「租赁费用设定」按钮。由建筑商后台根据设备及供应商填写合同约定的租赁条件及费用，
 * 只需设定一次……日后调整合同租赁费用，不得影响历史费用记录。」
 *
 * - 【租赁费用设定】 sits beside 【生成月结单】 on 设备租赁月结单, office only, and
 *   opens the same 设备租赁设定 window (no second form) for the top bar's
 *   project - on 全部项目 it asks for a project first;
 * - the form asks for 生效日期 with the plain help line; the first terms take
 *   the 租赁开始日期, a change today;
 * - 修改记录 shows each change as 旧 → 新 with who, when and 生效日期;
 * - a month or statement priced with two sets of terms shows each with its days;
 * - every word is in the four catalogues, and the screen speaks 你.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { EquipmentHoursMonthRow, RentalMachines, RentalTermsValues } from "@/interfaces/equipment-hours";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
const auth = vi.hoisted(() => ({ amounts: true }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Site Office", account_type: "TENANT", company_type: "CONTRACTOR", is_field_staff: false },
    can: (code: string) => code !== "finance.view_amounts" || auth.amounts,
  }),
}));

const {
  inForce,
  upcoming,
  RentalTermsBody,
  RentalTermsDialog,
  RentalFeeCells,
  changedParts,
  draftOf,
  effectiveOf,
  pieceSummary,
  termsChanges,
  termsSummary,
} = await import("@/components/equipment-hours/rental-fees");
const { StatementLines } = await import("@/components/equipment-hours/rental-statements");
const { TooltipProvider } = await import("@/components/ui/tooltip");
const { Table, TableBody, TableRow } = await import("@/components/ui/table");

const words = zh.jb288;
const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

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

const OLD: RentalTermsValues = {
  id: "t1",
  method: "MONTHLY",
  unit_price: "18000.00",
  standard_days: null,
  normal_hours_per_day: "",
  overtime_rate: null,
  extra_day_rate: null,
  stoppage_terms: "",
  start_date: "2026-09-01",
  end_date: "",
  diesel_supply: "INCLUDED",
  remarks: "",
  effective_from: "2026-09-01",
  changed_at: "2026-09-01T08:00:00+08:00",
  changed_by: "pm",
};
const NEW: RentalTermsValues = {
  ...OLD,
  id: "t2",
  unit_price: "24000.00",
  effective_from: "2026-10-01",
  changed_at: "2026-09-28T10:00:00+08:00",
  changed_by: "boss",
};

const LIST: RentalMachines = {
  without_terms: 0,
  machines: [{ id: "m1", number: "1", name: "挖土机", plate: "", supplier_name: "HH machinery sb", terms: NEW, history: [OLD] }],
};

describe("【租赁费用设定】 on 设备租赁月结单", () => {
  it("sits right beside 生成月结单, office only, and opens the same 设备租赁设定 window", () => {
    const page = read("src/components/equipment-hours/rental-statements.tsx");
    // The page's header row (the last one: the first is the 「看不到」 notice's).
    const button = page.lastIndexOf("<RentalTermsButton />");
    const generate = page.indexOf("<GenerateStatementButton");
    expect(button).toBeGreaterThan(0);
    expect(generate - button).toBeGreaterThan(0);
    expect(generate - button).toBeLessThan(80);
    // Office only, like 生成月结单; the same dialog (no second form).
    const fn = page.slice(page.indexOf("export function RentalTermsButton"), page.indexOf("function GenerateStatementButton"));
    expect(fn).toContain("officeMay(user, can, RENTAL_PERMISSION)");
    expect(fn).toContain("<RentalTermsDialog");
    expect(fn).toContain("current.active ? current.projectId");
    expect(fn).toContain("pickProject");
    expect(page).not.toContain("RentalTermsForm");
    expect(words.termsButton).toBe("租赁费用设定");
  });

  it("on 全部项目 asks for a project first; with a project it lists every machine with its supplier", () => {
    const all = text(render(<RentalTermsDialog project="" title={words.termsButton} pickProject onClose={() => undefined} />));
    expect(all).toContain(words.termsButton);
    expect(all).toContain(words.chooseProjectHelp);
    const one = text(
      render(<RentalTermsDialog project="p1" title={words.termsButton} pickProject onClose={() => undefined} />, [
        [["equipment-rental", "p1"], LIST],
      ]),
    );
    expect(one).toContain("HH machinery sb · 1 号 · 挖土机");
    expect(one).toContain("生效日期 2026-10-01");
    expect(one).not.toContain(words.chooseProjectHelp);
  });
});

describe("生效日期", () => {
  it("the form asks for it with the plain help line", () => {
    const source = read("src/components/equipment-hours/rental-fees.tsx");
    expect(source).toContain('tj("effectiveFrom")');
    expect(source).toContain('tj("effectiveHelp")');
    expect(source).toContain("effective_from: effectiveOf(draft) || null");
    expect(words.effectiveHelp).toBe("改价从生效日期开始算，以前的日子照旧。");
    // An end date before the 生效日期 says what that means.
    expect(source).toContain("draft.end_date < effectiveOf(draft)");
    expect(source).toContain('tj("endBeforeEffective")');
  });

  it("the first terms take the 租赁开始日期; a change defaults to today", () => {
    const first = draftOf(null);
    expect(first.effective_from).toBe("");
    expect(effectiveOf({ ...first, start_date: "2026-08-15" })).toBe("2026-08-15");
    const change = draftOf(NEW);
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    expect(change.effective_from).toBe(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    expect(effectiveOf({ ...change, effective_from: "2026-09-01" })).toBe("2026-09-01");
  });

  it("QA288: an emptied 生效日期 on a change stays empty - 保存 waits, it never falls back to 租赁开始日期", () => {
    const change = draftOf(NEW);
    expect(effectiveOf({ ...change, effective_from: "" })).toBe("");
    expect(effectiveOf({ ...draftOf(null), start_date: "2026-08-15", effective_from: "" })).toBe("2026-08-15");
    const source = read("src/components/equipment-hours/rental-fees.tsx");
    expect(source).toContain('tj("needEffective")');
    expect(words.needEffective).toBe("先填生效日期。");
  });

  it("修改记录 shows 旧 → 新, who, when and 生效日期", () => {
    const changes = termsChanges(LIST.machines[0]);
    expect(changes.map((change) => [change.next.id, change.previous?.id ?? null])).toEqual([
      ["t2", "t1"],
      ["t1", null],
    ]);
    const source = read("src/components/equipment-hours/rental-fees.tsx");
    expect(source).toContain('tj("oldNew", changed)');
    expect(source).toContain('tj("firstSet"');
    expect(source).toContain('tj("effectiveShort", { date: next.effective_from })');
    expect(source).toContain("next.changed_by");
  });
});

describe("QA288 B: each change keeps its own dates", () => {
  const BACK: RentalTermsValues = { ...OLD, id: "t3", unit_price: "20000.00", effective_from: "2026-08-15", changed_at: "2026-10-05T10:00:00+08:00" };
  const LATER: RentalTermsValues = { ...OLD, id: "t4", unit_price: "30000.00", effective_from: "2099-01-01", changed_at: "2026-10-06T10:00:00+08:00" };
  const machine = { ...LIST.machines[0], terms: LATER, history: [BACK, NEW, OLD], in_force_id: "t2", upcoming_ids: ["t4"] };

  it("the window shows the terms pricing today and the ones still to come, not just the newest save", () => {
    expect(inForce(machine)?.id).toBe("t2");
    expect(upcoming(machine).map((row) => row.id)).toEqual(["t4"]);
    const html = text(render(<RentalTermsBody project="p1" />, [[["equipment-rental", "p1"], { without_terms: 0, machines: [machine] }]]));
    expect(html).toContain("单价 RM 24,000.00");
    expect(html).toContain("生效日期 2026-10-01");
    expect(html).toContain("2099-01-01 起改为：按月 · 单价 RM 30,000.00");
    // 修改记录 keeps the save order (not shown until opened).
    expect(termsChanges(machine).map((change) => change.next.id)).toEqual(["t4", "t3", "t2", "t1"]);
  });

  it("without the server's word, the newest save is shown as before", () => {
    expect(inForce(LIST.machines[0])?.id).toBe("t2");
    expect(upcoming(LIST.machines[0])).toEqual([]);
  });
});

describe("QA288 rights on 设备租赁月结单 and 按月", () => {
  it("the 月结单 page says which right is missing and who switches it on, instead of 「加载失败」", () => {
    const page = read("src/components/equipment-hours/rental-statements.tsx");
    expect(page).toContain('"statementsNoManage"');
    expect(page).toContain('"statementsNoAmounts"');
    expect(page).toContain("enabled: !refused");
    expect(words.statementsNoManage).toContain("请公司管理员帮你打开");
    expect(words.statementsNoAmounts).toContain("「金额查看」");
    expect(zh.errors.api.equipment_rental_amounts_off).toContain("请公司管理员帮你打开");
  });

  it("without 金额查看 the 按月 row has no 柴油 / 调整 form, one line says why", () => {
    const row = {
      equipment: "m1",
      equipment_name: "挖土机",
      rental_has_terms: true,
      rental_confirmed: false,
      rental_total: null,
      rental_terms: NEW,
    } as unknown as EquipmentHoursMonthRow;
    const cells = (
      <Table>
        <TableBody>
          <TableRow>
            <RentalFeeCells row={row} canAdjust onAmounts={() => undefined} />
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(text(render(cells))).toContain(zh.equipmentRental.amounts.open);
    auth.amounts = false;
    try {
      const html = text(render(cells));
      expect(html).toContain(words.amountsOff);
      expect(html).not.toContain(zh.equipmentRental.amounts.open);
    } finally {
      auth.amounts = true;
    }
  });
});

describe("QA288 words for an elderly reader", () => {
  const html = (node: React.ReactNode) => text(render(node));
  function Probe({ run }: { run: (t: Parameters<typeof termsSummary>[0]) => string }) {
    const t = useTranslations("equipmentRental");
    return <span>{run(t)}</span>;
  }

  it("修改记录 names only what changed; 「条件没有改」 when only the 生效日期 moved", () => {
    const changed = (t: Parameters<typeof termsSummary>[0]) => {
      const found = changedParts(t, OLD, NEW);
      return found ? `${found.old} | ${found.new}` : "none";
    };
    expect(html(<Probe run={changed} />)).toBe("单价 RM 18,000.00 | 单价 RM 24,000.00");
    expect(html(<Probe run={(t) => String(changedParts(t, OLD, { ...OLD, id: "t3", effective_from: "2026-11-01" }))} />)).toBe("null");
    expect(words.noChange).toBe("条件没有改");
  });

  it("the terms line says 租期 for the rental dates, so it is not mixed up with 生效日期", () => {
    const line = html(<Probe run={(t) => termsSummary(t, OLD)} />);
    expect(line).toContain("租期 2026-09-01 起");
    expect(html(<Probe run={(t) => termsSummary(t, { ...OLD, end_date: "2026-12-31" })} />)).toContain("租期 2026-09-01 至 2026-12-31");
  });

  it("a part of a month reads short: method, price, overtime", () => {
    expect(html(<Probe run={(t) => pieceSummary(t, { ...OLD, overtime_rate: "120.00" })} />)).toBe(
      "按月 · 单价 RM 18,000.00 · 超时 RM 120.00/小时",
    );
    expect(html(<Probe run={(t) => pieceSummary(t, OLD)} />)).toBe("按月 · 单价 RM 18,000.00");
  });

  it("生成月结单 refused for a machine without terms says where to set them", () => {
    expect(zh.errors.api.rental_statement_no_terms).toContain("「租赁费用设定」");
    expect(zhTW.errors.api.rental_statement_no_terms).toContain("「租賃費用設定」");
  });
});

describe("two sets of terms in one month", () => {
  const PIECES = [
    { from: "2026-09-01", to: "2026-09-15", terms: OLD, base_rent: "9000.00" },
    { from: "2026-09-16", to: "2026-09-30", terms: NEW, base_rent: "12000.00" },
  ];

  it("the 按月 row shows each part with its terms", () => {
    const row = {
      equipment: "m1",
      equipment_name: "挖土机",
      rental_has_terms: true,
      rental_confirmed: true,
      rental_confirmed_by: "pm",
      rental_confirmed_at: "2026-10-02T09:00:00+08:00",
      rental_total: "21000.00",
      base_rent: "21000.00",
      rental_terms: { ...NEW, pieces: PIECES },
    } as unknown as EquipmentHoursMonthRow;
    const html = text(
      render(
        <Table>
          <TableBody>
            <TableRow>
              <RentalFeeCells row={row} canAdjust onAmounts={() => undefined} />
            </TableRow>
          </TableBody>
        </Table>,
      ),
    );
    expect(html).toContain(words.monthPieces.replace("{count}", "2"));
    expect(html).toContain("2026-09-01 至 2026-09-15：按月 · 单价 RM 18,000.00");
    expect(html).toContain("2026-09-16 至 2026-09-30：按月 · 单价 RM 24,000.00");
    expect(html).toContain("9,000.00");
  });

  it("the statement lines and the report name each set with its days", () => {
    const html = text(
      render(
        <StatementLines
          project="p1"
          totals={{ base_rent: "21000.00", overtime_fee: "0.00", diesel_fee: "0.00", adjustment_amount: "0.00", rental_total: "21000.00" }}
          lines={[
            {
              equipment: "m1",
              equipment_no: "1",
              equipment_code: "EQ0001",
              equipment_name: "挖土机",
              terms: { method: "MONTHLY", unit_price: "24000.00", pieces: PIECES },
              days_worked: 0,
              normal_hours: "0.00",
              overtime_hours: "0.00",
              base_rent: "21000.00",
              overtime_fee: "0.00",
              diesel_fee: "0.00",
              adjustment_amount: "0.00",
              rental_total: "21000.00",
              months: [{ month: "2026-09", confirmed: true, rental_total: "21000.00" }],
            },
          ]}
        />,
      ),
    );
    expect(html).toContain("2026-09-01 至 2026-09-15：按月 RM 18,000.00");
    expect(html).toContain("2026-09-16 至 2026-09-30：按月 RM 24,000.00");
    // QA288: the amounts read like the rest of the page, 「21,000.00」.
    expect(html).toContain("21,000.00");
    expect(html).not.toContain(" 21000.00");
    const report = read("src/components/reports/rental-fee-table.tsx");
    expect(report).toContain("termsSummary(tRental, row.rental_terms, tj)");
  });

  it("one set of terms reads as before", () => {
    const t = ((key: string) => key) as unknown as Parameters<typeof termsSummary>[0];
    expect(termsSummary(t, OLD, t)).toBe(termsSummary(t, OLD));
  });
});

describe("words", () => {
  it("every jb288 word is in the four catalogues, and none says 您", () => {
    const keys = Object.keys(zh.jb288).sort();
    for (const catalogue of [zhTW, en, ms]) {
      expect(Object.keys(catalogue.jb288).sort()).toEqual(keys);
    }
    for (const catalogue of [zh, zhTW]) {
      expect(JSON.stringify(catalogue.jb288)).not.toContain("您");
    }
  });

  it("QA288: without 金额查看 the list shows, the 租赁条件 form does not, and the line says why", () => {
    const cache: [readonly unknown[], unknown][] = [[["equipment-rental", "p1"], LIST]];
    const withAmounts = text(render(<RentalTermsBody project="p1" />, cache));
    expect(render(<RentalTermsBody project="p1" />, cache)).toContain(`>${zh.equipmentRental.open}<`);
    expect(withAmounts).not.toContain(words.noAmounts);
    auth.amounts = false;
    try {
      const raw = render(<RentalTermsBody project="p1" />, cache);
      const without = text(raw);
      expect(without).toContain("HH machinery sb · 1 号 · 挖土机");
      expect(without).toContain(words.noAmounts);
      expect(raw.split(`>${zh.equipmentRental.open}<`).length - 1).toBe(0);
    } finally {
      auth.amounts = true;
    }
  });

  it("the list still works on its own page (设备操作员工时)", () => {
    expect(render(<RentalTermsBody project="" />)).toContain(zh.equipmentRental.chooseProject);
  });
});
