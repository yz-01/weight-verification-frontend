/**
 * 总部大屏 (Lucas 2026-10-10): 「左边那个位置看能不能去掉轮毂或者弄小一点」 and
 * 「大屏那里可以加多一点真实数据，看起来更厉害更好看」.
 *
 * The company block in the top-left corner is small and unlit, the panels
 * show no scrollbars and the left column's bars carry no halo, and the space
 * that frees holds more of the company's real numbers - every figure here is
 * one the server sent, none is drawn from nothing.
 *
 * Rendered to static markup (the runner has no DOM); the map is Leaflet and
 * is replaced, and the queries are seeded as the server would answer them.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  HeadquartersOverview,
  HeadquartersWallExtras,
} from "@/interfaces/headquarters";
import messages from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dashboard/wall",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u1", portal: "MSE_TRACE", company_name: "Alpha Builders", branding: null },
    can: () => true,
  }),
}));
vi.mock("@/components/shared/location-map", () => ({ LocationMap: () => null }));
vi.mock("@/components/layout/theme-choice", () => ({ ThemeSegmented: () => null }));
vi.mock("@/components/dashboard/headquarters-photos", () => ({
  usePhotoOpener: () => ({ open: () => {}, sheet: null }),
}));

const { HeadquartersWall } = await import("@/components/dashboard/headquarters-wall");

const counts = {
  today_records: 0,
  on_site_now: 0,
  pending_approvals: 0,
  open_tasks: 0,
  overdue_tasks: 0,
  overdue_rectifications: 0,
  material_receipts_today: 0,
  today_records_by_kind: {},
  waste_dispatches: { records: 0, trips: 0, weighed_kg: "0.00", weighed_records: 0 },
  site_disposals: { records: 0, completed: 0, trips: 0, weight_kg: "0.00", with_weight: 0 },
};

const overview = {
  date: "2026-10-10",
  generated_at: "2026-10-10T04:00:00Z",
  all_projects: true,
  totals: {
    ...counts,
    projects: 1,
    active_projects: 1,
    app_on_site: 0,
    gate_on_site: 0,
    today_records: 4,
    today_records_by_kind: { MATERIAL_RECEIPT: 4 },
  },
  projects: [
    {
      ...counts,
      id: "p1",
      code: "TOWER",
      name: "Alpha Tower",
      status: "ACTIVE",
      address: "",
      city: "",
      state: "",
      latitude: null,
      longitude: null,
      has_location: false,
      latest_photo: null,
      today_records: 4,
    },
  ],
  other: counts,
  has_other: false,
  without_location: [],
} as unknown as HeadquartersOverview;

const extras: HeadquartersWallExtras = {
  date: "2026-10-10",
  generated_at: "2026-10-10T04:00:00Z",
  week: [
    { date: "2026-10-04", delivered: 2, rejected: 0 },
    { date: "2026-10-05", delivered: 0, rejected: 0 },
    { date: "2026-10-06", delivered: 5, rejected: 1 },
    { date: "2026-10-07", delivered: 3, rejected: 0 },
    { date: "2026-10-08", delivered: 6, rejected: 0 },
    { date: "2026-10-09", delivered: 4, rejected: 2 },
    { date: "2026-10-10", delivered: 4, rejected: 0 },
  ],
  acceptance: { pending: 9, accepted: 15, rejected: 3 },
  top_suppliers: [
    { id: "s1", name: "Kim Seng Hardware", deliveries: 11 },
    { id: "s2", name: "Ready Mix Sdn Bhd", deliveries: 7 },
  ],
  hazards: { open: 5, overdue: 2 },
  approvals_by_source: { MATERIAL_REQUEST: 4, SUNDRY_CLAIM: 2 },
  equipment: { on_site: 12, maintenance: 1 },
  clearance_month: {
    since: "2026-10-01",
    waste_dispatches: { records: 6, trips: 5, weighed_kg: "18250.00", weighed_records: 5 },
    site_disposals: { records: 3, completed: 2, trips: 4, weight_kg: "1700.50", with_weight: 2 },
  },
};

function renderWall() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["contractor-dashboard", "headquarters"], overview);
  client.setQueryData(["contractor-dashboard", "headquarters-wall-photos"], {
    count: 0,
    next: null,
    previous: null,
    results: [],
  });
  client.setQueryData(["contractor-dashboard", "headquarters-wall-extras"], extras);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <HeadquartersWall />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const wall = messages.headquarters.wall;

describe("总部大屏's top-left corner and panels (「弄小一点」)", () => {
  it("keeps the company block small and unlit", () => {
    const html = renderWall();
    const brand = /<div[^>]*data-wall-brand[^>]*>[\s\S]*?<\/div><\/div>/.exec(html)?.[0] ?? "";
    expect(brand).toContain("Alpha Builders");
    expect(brand).toContain("size-8");
    expect(brand).not.toContain("size-12");
    expect(brand).not.toContain("shadow-glow");
  });

  it("shows no scrollbars on the wall or its photo stream", () => {
    const html = renderWall();
    expect(html).toMatch(/data-headquarters-wall[^>]*class="[^"]*\[scrollbar-width:none\]/);
  });

  it("draws the left column's bars without a halo", () => {
    const html = renderWall();
    const status = /<section[^>]*aria-label="实时项目状态"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    expect(status).toContain("Alpha Tower");
    expect(status).not.toContain("dark:shadow-");
  });
});

describe("总部大屏 shows more of the company's real numbers (「加多一点真实数据」)", () => {
  const panel = (html: string, name: string) =>
    new RegExp(`<section[^>]*data-wall-panel="${name}"[\\s\\S]*?</section>`).exec(html)?.[0] ?? "";

  it("adds the week's deliveries, hazards and waiting approvals under the map", () => {
    const html = renderWall();
    const week = panel(html, "week");
    expect(week).toContain(wall.weekDeliveries);
    // Seven days, each with its own count.
    expect(week.match(/title="2026-10-\d\d · /g)).toHaveLength(7);
    const hazards = panel(html, "hazards");
    expect(hazards).toContain(wall.openHazards);
    expect(hazards).toContain("其中逾期 2");
    // Open and overdue only: 严重程度 is gone from the system (2026-10-10).
    expect(hazards).toContain(wall.hazardsOpen);
    expect(hazards).toContain(wall.hazardsOverdue);
    const approvals = panel(html, "approvals");
    expect(approvals).toContain(messages.contractorDashboard.approvals.source.MATERIAL_REQUEST);
    expect(approvals).toContain(messages.contractorDashboard.approvals.source.SUNDRY_CLAIM);
  });

  it("adds acceptance, machines, suppliers and this month's waste beside it", () => {
    const html = renderWall();
    // 15 accepted of 18 decided; the 9 not yet looked at are not a failure.
    expect(panel(html, "acceptance")).toContain("83%");
    expect(panel(html, "acceptance")).toContain("已验收 15 · 待验收 9 · 退回 3");
    expect(panel(html, "equipment")).toContain(">12<");
    expect(panel(html, "suppliers")).toContain("Kim Seng Hardware");
    expect(panel(html, "suppliers")).toContain("11 次");
    const clearance = panel(html, "clearance");
    expect(clearance).toContain(messages.headquarters.figures.wasteDispatches);
    expect(clearance).toContain(messages.headquarters.figures.siteDisposals);
    expect(clearance).toContain("18,250");
    expect(clearance).toContain("1,700.5");
  });
});
