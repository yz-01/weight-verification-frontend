/**
 * JB298 + JB300 (客户 11-28d 事项 1、3).
 *
 * 事项 1: 「应该在 Multi Engine → Progress Claim 页面完善核对与结算流程……待核对 /
 * 已核对 / 已结算 / 全部 Claim。资料包审批完成并归档后，进入待核对，核对金额及上传
 * 凭证后再进行结算。报表中心负责显示记录、金额及结算状态」.
 *
 * 事项 3: 「请保留用户已选择的期数，除非用户主动修改或清除筛选」「切换页面再返回时，
 * 开始日期又自动恢复为11月1日……请同时修复两个页面的日期筛选保留问题」.
 *
 * The runner has no DOM: pure helpers, static markup and the source text.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/evidence-packages",
  useSearchParams: () => new URLSearchParams("type=PROGRESS_CLAIM&settle=pending"),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  CURRENT_USER_KEY: ["auth", "me"],
  useAuth: () => ({
    user: { id: "u-1", full_name: "mike", is_field_staff: false, account_type: "TENANT" },
    can: () => true,
    refresh: async () => {},
  }),
}));
vi.mock("@/hooks/use-sees-amounts", () => ({ useSeesAmounts: () => true }));

const { ClaimSettleTable, ClaimSettleTabs, claimSettleTabOf } = await import(
  "@/components/contractor-ops/claim-settlements"
);
const { ClaimRowsTable, claimAmountChanged, claimAmountValue } = await import(
  "@/components/contractor-ops/return-checks"
);
const { keptFiltersKey, readKeptFilters, restoredQuery, writeKeptFilters } = await import("@/lib/kept-filters");
const { reportValueKey } = await import("@/lib/report-preview");
const { reconBase } = await import("@/services/return-check.service");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function render(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const CLIENT_CLAIM = {
  id: "pkg-7",
  package_no: "PKG-PRJ-0003-007",
  name: "contrator claim",
  package_type: "PROGRESS_CLAIM",
  state: "CONFIRMED",
  project: "p-3",
  project_name: "PUTRA_MAS",
  created_at: "2026-11-13T05:00:00Z",
  completed_at: "2026-11-27T18:14:00Z",
  approved_amount: "77650.00",
  claim_amount: "80000.00",
  item_count: 4,
  returned_count: 0,
  claim_info: { period: "2026-09-01", subcontractor_name: "Piling Sub Sdn Bhd", category_name: "Subcontractor Claim" },
  claim_settlement: {
    state: "CHECKED",
    check_id: "c-1",
    check_no: "CL-RC001",
    settlement_id: null,
    settlement_no: "",
    checked_amount: "70000.00",
    checked_reason: "Retention held",
  },
} as unknown as import("@/interfaces/contractor-ops").EvidencePackageRow;

describe("JB298 the four tabs and their lists", () => {
  it("待核对 | 已核对 | 已结算 | 全部 Claim, today's list by default", () => {
    const html = text(render(<ClaimSettleTabs tab="all" onChange={() => undefined} />));
    for (const word of ["待核对", "已核对", "已结算", "全部 Claim"]) expect(html).toContain(word);
    expect(claimSettleTabOf(null)).toBe("all");
    expect(claimSettleTabOf("pending")).toBe("pending");
    expect(claimSettleTabOf("junk")).toBe("all");
  });

  it("an empty 待核对 says plainly why", () => {
    const html = text(
      render(
        <ClaimSettleTable tab="pending" rows={[]} onOpen={() => undefined} onOpenCheck={() => undefined} onOpenSettlement={() => undefined} />,
      ),
    );
    expect(html).toContain("现在没有待核对的 Claim。资料包审批完成并归档后，会自动出现在这里。");
  });

  it("a checked claim shows both amounts, the reason, its dates and its check number", () => {
    const html = text(
      render(
        <ClaimSettleTable
          tab="checked"
          rows={[CLIENT_CLAIM]}
          onOpen={() => undefined}
          onOpenCheck={() => undefined}
          onOpenSettlement={() => undefined}
        />,
      ),
    );
    for (const word of [
      "PKG-PRJ-0003-007", "Piling Sub Sdn Bhd", "2026-09", "申请日期", "审核归档日期", "77650.00", "70000.00",
      "批准 77650.00 → 核对 70000.00", "Retention held", "已核对", "CL-RC001",
    ]) {
      expect(html).toContain(word);
    }
  });

  it("the 核对 pick list starts the 核对金额 at the 批准金额 and asks why once changed", () => {
    const row = {
      id: "pkg-7", package_no: "PKG-PRJ-0003-007", name: "contrator claim", project: "p-3", project_name: "PUTRA_MAS",
      claim_period: "2026-09-01", category_name: "", subcontractor: "s-1", subcontractor_name: "Piling",
      created_at: "2026-11-13T05:00:00Z", completed_at: "2026-11-27T18:14:00Z", claim_amount: "80000.00",
      approved_amount: "77650.00", approved_amount_reason: "", settle_state: "PENDING" as const,
    };
    const untouched = render(<ClaimRowsTable rows={[row]} edits={{}} onEdit={() => undefined} />);
    expect(untouched).toContain('value="77650.00"');
    expect(untouched).not.toContain("claim-checked-reason");
    const changed = render(
      <ClaimRowsTable rows={[row]} edits={{ "pkg-7": { amount: "70000", reason: "" } }} onEdit={() => undefined} />,
    );
    expect(changed).toContain("claim-checked-reason");
    expect(text(changed)).toContain("批准 77650.00 → 核对 70000");
    expect(claimAmountValue("70,000.50")).toBe(70000.5);
    expect(claimAmountValue("-1")).toBeNull();
    expect(claimAmountValue("1.234")).toBeNull();
    expect(claimAmountChanged(row, { amount: "77650", reason: "" })).toBe(false);
    expect(claimAmountChanged(row, { amount: "70000", reason: "" })).toBe(true);
  });

  it("the calls go to the claim settlements and the report words the status", () => {
    expect(reconBase("CLAIM")).toBe("/api/claim-settlements/");
    const service = read("src/services/return-check.service.ts");
    expect(service).toContain('"/api/claim-settlements/create_check/"');
    expect(service).toContain('"/api/claim-settlements/create_settlement/"');
    expect(reportValueKey("claims", "claim_settle_state", "SETTLED", {})).toBe("jb298.state.SETTLED");
  });
});

describe("JB300 filters that stay", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
      dispatchEvent: () => true,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("a choice is kept per person and comes back on a bare address", () => {
    writeKeptFilters("multi-engine", "u-1", { type: "PROGRESS_CLAIM", period: "2026-09", subcontractor: "" });
    expect(store.get(keptFiltersKey("multi-engine", "u-1"))).toBe('{"type":"PROGRESS_CLAIM","period":"2026-09"}');
    expect(readKeptFilters("multi-engine", "u-2", ["period"])).toEqual({});
    const kept = readKeptFilters("multi-engine", "u-1", ["type", "period"]);
    // A menu click opens the bare address: the 期数 comes back.
    expect(restoredQuery(new URLSearchParams(""), ["type", "period"], kept)).toBe("type=PROGRESS_CLAIM&period=2026-09");
    // A link that names a filter wins.
    expect(restoredQuery(new URLSearchParams("period=2026-10"), ["type", "period"], kept)).toBeNull();
    // Other parameters stay beside it.
    expect(restoredQuery(new URLSearchParams("package=x"), ["type", "period"], kept)).toBe(
      "package=x&type=PROGRESS_CLAIM&period=2026-09",
    );
  });

  it("【清除筛选】 empties what was kept; no storage is not an error", () => {
    writeKeptFilters("site-cost-overview", "u-1", { date_from: "2026-09-01", date_to: "2026-11-28" });
    writeKeptFilters("site-cost-overview", "u-1", {});
    expect(store.has(keptFiltersKey("site-cost-overview", "u-1"))).toBe(false);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => undefined,
      },
      dispatchEvent: () => true,
    });
    expect(readKeptFilters("site-cost-overview", "u-1", ["date_from"])).toEqual({});
    expect(() => writeKeptFilters("site-cost-overview", "u-1", { date_from: "2026-09-01" })).not.toThrow();
  });

  it("both pages keep their filters and wait for them before asking for amounts", () => {
    const multi = read("src/components/contractor-ops/multi-engine.tsx");
    expect(multi).toContain('export const MULTI_ENGINE_KEPT = ["type", "period", "claim_category", "subcontractor", "settle"]');
    expect(multi).toContain('useKeptFilters("multi-engine", MULTI_ENGINE_KEPT)');
    expect(multi).toContain("enabled: ready,");
    expect(multi).not.toContain('const [period, setPeriod] = useState("")');
    const overview = read("src/components/reports/site-cost-overview.tsx");
    expect(overview).toContain('useKeptFilters("site-cost-overview", ["date_from", "date_to"])');
    expect(overview).toContain("enabled: kept.ready &&");
    const report = read("src/components/contractor-ops/contractor-report-workspace.tsx");
    expect(report).toContain('useKeptFilters(reportType === "claims" ? "report-claims" : null, ["date_from", "date_to"])');
  });
});

describe("JB298 words", () => {
  it("every jb298 word is in the four languages and the UI says 你", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      value && typeof value === "object"
        ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix];
    const zhKeys = keys((zh as Record<string, unknown>).jb298).sort();
    for (const other of [zhTW, en, ms]) {
      expect(keys((other as Record<string, unknown>).jb298).sort()).toEqual(zhKeys);
    }
    expect(JSON.stringify((zh as Record<string, unknown>).jb298)).not.toContain("您");
    expect(JSON.stringify((zhTW as Record<string, unknown>).jb298)).not.toContain("您");
    const card = (zh as unknown as { jb298: { cost: { notCounted: string } } }).jb298.cost.notCounted;
    expect(card.replace("{amount}", "RM 77,650.00")).toBe("还有 RM 77,650.00 未结算，不算在内");
  });
});
