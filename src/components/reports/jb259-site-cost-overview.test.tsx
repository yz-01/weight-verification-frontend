/**
 * JB259 (客户 11-24b 事项 6, 图 10): 报表中心 「项目现场费用总览」.
 *
 * - six cards (项目总费用 + the five sources), the donut's legend with shares,
 *   the module table with 查看明细, the monthly trend and the quick links;
 * - 查看明细 opens the source's own report with the same project and dates
 *   (杂费报销 at its approved claims, which is what the amount counts);
 * - a source with no money field says so instead of showing a made-up price;
 * - the menu lists the page; words in four languages.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import type { SiteCostOverview as Overview } from "@/services/site-cost-overview.service";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "user-1", account_type: "TENANT" }, can: () => true }),
}));
vi.mock("@/components/reports/report-selector", () => ({ ReportSelector: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/reports/site-cost-overview",
  useSearchParams: () => new URLSearchParams("project=p1&date_from=2026-09-01&date_to=2026-11-24"),
}));

const { SiteCostOverview, monthRows, rm, share } = await import("@/components/reports/site-cost-overview");
const { siteCostReportHref, SITE_COST_SOURCES } = await import("@/services/site-cost-overview.service");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const DATA: Overview = {
  project: "p1",
  date_from: "2026-09-01",
  date_to: "2026-11-24",
  total_amount: "2659900.00",
  sources: [
    { key: "material_cost", amount: "1256400.00", available: true, share: "47.2" },
    { key: "equipment_rental", amount: "458000.00", available: true, share: "17.2" },
    { key: "progress_claim", amount: "732000.00", available: true, share: "27.5" },
    { key: "sundry_claims", amount: "87500.00", available: true, share: "3.3" },
    // JB287: 垃圾清运 has its amount (每车清运费用 × 实际验收车次), and two jobs
    // whose supplier has no fee yet.
    { key: "disposal", amount: "1050.00", available: true, share: "0.0", no_fee_count: 2 },
  ],
  months: [
    {
      month: "2026-09",
      date_from: "2026-09-01",
      date_to: "2026-09-30",
      sources: [
        { key: "material_cost", amount: "400000.00" },
        { key: "equipment_rental", amount: "150000.00" },
        { key: "progress_claim", amount: "200000.00" },
        { key: "sundry_claims", amount: "32000.00" },
        { key: "disposal", amount: "0.00" },
      ],
      total_amount: "782000.00",
    },
  ],
};

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(
    ["site-cost-overview", { project: "p1", date_from: "2026-09-01", date_to: "2026-11-24" }],
    DATA,
  );
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <SiteCostOverview />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("项目现场费用总览", () => {
  it("has the client's six cards, the shares, the module table and the quick links", () => {
    const html = render();
    expect(html).toContain(zh.jb259.title);
    expect(html).toContain("RM 2,659,900.00");
    for (const key of SITE_COST_SOURCES) {
      // JB295: 人工费用, the sixth source, has its words in its own group.
      expect(html).toContain(key === "labour" ? zh.jb295.cost.source : zh.jb259.source[key]);
      expect(html).toContain(key === "labour" ? zh.jb295.cost.report : zh.jb259.report[key]);
    }
    expect(html).toContain("RM 1,256,400.00");
    expect(html).toContain("47.2%");
    expect(html).toContain("1,256,400.00");
    expect(html).toContain(zh.jb259.detail);
    expect(html).toContain(zh.jb259.share);
    expect(html).toContain(zh.jb259.trend);
    expect(html).toContain(zh.jb259.links);
    expect(html).toContain("100%");
    // JB287: 垃圾清运's amount, the jobs with no fee yet, and no 「没有金额栏…算 0」.
    expect(html).toContain("RM 1,050.00");
    expect(html).toContain(zh.jb287.cost.noFee.replace("{count}", "2"));
    expect(html).not.toContain("没有金额栏");
    expect(JSON.stringify(zh.jb259)).not.toContain("没有金额栏");
    // JB295: 人工费用 is the sixth source card.
    expect(html.split('data-slot="cost-card"').length - 1).toBe(6);
  });

  it("查看明细 opens each source's own report with the same project and dates", () => {
    const filters = { project: "p1", date_from: "2026-09-01", date_to: "2026-11-24" };
    expect(siteCostReportHref("material_cost", filters)).toBe(
      "/reports/material-cost?project=p1&date_from=2026-09-01&date_to=2026-11-24",
    );
    expect(siteCostReportHref("equipment_rental", filters)).toMatch(/^\/reports\/contractor\/equipment\?/);
    expect(siteCostReportHref("progress_claim", filters)).toMatch(/^\/reports\/contractor\/claims\?/);
    expect(siteCostReportHref("sundry_claims", filters)).toContain("status=CONFIRMED");
    expect(siteCostReportHref("disposal", filters)).toMatch(/^\/reports\/contractor\/recycling\?/);
    const html = render();
    expect(html).toContain("/reports/contractor/equipment?project=p1&amp;date_from=2026-09-01&amp;date_to=2026-11-24");
  });

  it("formats and stacks the months", () => {
    expect(rm(null)).toBe("—");
    expect(rm("458000")).toBe("RM 458,000.00");
    expect(share("17.2")).toBe("17.2%");
    expect(monthRows(DATA)).toEqual([
      { month: "2026-09", total: 782000, material_cost: 400000, equipment_rental: 150000, progress_claim: 200000, sundry_claims: 32000, disposal: 0 },
    ]);
  });

  it("is in the report centre menu, words in four languages", () => {
    const nav = readFileSync(path.join(process.cwd(), "src/lib/navigation.ts"), "utf8");
    expect(nav).toMatch(/"nav\.submodule\.siteCostOverview",\s*"\/reports\/site-cost-overview"/);
    const keys = (value: unknown, prefix = ""): string[] =>
      typeof value === "object" && value !== null
        ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix];
    for (const catalogue of [zhTW, en, ms]) {
      expect(keys(catalogue.jb259).sort()).toEqual(keys(zh.jb259).sort());
      expect(catalogue.nav.submodule.siteCostOverview).toBeTruthy();
    }
    expect(JSON.stringify(zh.jb259)).not.toContain("您");
  });
});
