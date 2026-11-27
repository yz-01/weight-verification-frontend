/**
 * JB287 (客户 11-27): 垃圾清运「清运费用设定」 and 「全部」 → 「清运结算管理」.
 *
 * > 请保留「垃圾清运」原有页面及操作流程，在右上方「新增申请」旁边设置一个「清运费用
 * > 设定」按钮。建筑商后台按照供应商填写合同约定的每车清运费用，参照现有材料分类的价格
 * > 设定方式，只需填写一次。系统根据实际验收车次自动关联费用、自动计算及持续累计，
 * > 无须每次清运重复填写。原有合同价格调整后，不得影响历史费用记录。「全部」页面则按照
 * > 之前提出的方案调整为「清运结算管理」，负责批量核对、生成结算编号、准备结算、结算
 * > 完毕及历史归档。所有清运费用自动关联现有「清运与回收报表」及「项目现场费用总览」，
 * > 无须重新建立报表页面。
 *
 * Rendered to static markup (no DOM); the wiring read from the source; the
 * calls checked against the contract (spec 「接口和资料」).
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

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/waste-clearance",
  useSearchParams: () => new URLSearchParams("kind=settlement"),
}));
const reader = vi.hoisted(() => ({ phone: false, perms: new Set<string>(["disposal.view", "disposal.manage", "supplier.view"]) }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Site Office", email: "office@x.test", is_field_staff: reader.phone },
    can: (code: string) => reader.perms.has(code),
  }),
}));
vi.mock("@/components/providers/current-project-provider", () => ({
  useCurrentProject: () => ({
    active: false,
    projectId: "",
    projects: [],
    canChooseAll: true,
    loading: false,
    setProjectId: () => undefined,
  }),
}));
type Call = (...args: unknown[]) => Promise<unknown>;
const api = vi.hoisted(() => ({
  get: vi.fn<Call>(async () => ({})),
  post: vi.fn<Call>(async () => ({ number: "CS-PRJ-0001-001" })),
  fetchAsFile: vi.fn<Call>(async () => new File([""], "x.pdf")),
  toastSuccess: vi.fn(),
}));
vi.mock("@/services/api-client", async (original) => ({
  ...(await original<typeof import("@/services/api-client")>()),
  api: { get: api.get, post: api.post, list: api.get },
  fetchAsFile: api.fetchAsFile,
  toastSuccess: api.toastSuccess,
}));

const lib = await import("@/lib/disposal-fees");
const service = await import("@/services/disposal-settlement.service");
const { FeeTable } = await import("@/components/contractor-ops/disposal-fees");
const { NoFeeLine, PendingRowsTable, PrepareSettleButton, SettleDialog, SettlementFigures, SettlementLinesTable, SettlementRowsTable } =
  await import("@/components/contractor-ops/disposal-settlements");
const { DisposalFeePanel, DisposalFeeTotal, FeeAmountText, FeeStateBadge, SettlementNoLink } = await import(
  "@/components/contractor-ops/disposal-fee-panel"
);
const { reportColumnValues, reportValueKey } = await import("@/lib/report-preview");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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

beforeEach(() => {
  reader.phone = false;
  reader.perms = new Set(["disposal.view", "disposal.manage", "supplier.view"]);
  api.get.mockClear();
  api.post.mockClear();
  api.fetchAsFile.mockClear();
});

const PROJECT = { id: "p-1", name: "PUTRA MAS" };
const SUPPLIER = { id: "s-1", name: "Alam Flora" };

const PENDING_ROWS = [
  {
    disposal_id: "d-1",
    reference_no: "WC-PRJ-0001-001",
    project: PROJECT,
    supplier: SUPPLIER,
    cleared_on: "2026-11-03",
    trip_count: 3,
    fee_per_trip: "350.00",
    fee_amount: "1050.00",
    can_tick: true,
    cannot_tick_reason: null,
  },
  {
    disposal_id: "d-2",
    reference_no: "WC-PRJ-0001-002",
    project: PROJECT,
    supplier: { id: "s-2", name: "No Fee Sdn Bhd" },
    cleared_on: "2026-11-04",
    trip_count: 2,
    fee_per_trip: null,
    fee_amount: null,
    can_tick: false,
    cannot_tick_reason: "no_fee",
  },
];

const READY_ROW = {
  id: "st-1",
  number: "CS-PRJ-0001-001",
  project: PROJECT,
  supplier: SUPPLIER,
  date_from: "2026-11-01",
  date_to: "2026-11-30",
  trip_total: 16,
  amount_total: "5600.00",
  line_count: 16,
  status: "READY" as const,
  checked_by_name: "Mike",
  checked_at: "2026-11-27T02:00:00Z",
  settled_by_name: null,
  settled_at: null,
};
const SETTLED_ROW = {
  ...READY_ROW,
  id: "st-2",
  number: "CS-PRJ-0001-002",
  status: "SETTLED" as const,
  settled_by_name: "Boss Tan",
  settled_at: "2026-11-28T03:00:00Z",
};

describe("the plain rules (lib/disposal-fees)", () => {
  it("writes amounts as RM with two decimals, a dash when hidden", () => {
    expect(lib.rmText("1050")).toBe("RM 1,050.00");
    expect(lib.rmText(null)).toBe("—");
    expect(lib.rmText(undefined)).toBe("—");
  });

  it("accepts a fee above 0 with at most two decimals", () => {
    expect(lib.isValidFee("350")).toBe(true);
    expect(lib.isValidFee("350.50")).toBe(true);
    expect(lib.isValidFee("0")).toBe(false);
    expect(lib.isValidFee("-5")).toBe(false);
    expect(lib.isValidFee("1.234")).toBe(false);
    expect(lib.isValidFee("")).toBe(false);
  });

  it("adds the ticked amounts in cents, and hides the sum when any is hidden", () => {
    expect(lib.sumAmounts(["0.10", "0.20"])).toBe("0.30");
    expect(lib.sumAmounts(["1050.00", "700.00"])).toBe("1750.00");
    expect(lib.sumAmounts([])).toBe("0.00");
    expect(lib.sumAmounts(["1.00", null])).toBeNull();
  });

  it("「一次只能核对同一个项目、同一个供应商的清运记录」", () => {
    expect(lib.sameProjectAndSupplier([PENDING_ROWS[0]])).toBe(true);
    expect(lib.sameProjectAndSupplier([PENDING_ROWS[0], { ...PENDING_ROWS[0], disposal_id: "d-9" }])).toBe(true);
    expect(lib.sameProjectAndSupplier(PENDING_ROWS)).toBe(false);
    expect(lib.sameProjectAndSupplier([PENDING_ROWS[0], { ...PENDING_ROWS[0], project: { id: "p-2", name: "X" } }])).toBe(false);
  });

  it("locks a job once it is in a settlement", () => {
    expect(lib.settlementLock({ settlement: null })).toBeNull();
    expect(lib.settlementLock({ settlement: { id: "st-1", number: "CS-PRJ-0001-001", status: "READY" } })).toEqual({
      number: "CS-PRJ-0001-001",
    });
  });

  it("keeps the sub-tab in the address and links a settlement to its tab", () => {
    expect(lib.settlementStageOf(null)).toBe("unchecked");
    expect(lib.settlementStageOf("ready")).toBe("ready");
    expect(lib.settlementStageOf("settled")).toBe("settled");
    expect(lib.settlementStageOf("x")).toBe("unchecked");
    expect(lib.disposalSettlementHref({ id: "st-1", status: "READY" })).toBe(
      "/waste-clearance?kind=settlement&stage=ready&settlement=st-1",
    );
    expect(lib.disposalSettlementHref({ id: "st-2", status: "SETTLED" })).toBe(
      "/waste-clearance?kind=settlement&stage=settled&settlement=st-2",
    );
    expect(lib.DISPOSAL_FEES_HREF).toBe("/waste-clearance?kind=garbage&fees=1");
  });

  it("is office only, with 审核及安排垃圾清运 (decision 9: as JB278, the module's own permission)", () => {
    const can = (code: string) => code === "disposal.manage";
    expect(lib.DISPOSAL_SETTLE_PERMISSION).toBe("disposal.manage");
    expect(lib.mayHandleDisposalFees({ is_field_staff: false }, can)).toBe(true);
    expect(lib.mayHandleDisposalFees({ is_field_staff: true }, can)).toBe(false);
    expect(lib.mayHandleDisposalFees({ is_field_staff: false }, () => false)).toBe(false);
    expect(lib.mayHandleDisposalFees(null, can)).toBe(false);
    expect(lib.DISPOSAL_SETTLE_PIN_ACTION).toBe("disposal_settlement.settle");
  });
});

describe("the calls (contract 「接口和资料」)", () => {
  it("reads and sets the fees per supplier", async () => {
    await service.getDisposalFees();
    expect(api.get).toHaveBeenLastCalledWith("/api/disposal-fees/");
    await service.getDisposalFeeHistory("s-1");
    expect(api.get).toHaveBeenLastCalledWith("/api/disposal-fees/history/", { supplier: "s-1" });
    await service.setDisposalFee({ supplier: "s-1", fee_per_trip: "350.00", effective_from: "2026-11-01", note: " 合同 A " });
    expect(api.post).toHaveBeenLastCalledWith("/api/disposal-fees/", {
      supplier: "s-1",
      fee_per_trip: "350.00",
      effective_from: "2026-11-01",
      note: "合同 A",
    });
    await service.setDisposalFee({ supplier: "s-1", fee_per_trip: "350.00", effective_from: "2026-11-01", note: "" });
    expect(api.post).toHaveBeenLastCalledWith("/api/disposal-fees/", {
      supplier: "s-1",
      fee_per_trip: "350.00",
      effective_from: "2026-11-01",
    });
  });

  it("reads 未核对, the settlements, one settlement and the figures with the filters", async () => {
    const filters = { project: "p-1", supplier: "s-1", date_from: "2026-11-01", date_to: "2026-11-30" };
    await service.getDisposalPending(filters);
    expect(api.get).toHaveBeenLastCalledWith("/api/disposal-settlements/pending/", filters);
    await service.getDisposalSettlements("READY", { supplier: "s-1" });
    expect(api.get).toHaveBeenLastCalledWith("/api/disposal-settlements/", { status: "READY", supplier: "s-1" });
    await service.getDisposalSettlement("st-1");
    expect(api.get).toHaveBeenLastCalledWith("/api/disposal-settlements/st-1/");
    await service.getDisposalSettlementSummary({});
    expect(api.get).toHaveBeenLastCalledWith("/api/disposal-settlements/summary/", {});
  });

  it("确认核对 sends the ticked jobs; 结算完毕 carries the PIN checked at 准备结算", async () => {
    await service.createDisposalSettlement(["d-1", "d-3"]);
    expect(api.post).toHaveBeenLastCalledWith("/api/disposal-settlements/", { disposal_ids: ["d-1", "d-3"] });
    await service.settleDisposalSettlement("st-1", "123456");
    expect(api.post).toHaveBeenLastCalledWith("/api/disposal-settlements/st-1/settle/", {}, { signOffPin: "123456" });
    await service.disposalSettlementPdfFile("st-1", "zh", "CS-PRJ-0001-001");
    expect(api.fetchAsFile).toHaveBeenLastCalledWith("/api/disposal-settlements/st-1/pdf/", {
      method: "GET",
      query: { lang: "zh" },
      fallbackFilename: "CS-PRJ-0001-001.pdf",
    });
  });
});

describe("【清运费用设定】 (「按照供应商填写合同约定的每车清运费用…只需填写一次」)", () => {
  const noop = () => undefined;

  it("lists each supplier with its fee, 生效日期, a later fee, and 设定 / 修改 / 修改记录", () => {
    const html = render(
      <FeeTable
        rows={[
          {
            supplier: SUPPLIER,
            current: { id: "f-1", fee_per_trip: "350.00", effective_from: "2026-11-01", set_by_name: "Mike", set_at: "2026-11-01T01:00:00Z", note: "" },
            upcoming: { id: "f-2", fee_per_trip: "380.00", effective_from: "2026-12-01", set_by_name: "Mike", set_at: "2026-11-20T01:00:00Z", note: "" },
            history_count: 2,
          },
          { supplier: { id: "s-2", name: "No Fee Sdn Bhd" }, current: null, upcoming: null, history_count: 0 },
        ]}
        onSet={noop}
        onHistory={noop}
      />,
    );
    const words = text(html);
    expect(words).toContain(zh.jb287.fee.col.supplier);
    expect(words).toContain(zh.jb287.fee.col.fee);
    expect(words).toContain(zh.jb287.fee.col.effective);
    expect(words).toContain("Alam Flora");
    expect(words).toContain(fill(zh.jb287.fee.perTrip, { fee: "350.00" }));
    expect(words).toContain("No Fee Sdn Bhd");
    expect(words).toContain(zh.jb287.fee.none);
    expect(words).toContain(zh.jb287.fee.adjust);
    expect(words).toContain(zh.jb287.fee.set);
    expect(html.split('data-slot="disposal-fee-history"').length - 1).toBe(2);
  });

  it("says what to do when there is no clearance supplier", () => {
    expect(text(render(<FeeTable rows={[]} onSet={noop} onHistory={noop} />))).toContain(zh.jb287.fee.empty);
  });

  it("the window: 每车清运费用 + 生效日期 (today by default) + 备注, the plain help and 修改记录 old → new", () => {
    const source = read("src/components/contractor-ops/disposal-fees.tsx");
    expect(source).toContain("useState(today())");
    expect(source).toMatch(/\[feeOk, t\("fee\.feeLabel"\)\],\s+\[Boolean\(day\), t\("fee\.effectiveFrom"\)\],/);
    expect(source).toContain('t("fee.keepsOld")');
    expect(zh.jb287.fee.keepsOld).toBe("改价从生效日期开始用，以前的记录不变");
    expect(source).toContain('t("fee.col.oldFee")');
    expect(source).toContain('t("fee.col.newFee")');
    expect(source).toContain("entry.previous_fee");
    // Only office accounts that may handle it can press it; other office
    // accounts see it locked with the reason (QA287), the phone never.
    expect(source).toMatch(/if \(!user \|\| user\.is_field_staff\) return null;\s+if \(!mayHandleDisposalFees\(user, can\)\) \{/);
  });

  it("sits beside 【新增申请】 on 垃圾清运 and at the top of 清运结算管理", () => {
    const office = read("src/components/contractor-ops/site-disposal-workspaces.tsx");
    expect(office).toMatch(/\{clearanceKind === "GARBAGE" \? <DisposalFeeButton \/> : null\}\s+\{can\("disposal\.submit"\) \? \(\s+<Button onClick=\{\(\) => setCreating\(true\)\}>/);
    expect(read("src/components/contractor-ops/disposal-settlements.tsx")).toContain("<DisposalFeeButton />");
    // 「无须每次清运重复填写」: the request form has no fee box.
    const create = office.slice(office.indexOf("function CreateDisposalDialog("), office.indexOf("export function ReviewDisposalDialog("));
    expect(create).not.toMatch(/fee/i);
  });
});

describe("清运结算管理 (三–八)", () => {
  it("八: the six figures, and a plain line with the link when a supplier has no fee", () => {
    const html = render(<SettlementFigures filters={{}} />, (qc) =>
      qc.setQueryData(["disposal-settlements", "summary", {}], {
        trip_total: 42,
        weight_total_kg: "8120.50",
        amount_total: "14700.00",
        unchecked_amount: "3500.00",
        ready_amount: "5600.00",
        settled_amount: "5600.00",
        no_fee_count: 3,
      }),
    );
    const words = text(html);
    for (const key of ["trips", "weight", "amount", "unchecked", "ready", "settled"] as const) {
      expect(words).toContain(zh.jb287.settlement.figure[key]);
    }
    expect(words).toContain(fill(zh.jb287.settlement.tripsValue, { count: 42 }));
    expect(words).toContain("8120.50 kg");
    expect(words).toContain("RM 14,700.00");
    expect(words).toContain("RM 3,500.00");
    expect(words).toContain(fill(zh.jb287.settlement.noFeeLine, { count: 3 }));
    // QA287: the link opens the fee window here, on 清运结算管理.
    expect(html).toContain('data-slot="disposal-fee-link"');
    expect(zh.jb287.settlement.figuresHelp).toContain("结算完毕后也不会减少");
    expect(zh.jb287.settlement.figuresHelp).toContain("重量只作统计");
  });

  it("八: amounts hidden (金额查看 off) read as dashes", () => {
    const words = text(
      render(<SettlementFigures filters={{}} />, (qc) =>
        qc.setQueryData(["disposal-settlements", "summary", {}], {
          trip_total: 1,
          weight_total_kg: "10",
          amount_total: null,
          unchecked_amount: null,
          ready_amount: null,
          settled_amount: null,
          no_fee_count: 0,
        }),
      ),
    );
    expect(words).not.toContain("RM");
    expect(words).not.toContain(fill(zh.jb287.settlement.noFeeLine, { count: 0 }));
  });

  it("四: 勾选框｜清运记录编号｜项目名称｜供应商名称｜清运日期｜实际验收车次｜每车费用｜费用金额, 全选 and each", () => {
    const html = render(
      <PendingRowsTable rows={PENDING_ROWS} chosen={new Set(["d-1"])} allChosen onToggle={() => undefined} onToggleAll={() => undefined} />,
    );
    const words = text(html);
    for (const key of ["reference", "project", "supplier", "clearedOn", "trips", "feePerTrip", "feeAmount"] as const) {
      expect(words).toContain(zh.jb287.col[key]);
    }
    expect(words).toContain(zh.jb287.settlement.selectAll);
    expect(html).toContain('data-slot="settlement-select-all"');
    expect(html.split('data-slot="settlement-select-row"').length - 1).toBe(2);
    expect(words).toContain("WC-PRJ-0001-001");
    expect(words).toContain("RM 350.00");
    expect(words).toContain("RM 1,050.00");
    // No fee yet: said, with the way to set it; it cannot be ticked.
    expect(words).toContain(zh.jb287.cannotTick.no_fee);
    expect(html).toMatch(/data-slot="settlement-select-row"[^>]*disabled/);
  });

  it("四: no tick column for a reader who may not check", () => {
    const html = render(<PendingRowsTable rows={PENDING_ROWS} allChosen={false} onToggle={() => undefined} onToggleAll={() => undefined} />);
    expect(html).not.toContain("settlement-select");
  });

  it("四: the filtered sum and the ticked sum are shown apart; 【确认核对】 refuses mixed rows plainly", () => {
    const source = read("src/components/contractor-ops/disposal-settlements.tsx");
    expect(source).toContain('t("settlement.filteredTotal", { amount: rmText(pending.data?.filtered_amount) })');
    expect(source).toContain('t("settlement.tickedTotal", { count: picked.length, amount: rmText(pickedSum) })');
    expect(zh.jb287.settlement.filteredTotal).toBe("筛选范围累计：{amount}");
    expect(zh.jb287.settlement.tickedTotal).toBe("本次勾选：{count} 笔，{amount}");
    expect(source).toContain('disabledReason={mixed ? t("settlement.mixed") : t("settlement.tickFirst")}');
    expect(zh.jb287.settlement.mixed).toBe("一次只能核对同一个项目、同一个供应商的清运记录");
    expect(source).toContain('t("settlement.checkedDone", { number: done.number })');
    // Select all takes only the rows that can be ticked.
    expect(source).toContain("new Set(tickable.map((row) => row.disposal_id))");
  });

  it("五: 结算编号｜项目名称｜供应商名称｜清运日期范围｜清运总车次｜结算总金额｜【准备结算】｜查看、预览及打印", () => {
    const html = render(<SettlementRowsTable rows={[READY_ROW]} status="READY" onOpen={() => undefined} />);
    const words = text(html);
    for (const key of ["settlementNo", "project", "supplier", "dateRange", "tripTotal", "amountTotal"] as const) {
      expect(words).toContain(zh.jb287.col[key]);
    }
    expect(words).toContain("CS-PRJ-0001-001");
    expect(words).toContain(fill(zh.jb287.settlement.tripsValue, { count: 16 }));
    expect(words).toContain("RM 5,600.00");
    expect(html).toContain('data-slot="settlement-prepare"');
    expect(html).toContain('data-slot="settlement-view"');
    expect(words).toContain(zh.fileActions.preview);
    expect(words).toContain(zh.fileActions.print);
    expect(words).not.toContain(zh.fileActions.save);
    // Only a click on the 结算编号 opens its jobs.
    expect(html).toContain('data-slot="settlement-expand"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-slot="settlement-lines"');
  });

  it("六: 结算完毕 shows 结算人 / 结算时间 and 导出, no action button", () => {
    const html = render(<SettlementRowsTable rows={[SETTLED_ROW]} status="SETTLED" onOpen={() => undefined} />);
    const words = text(html);
    expect(words).toContain(zh.jb287.col.settledBy);
    expect(words).toContain(zh.jb287.col.settledAt);
    expect(words).toContain("Boss Tan");
    expect(html).not.toContain('data-slot="settlement-prepare"');
    expect(words).toContain(zh.fileActions.save);
    expect(words).toContain(zh.fileActions.print);
  });

  it("六: 【准备结算】 asks the PIN first, then 【结算完毕】, then 确认", () => {
    const source = read("src/components/contractor-ops/disposal-settlements.tsx");
    expect(source).toContain("await signOffBeforeEditing(DISPOSAL_SETTLE_PIN_ACTION)");
    expect(source).toContain("mutationFn: () => settleDisposalSettlement(row.id, pin)");
    const step1 = text(render(<SettleDialog row={READY_ROW} pin="123456" onClose={() => undefined} />));
    expect(step1).toContain(zh.jb287.settlement.settleGo);
    expect(step1).toContain(fill(zh.jb287.settlement.settleTitle, { number: "CS-PRJ-0001-001" }));
    expect(zh.jb287.settlement.settleAsk).toContain("不能重复结算");
    expect(zh.jb287.settlement.settleAsk).toContain("不能改金额");
    expect(zh.signOff.action.disposal_settlement_settle).toBeTruthy();
  });

  it("六: the phone never sees 准备结算; an office reader without the right sees it locked, saying why", () => {
    reader.phone = true;
    expect(render(<PrepareSettleButton row={READY_ROW} />)).toBe("");
    reader.phone = false;
    reader.perms = new Set(["disposal.view"]);
    const html = render(<PrepareSettleButton row={READY_ROW} />);
    expect(html).toContain("disabled");
    expect(text(html)).toContain(zh.jb287.settlement.noRight);
  });

  it("五 / 七: the lines of a settlement, each 清运记录编号 opening the job with its photos, and the 合计", () => {
    const html = render(
      <SettlementLinesTable
        settlement={{
          ...READY_ROW,
          trip_total: 5,
          amount_total: "1750.00",
          lines: [
            { disposal_id: "d-1", reference_no: "WC-PRJ-0001-001", cleared_on: "2026-11-03", trip_count: 3, fee_per_trip: "350.00", fee_amount: "1050.00", weight_kg: "900" },
            { disposal_id: "d-3", reference_no: "WC-PRJ-0001-003", cleared_on: "2026-11-05", trip_count: 2, fee_per_trip: "350.00", fee_amount: "700.00", weight_kg: null },
          ],
        }}
      />,
    );
    const words = text(html);
    expect(words).toContain(fill(zh.jb287.settlement.lines, { count: 2 }));
    expect(words).toContain(zh.jb287.settlement.linesHelp);
    expect(html.split('data-slot="settlement-open-record"').length - 1).toBe(2);
    expect(words).toContain(zh.jb287.settlement.total);
    expect(words).toContain("RM 1,750.00");
    const source = read("src/components/contractor-ops/disposal-settlements.tsx");
    expect(source).toContain("<DisposalInPlace id={opened} onClose={() => setOpened(null)} />");
  });

  it("七: the A4 结算单 goes through the record file buttons (预览 · 打印 · 导出)", () => {
    const source = read("src/components/contractor-ops/disposal-settlements.tsx");
    expect(source).toContain('omit={row.status === "SETTLED" ? ["share"] : ["save", "share"]}');
    expect(source).toContain("load: () => disposalSettlementPdfFile(row.id, locale, row.number)");
  });

  it("三: no thumbnails, three lists, the top bar's project, only supplier and dates", () => {
    const source = read("src/components/contractor-ops/disposal-settlements.tsx");
    expect(source).not.toContain("photoColumn");
    expect(source).toContain('const STAGES: readonly SettlementStage[] = ["unchecked", "ready", "settled"];');
    expect(source).toContain('useListQuery(["project", "supplier", "date_from", "date_to", "stage"])');
    expect(source).toContain("<SupplierDateFilter");
    expect(source).not.toContain("<ProjectListFilter");
  });

  it("empty lists say what to do", () => {
    expect(zh.jb287.settlement.emptyUnchecked).toContain("确认归档");
    expect(zh.jb287.settlement.emptyReady).toContain("确认核对");
    expect(zh.jb287.settlement.emptySettled).toContain("准备结算");
  });

  it("the no-fee line links to the fee window", () => {
    const html = render(<NoFeeLine count={2} />);
    expect(text(html)).toContain(fill(zh.jb287.settlement.noFeeLine, { count: 2 }));
    expect(text(html)).toContain(zh.jb287.settlement.noFeeLink);
  });
});

describe("垃圾清运 tab: three columns, 「清运费用与结算」, locked reasons (two-way link)", () => {
  const base = {
    cleared_on: "2026-11-03",
    fee_per_trip: "350.00",
    fee_amount: "1050.00",
    trip_count: 3,
    actual_weight_kg: "900",
    amounts_hidden: false,
  };

  it("the record panel: 清运日期, 实际验收车次, 每车费用, 费用金额, 结算状态 and the 结算编号 opening the settlement", () => {
    const html = render(
      <DisposalFeePanel row={{ ...base, fee_state: "ready", settlement: { id: "st-1", number: "CS-PRJ-0001-001", status: "READY" } }} />,
    );
    const words = text(html);
    expect(words).toContain(zh.jb287.panel.title);
    for (const key of ["clearedOn", "trips", "feePerTrip", "feeAmount", "state", "settlementNo"] as const) {
      expect(words).toContain(zh.jb287.panel[key]);
    }
    expect(words).toContain("RM 1,050.00");
    expect(words).toContain(zh.jb287.state.ready);
    expect(html).toContain('href="/waste-clearance?kind=settlement&amp;stage=ready&amp;settlement=st-1"');
    expect(words).toContain(zh.jb287.panel.weightOnly);
  });

  it("an internal job has no fee; a supplier with no fee says so with the link; a running job is marked", () => {
    expect(text(render(<DisposalFeePanel row={{ ...base, fee_state: "internal", settlement: null }} />))).toContain(
      "内部清运，没有清运费用",
    );
    const noFee = render(<DisposalFeePanel row={{ ...base, fee_per_trip: null, fee_amount: null, fee_state: "no_fee", settlement: null }} />);
    expect(text(noFee)).toContain("这个供应商还没有设每车清运费用");
    expect(noFee).toContain('href="/waste-clearance?kind=garbage&amp;fees=1"');
    expect(text(render(<DisposalFeePanel row={{ ...base, fee_state: "running", settlement: null }} />))).toContain(
      zh.jb287.panel.running,
    );
    // 废料处理: nothing.
    expect(render(<DisposalFeePanel row={{ ...base, fee_state: null, settlement: null }} />)).toBe("");
  });

  it("the list cells: 费用金额 (进行中 marked), 结算编号 as a link, 结算状态", () => {
    expect(text(render(<FeeAmountText row={{ fee_state: "running", fee_amount: "700.00" }} />))).toContain(
      `RM 700.00 （${zh.jb287.state.running}）`,
    );
    expect(text(render(<FeeAmountText row={{ fee_state: "internal", fee_amount: null }} />))).toBe("—");
    expect(render(<SettlementNoLink row={{ settlement: { id: "st-2", number: "CS-PRJ-0001-002", status: "SETTLED" } }} />)).toContain(
      "stage=settled&amp;settlement=st-2",
    );
    for (const state of ["unchecked", "ready", "settled", "running", "no_fee", "internal", "not_archived"] as const) {
      expect(text(render(<FeeStateBadge row={{ fee_state: state }} />))).toBe(zh.jb287.state[state]);
    }
  });

  it("the list gains 费用金额｜结算编号｜结算状态 on 垃圾清运 only; the panel sits on the record", () => {
    const office = read("src/components/contractor-ops/site-disposal-workspaces.tsx");
    expect(office).toContain('...(clearanceKind === "GARBAGE"');
    expect(office).toContain('id: "fee_amount"');
    expect(office).toContain('id: "settlement_no"');
    expect(office).toContain('id: "fee_state"');
    expect(office).toContain("<DisposalFeePanel row={row} />");
    // The photo thumbnails stay.
    expect(office).toContain("photoColumn<DisposalRequest>({");
  });

  it("from 确认核对 on: 更正, 更改供应商 and 补录数字 show the reason instead of acting", () => {
    const office = read("src/components/contractor-ops/site-disposal-workspaces.tsx");
    expect(office.split("data-disposal-settlement-locked").length - 1).toBe(3);
    expect(office).toContain('const lockedReason = lock ? settlementWords("locked", lock) : undefined;');
    expect(office).toContain('disabledReason={settlementWords("locked", lock)}');
    expect(fill(zh.jb287.locked, { number: "CS-PRJ-0001-001" })).toBe("这笔清运已经核对，进了结算 CS-PRJ-0001-001，车次和金额不能再改");
    expect(zh.errors.api.disposal_in_settlement).toBe("这笔清运已经核对，进了结算 {settlement_no}，车次和金额不能再改");
  });
});

describe("「全部」 → 清运结算管理 and its old links", () => {
  it("the tabs are 清运结算管理｜垃圾清运｜废料处理｜异常记录; a record link opens the job over 清运结算管理", () => {
    const page = read("src/components/contractor-ops/waste-clearance.tsx");
    expect(page).toContain('const TABS: readonly ClearanceTab[] = ["settlement", "garbage", "scrap", "abnormal"];');
    expect(page).toContain('option === "settlement" ? settlementWords("tab.settlement")');
    expect(page).toContain("{recordId ? <DisposalInPlace id={recordId} onClose={() => setRecordId(null)} /> : null}");
    expect(page).toContain("else if (listHref) router.replace(listHref);");
    expect(zh.jb287.tab.settlement).toBe("清运结算管理");
    // Multi Engine's 「添加资料」 ticks jobs on 垃圾清运 now.
    expect(read("src/lib/pack-collect.ts")).toContain('params: { kind: "garbage" },');
  });
});

describe("the two existing reports (「无须重新建立报表页面」)", () => {
  it("清运与回收报表: 每车费用, 费用金额, 结算编号, 结算状态 worded, in the file too, and the 合计", () => {
    for (const catalogue of [zh, zhTW, en, ms]) {
      for (const column of ["fee_per_trip", "fee_amount", "settlement_no", "settlement_status"] as const) {
        expect(catalogue.contractorReports.column[column], column).toBeTruthy();
      }
    }
    expect(reportValueKey("recycling", "settlement_status", "ready", { record_type: "DISPOSAL" })).toBe("jb287.state.ready");
    expect(reportValueKey("recycling", "settlement_status", "", { record_type: "RECYCLE_ORDER" })).toBeNull();
    const values = reportColumnValues(
      "recycling",
      ["settlement_status"],
      (key) => (key.startsWith("jb287.state.") ? zh.jb287.state[key.slice(12) as keyof typeof zh.jb287.state] : null),
      (namespace) => (namespace === "jb287.state" ? Object.keys(zh.jb287.state) : []),
    );
    expect(values.settlement_status.settled).toBe("结算完毕");
    const html = render(<DisposalFeeTotal fees={{ amount_total: "14700.00", no_fee_count: 2 }} />);
    expect(text(html)).toContain("垃圾清运费用合计：RM 14,700.00");
    expect(text(html)).toContain(fill(zh.jb287.report.noFee, { count: 2 }));
    expect(read("src/components/contractor-ops/contractor-report-workspace.tsx")).toContain(
      "<DisposalFeeTotal fees={report.data.disposal_fees} />",
    );
  });

  it("项目现场费用总览: the 垃圾清运 card says how many have no fee yet; the 「算 0」 note is gone", () => {
    const page = read("src/components/reports/site-cost-overview.tsx");
    expect(page).toContain('tFee("cost.noFee", { count: row.no_fee_count })');
    expect(page).toContain('row.key !== "disposal"');
    for (const catalogue of [zh, zhTW, en, ms]) {
      expect((catalogue.jb259.notAvailable as Record<string, string>).disposal).toBeUndefined();
    }
  });
});

describe("words: four languages, 你 never 您, every refusal worded", () => {
  const keys = (value: unknown, prefix = ""): string[] =>
    typeof value === "object" && value !== null
      ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
      : [prefix];

  it("the jb287 group has the same keys in all four files and never says 您", () => {
    for (const catalogue of [zhTW, en, ms]) {
      expect(keys(catalogue.jb287).sort()).toEqual(keys(zh.jb287).sort());
    }
    for (const catalogue of [zh, zhTW]) {
      expect(JSON.stringify(catalogue.jb287)).not.toContain("您");
    }
  });

  it("every new server refusal, the PIN step and the audit rows have words", () => {
    const codes = [
      "disposal_in_settlement",
      "disposal_fee_duplicate_date",
      "disposal_settlement_mixed",
      "disposal_not_archived",
      "disposal_fee_missing",
      "disposal_settlement_already_settled",
    ] as const;
    const operations = [
      "disposal_fee_set",
      "disposal_settlement_checked",
      "disposal_settlement_settled",
      "disposal_settlement_pdf_previewed",
      "disposal_settlement_pdf_exported",
    ] as const;
    for (const catalogue of [zh, zhTW, en, ms]) {
      const errors = catalogue.errors.api as Record<string, string>;
      const audit = catalogue.audit.operation as Record<string, string>;
      for (const code of codes) expect(errors[code], code).toBeTruthy();
      for (const code of operations) expect(audit[code], code).toBeTruthy();
      expect((catalogue.signOff.action as Record<string, string>).disposal_settlement_settle).toBeTruthy();
      expect(JSON.stringify(codes.map((code) => errors[code]))).not.toContain("您");
    }
  });
});

describe("垃圾清运's own file carries 费用金额｜结算编号｜结算状态", () => {
  it("adds the three columns on 垃圾清运, 结算状态 worded", async () => {
    const { disposalFeeExportColumns } = await import("@/components/contractor-ops/site-disposal-workspaces");
    const words = (key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], zh.jb287) as string;
    const columns = disposalFeeExportColumns(words);
    expect(columns.map((column) => column.key)).toEqual(["fee_amount", "settlement_no", "fee_state"]);
    expect(columns.map((column) => column.label)).toEqual(["费用金额", "结算编号", "结算状态"]);
    expect(columns[2].values).toEqual(zh.jb287.state);
    const office = read("src/components/contractor-ops/site-disposal-workspaces.tsx");
    expect(office).toContain('...(clearanceKind === "GARBAGE" ? disposalFeeExportColumns(feeWords) : []),');
  });
});
