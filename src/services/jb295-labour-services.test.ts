/**
 * JB295: the labour calls go where the contract says, with what it says.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  get: vi.fn(async (...args: unknown[]): Promise<unknown> => (args.length ? {} : {})),
  post: vi.fn(async (...args: unknown[]): Promise<unknown> => ({
    args: args.length, statement_no: "LB-MS001", check_no: "LB-RC001", settlement_no: "LB-ST001", confirmed: [] })),
  download: vi.fn(async () => undefined),
}));

vi.mock("@/services/api-client", async (original) => ({
  ...(await original<typeof import("@/services/api-client")>()),
  api: { get: calls.get, list: calls.get, post: calls.post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  download: calls.download,
  toastSuccess: vi.fn(),
}));

const labour = await import("@/services/labour.service");
const statements = await import("@/services/labour-statement.service");
const recon = await import("@/services/return-check.service");

beforeEach(() => {
  calls.get.mockClear();
  calls.post.mockClear();
  calls.download.mockClear();
});

describe("/api/labour/", () => {
  it("sends only the filters chosen", async () => {
    await labour.getLabourMonth({ project: "p-1", month: "2026-10", company: "", flagged: "1" });
    expect(calls.get).toHaveBeenCalledWith("/api/labour/get_month/", { project: "p-1", month: "2026-10", flagged: "1" });
    await labour.getLabourDays({ project: "p-1", month: "2026-10", person: "user:u-1" });
    expect(calls.get).toHaveBeenLastCalledWith("/api/labour/get_days/", { project: "p-1", month: "2026-10", person: "user:u-1" });
  });

  it("a rate carries only the keys of its scope", async () => {
    await labour.setLabourRate({
      scope: "COMPANY_TRADE",
      person_key: "worker:w-1",
      company_key: "note:HH",
      trade: "operator",
      method: "DAILY",
      unit_price: " 120 ",
      overtime_rate: "",
      effective_from: "2026-10-01",
      note: "",
    });
    expect(calls.post).toHaveBeenCalledWith("/api/labour/set_rate/", {
      scope: "COMPANY_TRADE",
      method: "DAILY",
      unit_price: "120",
      effective_from: "2026-10-01",
      company_key: "note:HH",
      trade: "operator",
    });
    await labour.setLabourRate({
      scope: "PERSON",
      person_key: "user:u-1",
      company_key: "self",
      trade: "x",
      method: "HOURLY",
      unit_price: "15",
      overtime_rate: "20",
      effective_from: "2026-10-01",
      note: "合约",
    });
    expect(calls.post).toHaveBeenLastCalledWith("/api/labour/set_rate/", {
      scope: "PERSON",
      method: "HOURLY",
      unit_price: "15",
      effective_from: "2026-10-01",
      person_key: "user:u-1",
      overtime_rate: "20",
      note: "合约",
    });
  });

  it("「已含在设备租赁费用内」 sends no price; the summary sends only what is chosen", async () => {
    await labour.setLabourRate({
      scope: "TRADE",
      trade: "operator",
      method: "IN_RENTAL",
      unit_price: "120",
      overtime_rate: "20",
      effective_from: "2026-10-01",
    });
    expect(calls.post).toHaveBeenLastCalledWith("/api/labour/set_rate/", {
      scope: "TRADE",
      method: "IN_RENTAL",
      effective_from: "2026-10-01",
      trade: "operator",
    });
    await labour.getLabourSummary({ project: "p-1", month_from: "2026-09", month_to: "2026-10", group: "company", trade: "" });
    expect(calls.get).toHaveBeenLastCalledWith("/api/labour/get_summary/", {
      project: "p-1",
      month_from: "2026-09",
      month_to: "2026-10",
      group: "company",
    });
    await labour.exportLabourSummary({ format: "xlsx", title: "x", columns: [], query: { project: "p-1", group: "trade" } }, "合计");
    expect(calls.download).toHaveBeenLastCalledWith(
      "/api/labour/export_summary/",
      expect.objectContaining({ method: "POST", body: expect.objectContaining({ total_label: "合计" }) }),
    );
  });

  it("adjust, confirm, unconfirm, normal hours and the exports", async () => {
    const day = { project: "p-1", person_key: "worker:w-1", date: "2026-10-03", worked: true, normal_hours: "8", overtime_hours: "1", reason: "x" };
    await labour.adjustLabourDay(day);
    expect(calls.post).toHaveBeenLastCalledWith("/api/labour/adjust_day/", day);
    await labour.confirmLabourMonth({ project: "p-1", month: "2026-10", people: ["worker:w-1", "user:u-1"] });
    expect(calls.post).toHaveBeenLastCalledWith("/api/labour/confirm_month/", {
      project: "p-1",
      month: "2026-10",
      people: ["worker:w-1", "user:u-1"],
    });
    await labour.unconfirmLabourMonth({ project: "p-1", month: "2026-10", person_key: "worker:w-1", reason: "错了" });
    expect(calls.post).toHaveBeenLastCalledWith("/api/labour/unconfirm_month/", {
      project: "p-1",
      month: "2026-10",
      person_key: "worker:w-1",
      reason: "错了",
    });
    await labour.setLabourNormalHours({ project: "p-1", daily_hours: "9", effective_from: "2026-10-01" });
    expect(calls.post).toHaveBeenLastCalledWith("/api/labour/set_normal_hours/", {
      project: "p-1",
      daily_hours: "9",
      effective_from: "2026-10-01",
    });
    await labour.exportLabourMonth({ format: "xlsx", title: "人工费用", columns: [], query: { project: "p-1", month: "2026-10" } }, "合计");
    expect(calls.download).toHaveBeenCalledWith(
      "/api/labour/export_month/",
      expect.objectContaining({ method: "POST", query: { project: "p-1", month: "2026-10" }, body: expect.objectContaining({ total_label: "合计" }) }),
    );
  });
});

describe("/api/labour-statements/ and the shared 核对 / 结算 (kind LABOUR)", () => {
  it("statements: list by tab, one by id, generate, 作废", async () => {
    calls.get.mockResolvedValueOnce({ rows: [], counts: { pending: 0, checked: 0, settled: 0, all: 0 } });
    const list = await statements.getLabourStatements({ state: "checked", company: "self", month: "2026-10" });
    expect(calls.get).toHaveBeenCalledWith("/api/labour-statements/get_statements/", {
      state: "checked",
      company: "self",
      month: "2026-10",
    });
    expect(list.counts?.all).toBe(0);
    await statements.getLabourStatement("st-1");
    expect(calls.get).toHaveBeenLastCalledWith("/api/labour-statements/st-1/get_statement/");
    await statements.createLabourStatement({ project: "p-1", company_key: "s-1", month: "2026-10" });
    expect(calls.post).toHaveBeenLastCalledWith("/api/labour-statements/create_statement/", {
      project: "p-1",
      company_key: "s-1",
      month: "2026-10",
    });
    await statements.cancelLabourStatement("st-1", "错了");
    expect(calls.post).toHaveBeenLastCalledWith("/api/labour-statements/st-1/cancel_statement/", { id: "st-1", reason: "错了" });
  });

  it("the companies waiting to be checked become the picker's parties", async () => {
    calls.get.mockResolvedValueOnce({
      rows: [{ company_key: "note:HH", company_name: "HH", statements: [{ id: "a" }, { id: "b" }] }],
    });
    const parties = await recon.getPendingReturnSuppliers("p-1", "LABOUR");
    expect(calls.get).toHaveBeenCalledWith("/api/labour-statements/get_pending_companies/", { project: "p-1" });
    expect(parties.results).toEqual([{ id: "note:HH", name: "HH", count: 2 }]);
    expect(recon.reconBase("LABOUR")).toBe("/api/labour-statements/");
  });

  it("核对: company_key + the statements + 凭证; 结算: the checks", async () => {
    await recon.createReturnCheck({
      kind: "LABOUR",
      supplier: "self",
      returns: ["st-1", "st-2"],
      voucherNo: " V-1 ",
      note: "",
      files: [new File(["x"], "v.pdf")],
    });
    const [url, body] = calls.post.mock.calls.at(-1) as [string, FormData];
    expect(url).toBe("/api/labour-statements/create_check/");
    expect(body.get("company_key")).toBe("self");
    expect(body.getAll("statements")).toEqual(["st-1", "st-2"]);
    expect(body.get("voucher_no")).toBe("V-1");
    expect(body.get("kind")).toBe(null);
    expect(body.getAll("files")).toHaveLength(1);

    await recon.createSettlement({ kind: "LABOUR", checks: ["c-1"], voucherNo: "P-1", note: "", files: [] });
    const [settleUrl, settleBody] = calls.post.mock.calls.at(-1) as [string, FormData];
    expect(settleUrl).toBe("/api/labour-statements/create_settlement/");
    expect(settleBody.getAll("checks")).toEqual(["c-1"]);
    expect(settleBody.get("kind")).toBe(null);

    await recon.getReturnCheck("c-1", "LABOUR");
    expect(calls.get).toHaveBeenLastCalledWith("/api/labour-statements/c-1/get_check/");
    await recon.getSettleable("LABOUR", "p-1");
    expect(calls.get).toHaveBeenLastCalledWith("/api/labour-statements/get_settleable/", { project: "p-1" });
  });
});
