/**
 * JB295 (客户 11-27i): 人工费用 + 人工结算单; JB295b (客户 11-28 事项 2): the two
 * tabs on 人员名单 (人工费用统计 / 人工月结单), linked people, 统计方式 and
 * operators already paid inside the equipment rental.
 *
 * 「目前人员名单及人员进场记录页面……没有看到人工费用统计及结算入口。请参考现有设备
 * 租赁费用的核对与结算流程……支持按人员、工种及所属公司设定人工单价。按实际核实的
 * 工作天数、正常工时及超时工时累计计算人工费用。支持按所属公司及月份生成结算单。
 * 保留待核对、已核对、已结算三个状态。经核对确认的人工费用自动关联至项目总花费，
 * 避免重复累计。电子围栏的进场及离场记录作为出勤依据，实际计费工时及工作天数必须
 * 经过负责人核对确认。」 Lucas 11-27 final: App 账号 too (「因为是自动打卡所以会
 * 自动计算」).
 *
 * The pages against the contract's shapes (mocked, seeded into the cache);
 * the runner has no DOM, so they render to static markup.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const state = vi.hoisted(() => ({
  search: "project=p-1&month=2026-10",
  user: {
    id: "u-1",
    full_name: "Boss Lim",
    portal: "MSE_TRACE",
    account_type: "TENANT",
    company_type: "CONTRACTOR",
    is_field_staff: false,
  } as Record<string, unknown>,
  denied: new Set<string>(),
}));

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
const redirected = vi.hoisted(() => ({ to: "" }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected.to = to;
  },
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/site-workers",
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  CURRENT_USER_KEY: ["auth", "me"],
  useAuth: () => ({ user: state.user, can: (code: string) => !state.denied.has(code), refresh: async () => {} }),
}));
vi.mock("@/components/reports/report-selector", () => ({ ReportSelector: () => null }));
vi.mock("@/components/providers/current-project-provider", () => ({
  useCurrentProject: () => ({
    active: false,
    projectId: "",
    projects: [],
    canChooseAll: true,
    loading: false,
    setProjectId: () => undefined,
  }),
  usePageProject: (initial = "") => [initial, () => undefined],
  useOnProjectChange: () => undefined,
}));

const {
  LabourCostsPage,
  AdjustDayDialog,
  ConfirmMonthDialog,
  SummaryTable,
  confirmable,
  linkedNames,
  liveStatement,
  phoneWarnings,
  sortDays,
  statementHref,
  tickable,
  usesSummary,
} = await import("@/components/labour/labour-costs");
const { siteWorkerTabs, VisitFlags, VisitSource } = await import("@/components/site-workers/site-workers");
const { default: LabourCostsRoute } = await import("@/app/(dashboard)/labour-costs/page");
const { default: LabourStatementsRoute } = await import("@/app/(dashboard)/labour-statements/page");
const { LabourRatesDialog, rateTargetMissing, ratesByScope, validPrice } = await import(
  "@/components/labour/labour-rates"
);
const { hoursText, isMonth, lastFinishedMonth, monthEndShort, validHours } = await import(
  "@/components/labour/labour-shared"
);
const { LabourStatementsPage, LabourStatementWindow, generateBlock, labourTabOf, statementTotals, summaryTotals } =
  await import("@/components/labour/labour-statements");
const { LabourCostsButton, labourCostsHref } = await import("@/components/labour/labour-costs-button");
const { ReturnCheckWindow } = await import("@/components/contractor-ops/return-checks");
const { readStatementList } = await import("@/services/labour-statement.service");
const { SiteCostOverview } = await import("@/components/reports/site-cost-overview");
const { siteCostReportHref } = await import("@/services/site-cost-overview.service");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, String(value)), template);

function render(node: React.ReactNode, seed?: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed?.(qc);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const OPTIONS = {
  companies: [
    { key: "s-hh", name: "HH machinery sb", kind: "supplier" },
    { key: "self", name: "", kind: "self" },
    { key: "none", name: "", kind: "none" },
  ],
  trades: [{ key: "operator", name: "operator" }],
  people: [
    {
      key: "worker:w-ong",
      name: "ong",
      group: "roster",
      company_key: "s-hh",
      company_name: "HH machinery sb",
      trade_name: "operator",
      is_active: true,
    },
    { key: "user:u-ahing", name: "ahing", group: "app", company_key: "self", company_name: "", trade_name: "", is_active: true },
  ],
};

const RATE = { scope: "TRADE", method: "DAILY", unit_price: "120.00", overtime_rate: "20.00", effective_from: "2026-10-01" };

const MONTH_ROWS = [
  {
    person_key: "worker:w-ong",
    person_name: "ong",
    group: "roster",
    company_key: "s-hh",
    company_name: "HH machinery sb",
    trade_name: "operator",
    days_worked: 22,
    normal_hours: "176.00",
    overtime_hours: "10.50",
    missing_exit_count: 1,
    system_exit_count: 0,
    adjusted_count: 1,
    rates: [{ scope: "TRADE", method: "DAILY", unit_price: "120.00", overtime_rate: "20.00", from: "2026-10-01", to: "2026-10-31" }],
    no_rate: false,
    normal_amount: "2640.00",
    overtime_amount: "210.00",
    labour_amount: "2850.00",
    confirmed: { at: "2026-11-02T03:00:00Z", by: "Boss Lim" },
    statement: { id: "st-1", statement_no: "LB-MS001", state: "PENDING" },
  },
  {
    person_key: "user:u-ahing",
    person_name: "ahing",
    group: "app",
    company_key: "self",
    company_name: "",
    trade_name: "",
    days_worked: 3,
    normal_hours: "24.00",
    overtime_hours: "0.00",
    missing_exit_count: 0,
    system_exit_count: 1,
    adjusted_count: 0,
    rates: [],
    no_rate: true,
    normal_amount: null,
    overtime_amount: null,
    labour_amount: null,
    confirmed: null,
    statement: null,
  },
];

const MONTH = {
  rows: MONTH_ROWS,
  totals: { days_worked: 25, normal_hours: "200.00", overtime_hours: "10.50", normal_amount: null, overtime_amount: null, labour_amount: null },
  month_over: true,
  amounts_hidden: false,
};

const DAY_ROWS = [
  {
    person_key: "user:u-ahing",
    person_name: "ahing",
    group: "app",
    company_key: "self",
    company_name: "",
    trade_name: "",
    date: "2026-10-26",
    sessions: [
      { start: "2026-10-26T01:24:00Z", end: "2026-10-26T01:54:00Z", end_kind: "SYSTEM", source: "app", refs: ["AT-056", "AT-058"] },
    ],
    total_hours: "0.50",
    normal_hours: "0.50",
    overtime_hours: "0.00",
    worked: true,
    flags: ["system_exit"],
    adjusted: null,
    locked: null,
    rate: null,
    normal_amount: null,
    overtime_amount: null,
    day_amount: null,
  },
  {
    person_key: "worker:w-ong",
    person_name: "ong",
    group: "roster",
    company_key: "s-hh",
    company_name: "HH machinery sb",
    trade_name: "operator",
    date: "2026-10-27",
    sessions: [{ start: "2026-10-27T00:00:00Z", end: null, end_kind: "MISSING", source: "roster", refs: [] }],
    total_hours: "0.00",
    normal_hours: "8.00",
    overtime_hours: "1.00",
    worked: true,
    flags: ["missing_exit"],
    adjusted: { by: "Boss Lim", at: "2026-10-28T02:00:00Z", reason: "手机没电", worked: true, normal_hours: "8.00", overtime_hours: "1.00" },
    locked: "confirmed",
    rate: RATE,
    normal_amount: "120.00",
    overtime_amount: "20.00",
    day_amount: "140.00",
  },
];

function seedPage(qc: QueryClient) {
  qc.setQueryData(["labour", "options", "p-1"], OPTIONS);
  qc.setQueryData(["labour", "month", { project: "p-1", month: "2026-10" }], MONTH);
  qc.setQueryData(["labour", "days", { project: "p-1", month: "2026-10" }], { rows: DAY_ROWS, month_locked_people: ["worker:w-ong"] });
  qc.setQueryData(["labour", "normal-hours", "p-1"], { daily_hours: "9.00", effective_from: "2026-10-01", history: [] });
}

beforeEach(() => {
  state.search = "project=p-1&month=2026-10";
  state.denied = new Set();
  state.user = { ...state.user, is_field_staff: false };
});

describe("「没有看到人工费用统计及结算入口」: the menu, the pages and the header buttons", () => {
  it("JB295b 「在现有人员名单页面上方，完善人工费用统计及人工月结单两个栏目」: two tabs, no menu items", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).not.toContain('"/labour-costs"');
    expect(nav).not.toContain('"/labour-statements"');
    const keys = JSON.parse(read("src/lib/menu-name-keys.json")).MSE_TRACE as string[];
    expect(keys).not.toContain("nav.submodule.labourCosts");
    expect(keys).not.toContain("nav.submodule.labourStatements");
    expect(zh.jb295.tab.labour).toBe("人工费用统计");
    expect(zh.jb295.tab.statements).toBe("人工月结单");
    // Each tab by its right; the phone has none of them.
    expect(siteWorkerTabs(() => true)).toEqual(["roster", "visits", "labour", "statements"]);
    expect(siteWorkerTabs((code) => code !== "labour.manage")).toEqual(["roster", "visits", "labour"]);
    expect(siteWorkerTabs(() => false)).toEqual(["roster", "visits"]);
    const page = read("src/components/site-workers/site-workers.tsx");
    expect(page).toContain("<LabourCostsPage />");
    expect(page).toContain("<LabourStatementsPage />");
  });

  it("the old addresses open the tabs, keeping project, month, state and statement", async () => {
    await LabourCostsRoute({ searchParams: Promise.resolve({ project: "p-1", month: "2026-10" }) });
    expect(redirected.to).toBe("/site-workers?tab=labour&project=p-1&month=2026-10");
    await LabourStatementsRoute({ searchParams: Promise.resolve({ tab: "checked", statement: "st-1" }) });
    expect(redirected.to).toBe("/site-workers?tab=statements&state=checked&statement=st-1");
  });

  it("【人工费用统计】 sits in the 人员进场记录 header only, for labour.view, never on the phone", () => {
    expect(read("src/components/site-workers/site-workers.tsx")).not.toContain("<LabourCostsButton");
    expect(read("src/components/site-operations/attendance.tsx")).toContain("<LabourCostsButton project={selectedProject} />");
    expect(labourCostsHref("p-1")).toBe("/site-workers?tab=labour&project=p-1");
    expect(labourCostsHref("all")).toBe("/site-workers?tab=labour");
    const html = render(<LabourCostsButton project="p-1" />);
    expect(text(html)).toContain("人工费用统计");
    expect(html).toContain('href="/site-workers?tab=labour&amp;project=p-1"');
    state.denied = new Set(["labour.view"]);
    expect(render(<LabourCostsButton />)).toBe("");
    state.denied = new Set();
    state.user = { ...state.user, is_field_staff: true };
    expect(render(<LabourCostsButton />)).toBe("");
  });
});

describe("人工费用 · 按月", () => {
  it("shows both groups, the rate or 「没有单价」, the amounts, 已确认 and its 结算单, the 合计", () => {
    const out = text(render(<LabourCostsPage />, seedPage));
    for (const word of [
      zh.jb295.rates.title,
      fill(zh.jb295.normal.button, { hours: "9" }),
      zh.jb295.confirm.button,
      zh.jb295.tab.statements,
      zh.jb295.view.day,
      zh.jb295.view.month,
      zh.jb295.filter.flagged,
    ]) {
      expect(out).toContain(word);
    }
    expect(out).toContain("ong");
    expect(out).toContain("人员名单");
    expect(out).toContain("ahing");
    expect(out).toContain("App 账号");
    expect(out).toContain("本公司");
    expect(out).toContain("未填工种");
    expect(out).toContain("日薪 RM 120.00");
    expect(out).toContain("超时 RM 20.00 / 小时");
    expect(out).toContain("2,850.00");
    expect(out).toContain("没有单价");
    expect(out).toContain("设定单价");
    expect(out).toContain("已确认");
    expect(out).toContain("Boss Lim");
    expect(out).toContain("月结单 LB-MS001（待核对）");
    expect(out).toContain("未确认");
    expect(out).toContain(zh.jb295.unconfirm.button);
    expect(out).toContain(zh.jb295.month.total);
    // 176 h and 10.5 h, never 「176.00」.
    expect(out).toContain("176");
    expect(out).toContain("10.5");
  });

  it("【取消确认】 waits for a live 结算单 and says which", () => {
    expect(liveStatement(MONTH_ROWS[0] as never)?.statement_no).toBe("LB-MS001");
    expect(liveStatement({ ...MONTH_ROWS[0], statement: { id: "x", statement_no: "LB-MS002", state: "CANCELLED" } } as never)).toBe(
      null,
    );
    const html = render(<LabourCostsPage />, seedPage);
    expect(html).toContain(fill(zh.jb295.unconfirm.inStatement, { number: "LB-MS001" }));
    expect(statementHref("st-1")).toBe("/site-workers?tab=statements&state=all&statement=st-1");
    expect(html).toContain('href="/site-workers?tab=statements&amp;state=all&amp;statement=st-1"');
  });

  it("without 「金额查看」: days and hours stay, no rates button, a plain sentence", () => {
    state.denied = new Set(["finance.view_amounts"]);
    const out = text(render(<LabourCostsPage />, seedPage));
    expect(out).not.toContain(zh.jb295.rates.title);
    expect(out).not.toContain(zh.jb295.rate.set);
    expect(out).toContain(zh.jb295.amountsHidden);
    expect(out).toContain("22");
  });

  it("without labour.manage: reads only - no rates, confirm, adjust or undo", () => {
    state.denied = new Set(["labour.manage"]);
    const out = text(render(<LabourCostsPage />, seedPage));
    expect(out).not.toContain(zh.jb295.confirm.button);
    expect(out).not.toContain(zh.jb295.unconfirm.button);
    expect(out).not.toContain(zh.jb295.rates.title);
  });

  it("refuses a reader without labour.view, and the phone", () => {
    state.denied = new Set(["labour.view"]);
    expect(text(render(<LabourCostsPage />, seedPage))).toContain(zh.jb295.noView);
    state.denied = new Set();
    state.user = { ...state.user, is_field_staff: true };
    expect(text(render(<LabourCostsPage />, seedPage))).toContain(zh.jb295.noView);
  });

  it("asks for a project first", () => {
    state.search = "";
    expect(text(render(<LabourCostsPage />))).toContain(zh.jb295.chooseProjectFirst);
  });
});

describe("人工费用 · 按日", () => {
  it("shows each stay, 「系统结束，离开时间要核对」, 「缺离场」, who adjusted and why, 🔒 and 【调整】", () => {
    state.search = "project=p-1&month=2026-10&view=day";
    const html = render(<LabourCostsPage />, seedPage);
    const out = text(html);
    expect(out).toContain("09:24 – 09:54");
    expect(out).toContain("系统结束，离开时间要核对");
    expect(out).toContain(zh.jb295.day.missingExit);
    expect(out).toContain(zh.jb295.day.adjusted);
    expect(html).toContain(fill(zh.jb295.day.adjustedBy, { name: "Boss Lim", time: "28 Oct 2026 10:00", reason: "手机没电" }).slice(0, 12));
    expect(out).toContain(zh.jb295.day.locked.confirmed);
    // The unlocked day offers 【调整】; the locked one does not.
    expect(html.split('data-slot="labour-adjust-button"').length - 1).toBe(1);
    // Newest first.
    expect(sortDays(DAY_ROWS as never).map((row) => row.date)).toEqual(["2026-10-27", "2026-10-26"]);
  });

  it("【调整】: 有上班 yes / no, 正常工时, 超时工时, 原因, then the PIN", () => {
    const out = text(render(<AdjustDayDialog project="p-1" row={DAY_ROWS[0] as never} onClose={() => undefined} />));
    for (const word of [
      zh.jb295.adjust.worked,
      zh.jb295.adjust.workedYes,
      zh.jb295.adjust.workedNo,
      zh.jb295.col.normalHours,
      zh.jb295.col.overtimeHours,
      zh.jb295.adjust.reason,
      zh.jb295.adjust.pinNote,
      zh.jb295.day.systemExitHelp,
    ]) {
      expect(out).toContain(word);
    }
    expect(validHours("8")).toBe(true);
    expect(validHours("7.25")).toBe(true);
    expect(validHours("24.5")).toBe(false);
    expect(validHours("-1")).toBe(false);
    expect(validHours("1.234")).toBe(false);
  });
});

describe("【确认本月工时】 (负责人核对确认)", () => {
  it("only for a month that is over, saying till when", () => {
    const html = render(<ConfirmMonthDialog project="p-1" month="2026-11" onClose={() => undefined} />, (qc) =>
      qc.setQueryData(["labour", "month", { project: "p-1", month: "2026-11" }], { ...MONTH, month_over: false }),
    );
    expect(text(html)).toContain("这个月还没过完（到 30/11），过完才能确认。");
    expect(monthEndShort("2026-02")).toBe("28/02");
    expect(monthEndShort("2028-02")).toBe("29/02");
  });

  it("offers the people not confirmed yet, with their days to check; no rate = not tickable, says why", () => {
    expect(confirmable(MONTH_ROWS as never).map((row) => row.person_key)).toEqual(["user:u-ahing"]);
    expect(tickable(MONTH_ROWS as never)).toEqual([]);
    const priced = { ...MONTH_ROWS[1], person_key: "user:u-mei", person_name: "mei", no_rate: false, rates: MONTH_ROWS[0].rates };
    expect(tickable([...MONTH_ROWS, priced] as never).map((row) => row.person_key)).toEqual(["user:u-mei"]);
    const out = text(
      render(<ConfirmMonthDialog project="p-1" month="2026-10" onClose={() => undefined} />, (qc) =>
        qc.setQueryData(["labour", "month", { project: "p-1", month: "2026-10" }], { ...MONTH, rows: [...MONTH_ROWS, priced] }),
      ),
    );
    expect(out).toContain("ahing");
    expect(out).toContain(zh.jb295.confirm.noRate);
    expect(out).toContain(fill(zh.jb295.confirm.noRateNames, { names: "ahing" }));
    expect(out).toContain("mei");
    expect(out).toContain(fill(zh.jb295.confirm.flags, { count: 1 }));
    expect(out).toContain(fill(zh.jb295.confirm.save, { count: 1 }));
    expect(out).toContain(zh.jb295.confirm.pinNote);
  });

  it("defaults to the last month that is over", () => {
    expect(lastFinishedMonth(new Date(2026, 10, 27))).toBe("2026-10");
    expect(lastFinishedMonth(new Date(2026, 0, 5))).toBe("2025-12");
    expect(isMonth("2026-10")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(hoursText("8.00")).toBe("8");
    expect(hoursText("10.50")).toBe("10.5");
  });
});

describe("【人工单价设定】: 按人员、工种及所属公司", () => {
  const RATES = [
    { id: "r1", scope: "PERSON", person_key: "worker:w-ong", person_name: "ong", company_key: "", company_name: "", trade: "", method: "HOURLY", unit_price: "18.00", overtime_rate: null, effective_from: "2026-10-01", note: "", previous: null, created_by_name: "Boss Lim", created_at: "2026-10-01T01:00:00Z" },
    { id: "r2", scope: "COMPANY_TRADE", person_key: "", person_name: "", company_key: "s-hh", company_name: "HH machinery sb", trade: "operator", method: "DAILY", unit_price: "150.00", overtime_rate: "25.00", effective_from: "2026-10-01", note: "合约价", previous: null, created_by_name: "Boss Lim", created_at: "2026-10-01T01:00:00Z" },
    { id: "r3", scope: "COMPANY", person_key: "", person_name: "", company_key: "self", company_name: "", trade: "", method: "DAILY", unit_price: "100.00", overtime_rate: null, effective_from: "2026-09-01", note: "", previous: null, created_by_name: "Boss Lim", created_at: "2026-09-01T01:00:00Z" },
  ];

  it("lists the rates under four plain headings, with the order sentence and 【价格历史】", () => {
    const out = text(
      render(<LabourRatesDialog project="p-1" onClose={() => undefined} />, (qc) => {
        qc.setQueryData(["labour", "rates", "p-1"], { rows: RATES });
        qc.setQueryData(["labour", "options", "p-1"], OPTIONS);
      }),
    );
    for (const heading of ["按人员", "按所属公司 + 工种", "按工种", "按所属公司"]) expect(out).toContain(heading);
    expect(out).toContain("同一个人有几个单价时，用最细的那一个：人员 → 所属公司 + 工种 → 工种 → 所属公司");
    expect(out).toContain("时薪 RM 18.00");
    expect(out).toContain("没有超时单价");
    expect(out).toContain("HH machinery sb · operator");
    expect(out).toContain("日薪 RM 150.00");
    expect(out).toContain("本公司");
    expect(out).toContain(zh.jb295.rates.history);
    expect(out).toContain(zh.jb295.rates.add);
    expect(ratesByScope(RATES as never).map((group) => [group.scope, group.rows.length])).toEqual([
      ["PERSON", 1],
      ["COMPANY_TRADE", 1],
      ["TRADE", 0],
      ["COMPANY", 1],
    ]);
  });

  it("【新增单价】 (from 【设定单价】): 按什么, who, 日薪 / 时薪, 单价, 超时单价, 生效日期, 备注, PIN", () => {
    const out = text(
      render(
        <LabourRatesDialog project="p-1" prefill={{ scope: "PERSON", person_key: "user:u-ahing" }} onClose={() => undefined} />,
        (qc) => {
          qc.setQueryData(["labour", "rates", "p-1"], { rows: [] });
          qc.setQueryData(["labour", "options", "p-1"], OPTIONS);
        },
      ),
    );
    for (const word of [
      zh.jb295.rates.chooseScope,
      zh.jb295.scopeHelp.PERSON,
      zh.jb295.field.method,
      zh.jb295.method.DAILY,
      zh.jb295.method.HOURLY,
      zh.jb295.field.dayPrice,
      zh.jb295.field.overtimeRate,
      zh.jb295.field.overtimeHint,
      zh.jb295.field.effectiveFrom,
      zh.jb295.field.note,
      zh.jb295.rates.pinNote,
      zh.jb295.rates.save,
    ]) {
      expect(out).toContain(word);
    }
    expect(rateTargetMissing("COMPANY_TRADE", { person_key: "", company_key: "s-hh", trade: "" })).toEqual(["trade"]);
    expect(rateTargetMissing("PERSON", { person_key: "worker:w-ong", company_key: "", trade: "" })).toEqual([]);
    expect(validPrice("120")).toBe(true);
    expect(validPrice("0")).toBe(false);
    expect(validPrice("1.999")).toBe(false);
  });
});

const SUMMARY = {
  id: "st-1",
  statement_no: "LB-MS001",
  project: "p-1",
  project_name: "PUTRA_MAS",
  company_key: "s-hh",
  company_name: "HH machinery sb",
  month: "2026-10",
  state: "PENDING",
  line_count: 1,
  days_total: 22,
  normal_hours_total: "176.00",
  overtime_hours_total: "10.50",
  normal_amount: "2640.00",
  overtime_amount: "210.00",
  labour_total: "2850.00",
  generated_by_name: "Boss Lim",
  generated_at: "2026-11-03T02:00:00Z",
  check: null,
  settlement: null,
};

describe("人工结算单: 按所属公司及月份, 待核对 / 已核对 / 已结算", () => {
  it("has the three states (+ 全部) with how many, and the list", () => {
    state.search = "";
    const out = text(
      render(<LabourStatementsPage />, (qc) => {
        qc.setQueryData(["labour-statements", "list", { state: "pending" }], {
          rows: [SUMMARY],
          counts: { pending: 1, checked: 2, settled: 3, all: 6 },
        });
        qc.setQueryData(["labour-statements", "filters", ""], { projects: [], companies: [], months: [] });
      }),
    );
    expect(out).toContain("待核对 (1)");
    expect(out).toContain("已核对 (2)");
    expect(out).toContain("已结算 (3)");
    expect(out).toContain("全部 (6)");
    expect(out).toContain("LB-MS001");
    expect(out).toContain("HH machinery sb");
    expect(out).toContain("2,850.00");
    expect(out).toContain(zh.jb295.statement.generate);
    expect(out).toContain(zh.jb278.issueButton);
    expect(labourTabOf("checked")).toBe("checked");
    expect(labourTabOf(null)).toBe("pending");
    expect(read("src/components/labour/labour-statements.tsx")).toMatch(/<ReconcileSettleButton\s+kind="LABOUR"/);
    // 本公司 / 未填所属公司 come without a name: the 核对 picker words them.
    expect(read("src/components/contractor-ops/return-checks.tsx")).toContain('row.id === "self" ? t295("company.self") : t295("company.none")');
  });

  it("opens on 已核对 from the overview's 查看明细", () => {
    state.search = "state=checked";
    const out = text(
      render(<LabourStatementsPage />, (qc) =>
        qc.setQueryData(["labour-statements", "list", { state: "checked" }], { rows: [], counts: null }),
      ),
    );
    expect(out).toContain(zh.jb295.statement.empty.checked);
  });

  it("needs labour.manage and 「金额查看」, saying which", () => {
    state.denied = new Set(["labour.manage"]);
    expect(text(render(<LabourStatementsPage />))).toContain(zh.jb295.statement.noManage);
    state.denied = new Set(["finance.view_amounts"]);
    expect(text(render(<LabourStatementsPage />))).toContain(zh.jb295.statement.noAmounts);
  });

  it("one statement: who, the people, the 合计, 核对 / 结算, the PDF and 【作废】 while 待核对", () => {
    const line = { ...MONTH_ROWS[0], days: [{ date: "2026-10-01", worked: true, normal_hours: "8.00", overtime_hours: "1.00", day_amount: "140.00" }] };
    delete (line as Record<string, unknown>).statement;
    delete (line as Record<string, unknown>).confirmed;
    const html = render(<LabourStatementWindow id="st-1" onClose={() => undefined} />, (qc) =>
      qc.setQueryData(["labour-statements", "detail", "st-1"], { ...SUMMARY, lines: [line] }),
    );
    const out = text(html);
    expect(out).toContain("人工月结单 LB-MS001");
    expect(out).toContain("PUTRA_MAS · HH machinery sb · 2026-10");
    for (const head of ["姓名", "工种", "工作天数", "正常工时", "超时工时", "单价（方式）", "正常金额（RM）", "超时金额（RM）", "合计（RM）"]) {
      expect(out).toContain(head);
    }
    expect(out).toContain("日薪 RM 120.00");
    expect(out).toContain(zh.jb295.statement.days);
    expect(out).toContain(zh.jb295.statement.pdf);
    expect(out).toContain(zh.jb295.statement.cancel);
    expect(html).toMatch(/data-slot="labour-statement-total-amount"[^>]*>2,850\.00</);
  });

  it("【生成结算单】 says plainly why it cannot go yet", () => {
    const t = (key: string, values?: Record<string, string>) => {
      const node = key.split(".").reduce<unknown>((at, part) => (at as Record<string, unknown>)[part], zh.jb295) as string;
      return values ? fill(node, values) : node;
    };
    const base = { lines: [{}], totals: {}, will_confirm: [], no_rate: [], no_company: [], overlap: null, month_over: true };
    expect(generateBlock(t as never, base as never, "2026-10")).toBe(null);
    expect(generateBlock(t as never, { ...base, month_over: false } as never, "2026-11")).toContain("30/11");
    expect(generateBlock(t as never, { ...base, overlap: { id: "x", statement_no: "LB-MS001" } } as never, "2026-10")).toContain(
      "LB-MS001",
    );
    expect(generateBlock(t as never, { ...base, no_rate: [{ key: "a", name: "ahing" }] } as never, "2026-10")).toBe(
      zh.jb295.statement.noRateShort,
    );
    expect(generateBlock(t as never, { ...base, lines: [] } as never, "2026-10")).toBe(zh.jb295.statement.emptyPreview);
  });

  it("reads the contract's list and the totals", () => {
    expect(readStatementList({ rows: [SUMMARY], counts: { pending: 1, checked: 0, settled: 0, all: 1 } }).rows).toHaveLength(1);
    expect(readStatementList({ results: [SUMMARY], count: 1 }).rows).toHaveLength(1);
    expect(summaryTotals(SUMMARY as never).labour_amount).toBe("2850.00");
    const lines = [
      { ...MONTH_ROWS[0], days: [] },
      { ...MONTH_ROWS[0], labour_amount: "0.10", normal_amount: "0.10", overtime_amount: "0.00", days: [] },
    ];
    expect(statementTotals(lines as never).labour_amount).toBe("2850.10");
  });
});

describe("核对 / 结算 through the shared engine (kind LABOUR)", () => {
  it("the 核对 window lists the 人工结算单 it holds", () => {
    const out = text(
      render(<ReturnCheckWindow id="c-1" kind="LABOUR" onClose={() => undefined} />, (qc) =>
        qc.setQueryData(["return-checks", "detail", "LABOUR", "c-1"], {
          id: "c-1",
          kind: "LABOUR",
          check_no: "LB-RC001",
          supplier: null,
          supplier_name: "HH machinery sb",
          return_count: 1,
          checked_at: "2026-11-04T02:00:00Z",
          checked_by_name: "Boss Lim",
          voucher_no: "INV-1",
          note: "",
          returns: [],
          statements: [{ ...SUMMARY, state: "CHECKED", check: { id: "c-1", check_no: "LB-RC001" } }],
          hidden_count: 0,
          project: "p-1",
          settlement: null,
        }),
      ),
    );
    expect(out).toContain("人工核对 LB-RC001");
    expect(out).toContain(fill(zh.jb295.checkStatementsTitle, { count: 1 }));
    expect(out).toContain("LB-MS001");
    expect(out).toContain("INV-1");
    expect(out).toContain(zh.jb278.resultOnly);
  });
});

describe("words", () => {
  const keys = (value: unknown, prefix = ""): string[] =>
    typeof value === "object" && value !== null
      ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
      : [prefix];

  it("jb295 is in all four languages, same keys, says 你 (never 您)", () => {
    for (const catalogue of [zhTW, en, ms]) {
      expect(keys(catalogue.jb295).sort()).toEqual(keys(zh.jb295).sort());
      expect(catalogue.jb295.tab.labour).toBeTruthy();
      expect(catalogue.jb295.tab.statements).toBeTruthy();
    }
    for (const catalogue of [zh, zhTW]) expect(JSON.stringify(catalogue.jb295)).not.toContain("您");
    expect(zh.jb295.cost.notCounted).toBe("还有 {amount} 未核对，不算在内");
    expect(zh.jb295.day.systemExit).toBe("系统结束，离开时间要核对");
    expect(zh.jb295.employer.hint).toContain("不填 = 本公司");
  });

  it("carries the backend's words: errors, PIN steps, audit rows, permissions", () => {
    const codes = [
      "labour_rate_duplicate_date",
      "labour_rate_invalid_scope",
      "labour_month_not_over",
      "labour_month_confirmed",
      "labour_month_not_confirmed",
      "labour_month_in_statement",
      "labour_statement_locked",
      "labour_statement_overlap",
      "labour_statement_no_rate",
      "labour_statement_no_company",
      "labour_statement_empty",
      "labour_check_other_company",
      "labour_amounts_off",
    ];
    const pins = ["labour_rate_set", "labour_hours_adjust", "labour_confirm", "labour_unconfirm", "labour_statement", "labour_check", "labour_settle"];
    for (const catalogue of [zh, zhTW, en, ms] as unknown as Record<string, unknown>[]) {
      const errors = (catalogue.errors as { api: Record<string, string> }).api;
      for (const code of codes) expect(errors[code], code).toBeTruthy();
      const actions = (catalogue.signOff as { action: Record<string, string> }).action;
      for (const pin of pins) expect(actions[pin], pin).toBeTruthy();
      const permissions = catalogue.permissions as { code: Record<string, Record<string, string>>; group: Record<string, string> };
      expect(permissions.code.labour.view).toBeTruthy();
      expect(permissions.code.labour.manage).toBeTruthy();
      expect(permissions.group.labour).toBeTruthy();
    }
    const catalogue = JSON.parse(read("src/lib/permission-catalogue.json")) as { codes: { code: string }[] };
    expect(catalogue.codes.map((row) => row.code)).toEqual(expect.arrayContaining(["labour.view", "labour.manage"]));
  });

  it("no raw keys on the pages", () => {
    const html = render(<LabourCostsPage />, seedPage);
    expect(html).not.toMatch(/jb295\.[a-zA-Z]/);
  });
});

describe("「经核对确认的人工费用自动关联至项目总花费，避免重复累计」", () => {
  it("is the overview's sixth source, with what is not counted yet said under it", () => {
    state.search = "project=p1&date_from=2026-10-01&date_to=2026-10-31";
    const out = text(
      render(<SiteCostOverview />, (qc) =>
        qc.setQueryData(["site-cost-overview", { project: "p1", date_from: "2026-10-01", date_to: "2026-10-31" }], {
          project: "p1",
          date_from: "2026-10-01",
          date_to: "2026-10-31",
          total_amount: "2850.00",
          sources: [
            { key: "material_cost", amount: "0.00", available: true, share: "0.0" },
            { key: "equipment_rental", amount: "0.00", available: true, share: "0.0" },
            { key: "progress_claim", amount: "0.00", available: true, share: "0.0" },
            { key: "sundry_claims", amount: "0.00", available: true, share: "0.0" },
            { key: "disposal", amount: "0.00", available: true, share: "0.0" },
            { key: "labour", amount: "2850.00", available: true, share: "100.0", not_counted_amount: "1234.00" },
          ],
          months: [],
        }),
      ),
    );
    expect(out).toContain(zh.jb295.cost.source);
    expect(out).toContain("RM 2,850.00");
    expect(out).toContain("还有 RM 1,234.00 未核对，不算在内");
    expect(out).toContain(zh.jb295.cost.report);
    // 查看明细: the 已核对 statements - what the amount counts.
    expect(siteCostReportHref("labour", { project: "p1", date_from: "2026-10-01", date_to: "2026-10-31" })).toBe(
      "/site-workers?tab=statements&state=checked",
    );
  });
});

describe("JB295b · one person, two identities (same phone): 「人员名单中的进出场记录显示0笔」", () => {
  const LINKED = {
    ...OPTIONS,
    people: [{ ...OPTIONS.people[0], linked_user: { key: "user:u-ahong", name: "ah ong" } }, OPTIONS.people[1]],
    warnings: [{ kind: "same_phone_twice", keys: ["worker:w-ong", "user:u-ahing"] }],
  };

  it("the worker list tags the linked app account; the 进出场记录 tab shows 来源, AT numbers and marks", () => {
    const page = read("src/components/site-workers/site-workers.tsx");
    expect(page).toContain('t295("twin.linkedTag", { name: row.original.linked_user.name })');
    expect(page).toContain('t295("twin.appName", { name: row.original.linked_user_name })');
    expect(fill(zh.jb295.twin.linkedTag, { name: "ah ong" })).toBe("已关联 App 账号 ah ong");
    const app = text(
      render(
        <VisitSource
          visit={{ source: "app", refs: ["AT-048", "AT-049"] } as never}
        />,
      ),
    );
    expect(app).toContain("App 打卡");
    expect(app).toContain("AT-048 · AT-049");
    expect(text(render(<VisitSource visit={{ source: "visit" } as never} />))).toBe("人员名单链接");
    const marks = text(render(<VisitFlags flags={["system_exit", "missing_exit"]} />));
    expect(marks).toContain("系统结束，离开时间要核对");
    expect(marks).toContain("缺离场");
  });

  it("人工费用统计 counts the twin once, says so, and warns about one phone with two people", () => {
    expect(linkedNames(LINKED as never).get("worker:w-ong")).toBe("ah ong");
    expect(phoneWarnings(LINKED as never)).toEqual([["ong", "ahing"]]);
    const out = text(
      render(<LabourCostsPage />, (qc) => {
        seedPage(qc);
        qc.setQueryData(["labour", "options", "p-1"], LINKED);
      }),
    );
    expect(out).toContain("App 账号：ah ong");
    expect(out).toContain("同一个号码有两个人员，请检查：ong、ahing");
  });

  it("按日 marks an app stay of a linked worker with 「App 打卡」 and its AT numbers", () => {
    state.search = "project=p-1&month=2026-10&view=day";
    const out = text(
      render(<LabourCostsPage />, (qc) => {
        seedPage(qc);
        qc.setQueryData(["labour", "days", { project: "p-1", month: "2026-10" }], {
          rows: [
            {
              ...DAY_ROWS[1],
              locked: null,
              sessions: [
                { start: "2026-10-27T00:00:00Z", end: "2026-10-27T09:00:00Z", end_kind: "EXIT", source: "app", refs: ["AT-048", "AT-049"] },
              ],
            },
          ],
          month_locked_people: [],
        });
      }),
    );
    expect(out).toContain("App 打卡 AT-048 · AT-049");
  });
});

describe("JB295b · 统计方式: 按人员 | 按所属公司 | 按工种, 月份 从…到", () => {
  it("按人员 for one month is the 按月 table; anything else reads the summary", () => {
    expect(usesSummary("person", "2026-10", "2026-10")).toBe(false);
    expect(usesSummary("person", "2026-09", "2026-10")).toBe(true);
    expect(usesSummary("company", "2026-10", "2026-10")).toBe(true);
    const out = text(render(<LabourCostsPage />, seedPage));
    for (const word of ["统计方式", "按人员", "按所属公司", "按工种", "月份从", "到"]) expect(out).toContain(word);
  });

  it("按所属公司: 人数, 工作天数, 工时, 人工费用 (已确认 / 未确认), 每月, 合计", () => {
    const figures = { people: 2, days_worked: 25, normal_hours: "200.00", overtime_hours: "10.50", labour_amount: "2850.00", confirmed_amount: "2850.00", unconfirmed_amount: "0.00" };
    const data = {
      rows: [
        { key: "s-hh", name: "HH machinery sb", ...figures, months: [{ month: "2026-09", ...figures }, { month: "2026-10", ...figures }] },
        { key: "self", name: "", ...figures, people: 1, months: [{ month: "2026-10", ...figures }] },
      ],
      totals: { ...figures, people: 3, labour_amount: "5700.00" },
      amounts_hidden: false,
    };
    const html = render(<SummaryTable group="company" data={data as never} loading={false} query={{ isError: false }} seesAmounts />);
    const out = text(html);
    for (const head of ["所属公司", "人数", "工作天数", "正常工时", "超时工时", "人工费用（RM）", "已确认（RM）", "未确认（RM）"]) {
      expect(out).toContain(head);
    }
    expect(out).toContain("HH machinery sb");
    expect(out).toContain("本公司");
    expect(out).toContain("5,700.00");
    // 每月 only where there are several months.
    expect(html.split('data-slot="labour-summary-months-toggle"').length - 1).toBe(1);
    expect(html).toContain('data-slot="labour-summary-total"');
    const trades = text(
      render(<SummaryTable group="trade" data={{ ...data, rows: [{ ...data.rows[0], key: "none", name: "" }] } as never} loading={false} query={{ isError: false }} seesAmounts />),
    );
    expect(trades).toContain("未填工种");
  });
});

describe("JB295b · 「已包含在设备租赁费用内的操作员人工费用，不得重复计算」", () => {
  it("rows under it say so instead of an amount - set by a rate, or found from the machine", () => {
    const rows = [
      { ...MONTH_ROWS[0], confirmed: null, statement: null, rates: [{ ...MONTH_ROWS[0].rates[0], method: "IN_RENTAL", unit_price: null }], labour_amount: "0.00", in_rental: { reason: "rate", equipment_no: null } },
      { ...MONTH_ROWS[1], person_key: "user:u-x", person_name: "kk", no_rate: false, rates: [], labour_amount: "0.00", in_rental: { reason: "operator", equipment_no: "EQ0002" } },
    ];
    const out = text(
      render(<LabourCostsPage />, (qc) => {
        seedPage(qc);
        qc.setQueryData(["labour", "month", { project: "p-1", month: "2026-10" }], { ...MONTH, rows });
      }),
    );
    expect(out).toContain("已含在设备租赁费用内，不计人工");
    expect(out).toContain("设备 EQ0002 的操作员，人工已含在设备租赁费用内");
    expect(out).not.toContain("设定单价");
  });

  it("【新增单价】 offers 「已含在设备租赁费用内」, and the 月结单 preview lists them", () => {
    expect(zh.jb295.method.IN_RENTAL).toBe("已含在设备租赁费用内");
    const out = text(
      render(<LabourRatesDialog project="p-1" prefill={{ scope: "TRADE", trade: "operator" }} onClose={() => undefined} />, (qc) => {
        qc.setQueryData(["labour", "rates", "p-1"], { rows: [] });
        qc.setQueryData(["labour", "options", "p-1"], OPTIONS);
      }),
    );
    expect(out).toContain("已含在设备租赁费用内");
    expect(read("src/components/labour/labour-statements.tsx")).toContain('text={t("statement.inRental")} people={shown.in_rental}');
    expect(zh.jb295.statement.inRental).toContain("已含在设备租赁费用内");
  });
});
