/**
 * 报表中心's filter bar (Lucas 2026-10-10, 图11: 「报表中心那里全部可以加多一点
 * filter，就是可以筛选想要看/想要导出的报表，不然现在的filter太少了」).
 *
 * Rendered to static markup (the runner has no DOM): each report draws its
 * own filters with their captions and choices, and the report asks the server
 * for exactly the filters in the address - its own, never another report's.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentProjectState } from "@/components/providers/current-project-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import messages from "@/messages/zh.json";

const nav = vi.hoisted(() => ({ search: "", pathname: "/reports/contractor/progress" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => nav.pathname,
}));

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: {
      id: "u-office",
      full_name: "Lim",
      portal: "MSE_TRACE",
      account_type: "TENANT",
      features: ["report_center"],
      permissions: ["report.view", "report.export"],
      is_superuser: false,
      company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" },
    },
    can: () => true,
    refresh: async () => {},
    isLoading: false,
  }),
  CURRENT_USER_KEY: ["auth", "me"],
}));

const { CurrentProjectValueProvider } = await import(
  "@/components/providers/current-project-provider"
);
const { ContractorReportWorkspace } = await import(
  "@/components/contractor-ops/contractor-report-workspace"
);
const { ReportClearButton } = await import("@/components/reports/report-filter-bar");

const ALL_PROJECTS: CurrentProjectState = {
  active: false,
  projectId: "",
  projects: [],
  canChooseAll: true,
  loading: false,
  setProjectId: () => {},
};

function render(node: React.ReactNode, seed: [readonly unknown[], unknown][] = []) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  for (const [key, data] of seed) client.setQueryData(key, data);
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <CurrentProjectValueProvider value={ALL_PROJECTS}>{node}</CurrentProjectValueProvider>
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  const keys = client.getQueryCache().getAll().map((query) => query.queryKey);
  return { html, keys };
}

function reportFilters(keys: readonly (readonly unknown[])[]) {
  const key = keys.find((row) => row[0] === "contractor-reports" && row[1] === "report");
  return key?.[2] as Record<string, string | undefined>;
}

beforeEach(() => {
  nav.search = "";
});

describe("each report's own filters", () => {
  it("equipment: machine, supplier and direction, worded, and the chosen one shown", () => {
    nav.pathname = "/reports/contractor/equipment";
    nav.search = "?equipment=e1&direction=EXIT";
    const { html } = render(<ContractorReportWorkspace reportType="equipment" />, [
      [
        ["contractor-reports", "filters", "equipment", ""],
        {
          report_type: "equipment",
          filters: ["equipment", "supplier", "direction"],
          options: {
            equipment: [{ value: "e1", label: "EQ-1 - Tower crane" }],
            supplier: [{ value: "s1", label: "Crane Hire Sdn Bhd" }],
            direction: [{ value: "EXIT", label: "EXIT" }],
          },
        },
      ],
      [["contractor-reports", "levels", "equipment", "", ""], []],
    ]);
    const column = messages.contractorReports.column;
    for (const caption of [
      column.equipment,
      messages.contractorReports.filter.supplier,
      column.direction,
      messages.reportSelector.level.equipment,
      messages.contractorReports.filter.keyword,
    ]) {
      expect(html).toContain(caption);
    }
    // The chosen machine by its name, the chosen direction in words.
    expect(html).toContain("EQ-1 - Tower crane");
    expect(html).toContain(messages.contractorOps.direction.EXIT);
    expect(html).toContain(messages.contractorReports.filter.keywordPlaceholder.equipment);
    expect(html).toContain(messages.reports.filter.clear);
  });

  it("asks for the address's filters - its own only - for the preview", () => {
    nav.pathname = "/reports/contractor/progress";
    nav.search = "?status=CONFIRMED&actor=u1&keyword=trusses&direction=EXIT&record_type=DISPOSAL";
    const { keys } = render(<ContractorReportWorkspace reportType="progress" />);
    const asked = reportFilters(keys);
    expect(asked).toMatchObject({
      report_type: "progress",
      status: "CONFIRMED",
      actor: "u1",
      keyword: "trusses",
    });
    // Equipment's and recycling's filters left in the address are not sent.
    expect(asked.direction).toBeUndefined();
    expect(asked.record_type).toBeUndefined();
    expect(keys).toContainEqual(["contractor-reports", "filters", "progress", ""]);
  });

  it("names the person filter after the report's person column", () => {
    nav.pathname = "/reports/contractor/safety";
    const { html } = render(<ContractorReportWorkspace reportType="safety" />);
    expect(html).toContain(messages.contractorReports.column.responsible_person);
    expect(html).toContain(messages.contractorReports.column.severity);
  });
});

describe("清除筛选", () => {
  it("says why it cannot be pressed when nothing is set", () => {
    const idle = render(<ReportClearButton active={false} onClear={() => {}} />).html;
    expect(idle).toContain("disabled");
    const set = render(<ReportClearButton active onClear={() => {}} />).html;
    expect(set).not.toContain("disabled=\"\"");
  });
});
