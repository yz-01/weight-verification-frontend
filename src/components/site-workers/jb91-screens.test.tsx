/**
 * JB91 (客户 10-31) on screen: 「施工工种」 on the form, the roster and the
 * import table, and 「按工种汇总」 above the roster.
 *
 * Rendered to static markup (the runner has no DOM) with the queries filled
 * in, the way the other screen tests here do.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { SiteWorkerTrade, TradeSummary } from "@/interfaces/site-workers";
import {
  NO_TRADE,
  clock24,
  nextTradeFilter,
  tradeLabel,
  tradeSummaryQuery,
} from "@/lib/site-workers";
import { BULK_FIELDS, blankRows, editRow } from "@/lib/site-workers-bulk";
import messages from "@/messages/zh.json";

const reader: { search: string } = { search: "" };

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Office", is_field_staff: false, timezone: "Asia/Kuala_Lumpur" },
    can: () => true,
  }),
}));
vi.mock("@/components/providers/current-project-provider", () => ({
  useCurrentProject: () => ({ active: false, projectId: null, setProjectId: () => {} }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(reader.search),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/site-workers",
}));
vi.mock("@/components/ui/dialog", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open = true, children }: { open?: boolean; children?: React.ReactNode }) =>
      open ? <div data-dialog>{children}</div> : null,
    DialogContent: Pass,
    DialogDescription: Pass,
    DialogFooter: Pass,
    DialogHeader: Pass,
    DialogTitle: Pass,
  };
});

const { WorkerFormDialog } = await import("@/components/site-workers/worker-form");
const { BulkTable } = await import("@/components/site-workers/bulk-table");
const { TradeSummaryPanel, tradeCards } = await import("@/components/site-workers/trade-summary");
const { useListQuery } = await import("@/hooks/use-list-query");

const words = messages.siteWorkers;

function render(node: React.ReactNode, cache: [readonly unknown[], unknown][] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [key, data] of cache) client.setQueryData(key, data);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const trades: SiteWorkerTrade[] = [
  { id: "t-1", code: "REBAR", name: "钢筋工", sort_order: 0, is_active: true, built_in: true },
  { id: "t-2", code: "ELECTRICIAN", name: "电工", sort_order: 1, is_active: true, built_in: true },
  { id: "t-9", code: "", name: "焊工", sort_order: 5, is_active: true, built_in: false },
];

const summary: TradeSummary = {
  results: trades.map((row, index) => ({
    ...row,
    value: row.id,
    registered: [12, 0, 3][index],
    on_site: [8, 0, 1][index],
  })),
  no_trade: { value: NO_TRADE, registered: 4, on_site: 2 },
  registered: 19,
  on_site: 11,
  updated_at: "2026-10-31T06:05:00Z",
};

beforeEach(() => {
  reader.search = "";
});

describe("trade helpers (JB91)", () => {
  it("a built-in trade in the reader's language, one the company added by its name", () => {
    const builtIn = (code: string) => `[${code}]`;
    expect(tradeLabel({ code: "REBAR", name: "钢筋工" }, builtIn)).toBe("[REBAR]");
    expect(tradeLabel({ code: "", name: "焊工" }, builtIn)).toBe("焊工");
  });

  it("a card pressed chooses its trade; pressed again it lets go", () => {
    expect(nextTradeFilter(undefined, "t-1")).toBe("t-1");
    expect(nextTradeFilter("t-1", "t-1")).toBeUndefined();
    expect(nextTradeFilter("t-1", NO_TRADE)).toBe(NO_TRADE);
  });

  it("the counts follow the roster's project, company and search - not the trade, 在场状态 or page", () => {
    expect(
      tradeSummaryQuery({ project: "p", company: "c", search: "ali", trade: "t-1", status: "ON_SITE", page: 2, active: "0" }),
    ).toEqual({ project: "p", company: "c", search: "ali" });
  });

  it("「最后更新」 is on a 24-hour clock", () => {
    expect(clock24("2026-10-31T06:05:00Z", "Asia/Kuala_Lumpur")).toBe("14:05");
    expect(clock24("2026-10-31T15:30:00Z", "Asia/Kuala_Lumpur")).toBe("23:30");
  });

  it("one card a trade, then 「未填工种」, the chosen one marked", () => {
    const cards = tradeCards(summary, "t-9", (row) => row.name ?? "", "未填工种");
    expect(cards.map((card) => [card.label, card.registered, card.onSite, card.active])).toEqual([
      ["钢筋工", 12, 8, false],
      ["电工", 0, 0, false],
      ["焊工", 3, 1, true],
      ["未填工种", 4, 2, false],
    ]);
  });
});

function Panel() {
  const list = useListQuery(["project", "company", "status", "active", "trade"]);
  return <TradeSummaryPanel list={list} />;
}

describe("「按工种汇总」 (JB91-3, JB91-4)", () => {
  it("登记 N 人 · 在场 M 人 per trade, 未填工种, and 最后更新 on a 24-hour clock", () => {
    const html = render(<Panel />, [[["site-workers", "trade-summary", {}], summary]]);
    expect(html).toContain(words.tradeSummary.title);
    expect(html).toContain("登记 19 人 · 在场 11 人");
    expect(html).toContain(words.trade.builtIn.REBAR);
    expect(html).toContain("焊工");
    expect(html).toContain(words.trade.none);
    expect(html).toContain("登记 12 人");
    expect(html).toContain("在场 8 人");
    expect(html).toMatch(/最后更新：[^<]*14:05/);
    expect(html).not.toMatch(/aria-pressed="true"/);
  });

  it("the trade in the address is the card pressed", () => {
    reader.search = "trade=t-1";
    const html = render(<Panel />, [[["site-workers", "trade-summary", {}], summary]]);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>)[\s\S])*钢筋工/);
  });
});

describe("新增 / 编辑人员 (JB91-1)", () => {
  it("「施工工种」 is optional, a dropdown with 「新增工种」 beside it", () => {
    const html = render(<WorkerFormDialog open defaultProject="p-1" onClose={() => {}} onSaved={() => {}} />, [
      [["site-workers", "company-options", "list", ""], []],
      [["site-workers", "trades", "p-1"], trades],
    ]);
    expect(html).toContain(words.field.trade);
    expect(html).toContain(words.trade.add);
    expect(html).toContain(`aria-label="${words.field.trade}"`);
  });
});

describe("批量新增人员 table (JB91-2)", () => {
  it("has a 「施工工种」 column, last, as in the Excel template", () => {
    expect(BULK_FIELDS[BULK_FIELDS.length - 1]).toBe("trade_text");
  });

  it("a row that only gives a worker on the roster a trade says so, not red", () => {
    const row = { ...editRow(blankRows(1)[0], "trade_text", "模板工"), id: "r-1" };
    const html = render(
      <BulkTable
        rows={[row]}
        shown={[0]}
        problems={{}}
        fills={{ "r-1": { name: "Ali" } }}
        companyPlaceholder="Kuat"
        focus={null}
        onRows={() => {}}
        onFocusDone={() => {}}
        onNeedMoreRows={() => {}}
        onMoveTo={() => {}}
        onRemove={() => {}}
        onCheck={() => {}}
      />,
    );
    expect(html).toContain(words.bulk.fillsTrade.replace("{name}", "Ali"));
    expect(html).toContain(">模板工</textarea>");
    expect(html).not.toContain("bg-destructive/5");
  });
});
