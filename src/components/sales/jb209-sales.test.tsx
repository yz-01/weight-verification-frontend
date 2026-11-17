/**
 * JB209 (Lucas 11-16 audit), sales & commission - B-P3-1, B-P3-5, X-2, the
 * Part B usability items, and JB209-17 (Lucas 11-16: 「做一个设置画面」 for
 * 销售区域, reversing D-083 for sales only).
 *
 * The runner has no DOM: rendered to static markup with the queries answered
 * from the cache, or read from the source.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import type { CommissionPayout, Salesperson, Territory } from "@/interfaces/sales";
import zh from "@/messages/zh.json";

const reader = vi.hoisted(() => ({ codes: new Set<string>() }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-admin", company_type: null, is_platform_staff: true },
    can: (code: string) => reader.codes.has(code),
  }),
}));
const api = vi.hoisted(() => ({ post: vi.fn(), success: vi.fn(), refusal: vi.fn() }));
vi.mock("@/services/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api-client")>()),
  api: { post: api.post, get: vi.fn(), list: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  toastSuccess: api.success,
  toastRefusal: api.refusal,
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { SalesAdminWorkspace, PAYOUT_TARGETS, salesCoverage, territoryPayload } = await import(
  "@/components/sales/sales-admin-workspace"
);
const { calculateTeamPayouts, skippedReasons } = await import("@/services/sales.service");
const { publishTranslator } = await import("@/lib/i18n-runtime");

const SRC = path.resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(path.join(SRC, relative), "utf8").replace(/\r\n/g, "\n");
const workspace = read("components/sales/sales-admin-workspace.tsx");
const sectionPage = read("app/(dashboard)/sales/[section]/page.tsx");
const words = zh.adminSales;

const MANAGER = ["sales.view", "sales.manage", "sales_commission.view", "sales_commission.manage", "sales_commission.approve"];
const FINANCE = ["sales.view", "sales_commission.view", "sales_commission.manage"];

function page<T>(results: T[], count = results.length) {
  return { pages: [{ count, page: 1, page_size: 100, total_pages: Math.ceil(count / 100), results }], pageParams: [1] };
}
const all = <T,>(results: T[]) => ({ count: results.length, page: 1, page_size: 100, total_pages: 1, results });

function area(extra: Partial<Territory>): Territory {
  return {
    id: "t-1", salesperson: "s-1", salesperson_name: "Ali", name: "北马", scope: "STATES", states: ["PENANG", "KEDAH"],
    is_exclusive: true, effective_from: "2026-01-01", effective_to: null, is_current: true, created_at: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

function render(section: Parameters<typeof SalesAdminWorkspace>[0]["section"], seed: Parameters<typeof renderDetail>[1], codes = MANAGER) {
  reader.codes = new Set(codes);
  return renderDetail(<SalesAdminWorkspace section={section} />, seed);
}

describe("JB209-17 销售区域 has its own screen", () => {
  it("the page no longer sends 销售区域 to the partners' areas", () => {
    expect(sectionPage).not.toContain('redirect("/partners/territories")');
    expect(sectionPage).toMatch(/new Set<SalesAdminSection>\(\[[^\]]*"territories"/);
  });

  it("lists each area: 全国, or the state names", () => {
    const html = render("territories", (client) => {
      client.setQueryData(["sales-territories", "paged"], page([
        area({}),
        area({ id: "t-2", name: "全马", scope: "NATIONAL", states: [], salesperson_name: "Mei" }),
      ], 150));
      client.setQueryData(["salespeople", "options"], all([]));
    });
    expect(html).toContain("槟城, 吉打");
    expect(html).toContain(`>${words.scope.NATIONAL}<`);
    expect(html).toContain(words.action.addTerritory);
    expect(html).toContain(zh.pagedList.loadMore);
  });

  it("without sales.manage there is nothing to press", () => {
    const html = render("territories", (client) => {
      client.setQueryData(["sales-territories", "paged"], page([area({})]));
      client.setQueryData(["salespeople", "options"], all([]));
    }, FINANCE);
    expect(html).not.toContain(words.action.addTerritory);
    expect(html).not.toContain(`title="${words.action.editTerritory}"`);
  });

  it("an empty page says what to do", () => {
    const html = render("territories", (client) => {
      client.setQueryData(["sales-territories", "paged"], page([]));
      client.setQueryData(["salespeople", "options"], all([]));
    });
    expect(html).toContain(words.territory.empty);
  });

  it("全国 sends no states; 指定州属 sends the ticked ones", () => {
    const form = { salesperson: "s-1", name: "x", scope: "NATIONAL" as const, states: ["PENANG"], is_exclusive: true, effective_from: "2026-01-01", effective_to: "" };
    expect(territoryPayload(form)).toMatchObject({ scope: "NATIONAL", states: [], effective_to: null });
    expect(territoryPayload({ ...form, scope: "STATES" })).toMatchObject({ scope: "STATES", states: ["PENANG"] });
  });

  it("全国 only for a current national area; nobody set up is 未设定", () => {
    expect(salesCoverage([])).toBe("NONE");
    expect(salesCoverage([area({ scope: "NATIONAL", states: [] })])).toBe("NATIONAL");
    expect(salesCoverage([area({ scope: "NATIONAL", states: [], is_current: false })])).toBe("NONE");
    expect(salesCoverage([area({}), area({ id: "t-3", states: ["PENANG", "PERLIS"] })])).toEqual(["PENANG", "KEDAH", "PERLIS"]);
  });

  it("the people table says 未设定, not 全国, for a person with no area", () => {
    const person = { id: "s-1", code: "S-1", full_name: "Ali", phone: "", email: "", sales_role: "EXECUTIVE", territories: [], is_active: true, joined_on: "2026-01-01" } as unknown as Salesperson;
    const html = render("people", (client) => {
      client.setQueryData(["salespeople", "admin", "paged"], page([person]));
      client.setQueryData(["salespeople", "all"], all([person]));
      client.setQueryData(["commission-schemes", "options"], all([]));
    });
    expect(html).toContain(`>${words.scope.none}<`);
    expect(html).not.toContain(`>${words.scope.NATIONAL}<`);
  });
});

describe("JB209-15 佣金规则 edits only the formula (B-P3-1)", () => {
  it("the name is fixed with where to change it, and the description is hidden", () => {
    expect(workspace).toContain('const nameElsewhere = mode === "rules" && Boolean(initial);');
    expect(workspace).toContain("disabled={nameElsewhere}");
    expect(workspace).toContain('hint={nameElsewhere ? t("field.nameInSchemes") : undefined}');
    expect(workspace).toContain("{!nameElsewhere && (");
  });
});

describe("JB209-15 sales terms show their text and who confirmed (B-P3-5)", () => {
  it("each version has 查看, opening the text and the confirmations", () => {
    const html = render("terms", (client) => {
      client.setQueryData(["sales-terms", "paged"], page([{ id: "v-1", code: "TERMS", version: 2, title: "2026 条款", body: "第一条", status: "ACTIVE", effective_from: "2026-01-01", acknowledgement_count: 3 }]));
      client.setQueryData(["salespeople", "options"], all([]));
    });
    expect(html).toContain(`${words.action.view}</button>`);
    expect(workspace).toContain("getTermsAcknowledgements({ ...paging, terms: terms.id })");
    expect(workspace).toContain('<p className="mt-1 whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm">');
  });
});

describe("JB209-16 sales buttons follow the permission each action needs", () => {
  const payout = (state: string) => ({
    id: state, salesperson_code: "S-1", salesperson_name: "Ali", period_start: "2026-10-01", period_end: "2026-10-31", scheme_name: "A",
    saas_revenue: "0", platform_commission: "0", gross_amount: "10", adjustment: "0", net_amount: "10", currency: "MYR", state,
  }) as unknown as CommissionPayout;
  const settlements = (codes: string[]) => render("settlements", (client) => {
    client.setQueryData(["commission-payouts", "paged"], page([payout("DRAFT"), payout("PAID"), payout("CANCELLED")]));
  }, codes);

  it("处理 only on a row with somewhere to go, and only for an approver", () => {
    expect(PAYOUT_TARGETS.PAID).toBeUndefined();
    expect(PAYOUT_TARGETS.CANCELLED).toBeUndefined();
    const manager = settlements(MANAGER);
    expect(manager.match(new RegExp(`${words.action.process}</button>`, "g"))).toHaveLength(1);
    expect(settlements(FINANCE)).not.toContain(`${words.action.process}</button>`);
  });

  it("Finance does not see 新增销售人员 / 新增条款版本; 应付佣金 points to 佣金结算", () => {
    const seed = (client: QueryClient) => {
      client.setQueryData(["salespeople", "admin", "paged"], page([]));
      client.setQueryData(["salespeople", "all"], all([]));
      client.setQueryData(["commission-schemes", "options"], all([]));
      client.setQueryData(["sales-terms", "paged"], page([]));
      client.setQueryData(["salespeople", "options"], all([]));
      client.setQueryData(["commission-payouts", "paged"], page([]));
    };
    expect(render("people", seed, FINANCE)).not.toContain(words.action.addPerson);
    expect(render("people", seed, MANAGER)).toContain(words.action.addPerson);
    expect(render("terms", seed, FINANCE)).not.toContain(words.action.addTerms);
    const payouts = render("payouts", seed, FINANCE);
    expect(payouts).toContain('href="/sales/settlements"');
    expect(payouts).toContain(words.action.goToSettlements);
    expect(payouts).toContain(words.action.calculate);
  });

  it("客户归属 prints words and dates, not CONTRACTOR / SELANGOR / ISO", () => {
    const html = render("assignments", (client) => {
      client.setQueryData(["customer-assignments", "paged"], page([{ id: "c-1", company: "co-1", company_code: "C-1", company_name: "Bina", company_type: "CONTRACTOR", salesperson: "s-1", salesperson_code: "S-1", salesperson_name: "Ali", supervisor_name: null, state: "SELANGOR", won_on: "2026-11-05" }]));
      client.setQueryData(["customer-assignments", "all"], all([]));
      client.setQueryData(["salespeople", "options"], all([]));
      client.setQueryData(["companies", "sales-assignment-options"], all([]));
    });
    expect(html).toContain(">建筑商<");
    expect(html).toContain(">雪兰莪<");
    expect(html).not.toContain(">2026-11-05<");
  });

  it("rule boxes carry names, not only placeholders", () => {
    expect(workspace).toContain('<FieldWrapper label={t("column.basis")}>');
    expect(workspace).toContain("<FieldWrapper key={key} label={t(`custom.${key}`)}>");
    expect(workspace).not.toContain('placeholder={t("column.rate")}');
  });

  it("团队业绩 names its period", () => {
    expect(workspace).toContain('t("performance.period", {');
    expect(words.performance.period).toBe("统计期间：{start} 至 {end}");
  });

  it("no list asks for 200 or 500 any more (X-2)", () => {
    expect(workspace).not.toMatch(/page_size:\s*(200|500)/);
  });
});

describe("JB209-16 计算佣金 says what it did", () => {
  publishTranslator("zh", zh);

  it("counts what was made", async () => {
    api.post.mockResolvedValueOnce({ created: 3, skipped: {} });
    await calculateTeamPayouts();
    expect(api.success).toHaveBeenCalledWith("sales.toast.payoutsCalculated", { count: 3 });
  });

  it("when nothing was made, says why in words", async () => {
    api.post.mockResolvedValueOnce({ created: 0, skipped: { already_settled: 2, nothing_earned: 1 } });
    await calculateTeamPayouts();
    expect(api.refusal).toHaveBeenCalledWith("sales.toast.nothingCalculated", {
      reasons: "2 位这一期的佣金已经批准过、1 位这一期没有赚到佣金",
    });
  });

  it("an unknown reason is still worded", () => {
    expect(skippedReasons({ something_new: 4 })).toBe("4 位因其他原因没有计算");
  });
});
