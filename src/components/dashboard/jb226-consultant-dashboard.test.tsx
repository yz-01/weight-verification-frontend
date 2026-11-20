/**
 * JB226 (客户 11-19 事项 6): the consultant's 仪表板 is the project manager's
 * 项目仪表板, drawn from what the server sent him.
 *
 * 「请沿用现有项目经理仪表板的设计及布局…所有显示内容必须根据总部给予顾问的权限自动呈现，
 * 没有授权的模块、卡片及相关数据一律隐藏。不需要重新设计一套仪表板，直接沿用现有项目仪表板，
 * 根据顾问权限控制显示内容即可。」
 *
 * One component: a part is drawn only when the payload carries it, so the
 * project manager's page - which always carries every part - is as before.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";
import type { ProjectOverview } from "@/interfaces/headquarters";
import { isRouteAllowed, visibleNavigation } from "@/lib/navigation";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import messages from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/dashboard",
}));

const auth: { user: unknown } = { user: null };
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: auth.user, can: () => false, refresh: async () => {} }),
}));

const { ProjectReference } = await import("@/components/dashboard/project-reference");
const { CompanyBanner } = await import("@/components/dashboard/company-banner");
const { ConsultantHome } = await import("@/components/dashboard/consultant-home");

const PROJECT = { id: "p1", code: "PRJ-0001", name: "示范商业大厦一期", latitude: null, longitude: null };

function consultant(features: string[], extra: Record<string, unknown> = {}) {
  return {
    full_name: "林顾问",
    account_type: "CONSULTANT",
    portal: "MSE_TRACE",
    role_name: null,
    company_name: null,
    branding: { company_name: "示范建筑有限公司" },
    features: [...features, "consultant_menu"],
    consultant_projects: [
      { grant_id: "g1", project_id: "p1", project_code: "PRJ-0001", project_name: "示范商业大厦一期", is_current: true },
    ],
    active_project: { project_id: "p1", project_name: "示范商业大厦一期", company_id: "c1", company_name: "示范建筑有限公司" },
    ...extra,
  };
}

function render(node: React.ReactNode, data?: ProjectOverview | Error) {
  // `retryOnMount: false`: a query left in error is drawn as the error, not re-asked.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } },
  });
  const key = ["contractor-dashboard", "project-overview", "p1"];
  if (data instanceof Error) {
    const query = client.getQueryCache().build(client, { queryKey: key });
    query.setState({ ...query.state, status: "error", error: data, fetchStatus: "idle" });
  } else if (data) {
    client.setQueryData(key, data);
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const dashboardOnly: ProjectOverview = {
  date: "2026-11-20",
  project: PROJECT,
  cards: { pending_total: 0 },
  pending: [],
};

const withDeliveries: ProjectOverview = {
  ...dashboardOnly,
  cards: { receipts_today_t: "6.00", receipts_yesterday_t: "0.00", receipts_month_t: "6.00", receipts_total_t: "6.00", pending_total: 2 },
  latest_receipts: [
    { id: "r1", receipt_no: "MI-PRJ-0001-001", business_at: "2026-11-20T01:15:00Z", supplier: "Sunway", material: "C30", category: "Concrete", quantity: "6.000", unit: "TONNE", acceptance_status: "ACCEPTED" },
  ],
  material_mix: [{ name: "Concrete", tonnes: "6.00" }],
  pending: [
    { feature: "consultant_applications", count: 1 },
    { feature: "package_reviews", count: 1 },
  ],
  photos: [
    { kind: "MATERIAL_RECEIPT", record_id: "r1", reference: "MI-PRJ-0001-001", captured_at: "2026-11-20T01:15:00Z", thumbnail_url: "https://cdn.example/t.webp", url: "https://cdn.example/f.jpg", photo_count: 1 },
  ],
};

const everything: ProjectOverview = {
  ...withDeliveries,
  progress: { today: 1, month: 4, total: 16, weighted_progress: "35.00" },
  schedule: {
    active_plans: 1, tasks: 3, counted_tasks: 3, summary_rows_excluded: 0, total_weight: "3.00",
    planned_progress: "50.00", actual_progress: "40.00", variance: "-10.00", delayed_tasks: 1,
    completed_tasks: 0, due_next_7_days: 2,
  } as ProjectOverview["schedule"],
  safety: { pending_rectification: 1, in_progress: 2, overdue: 1, completed: 3 },
};

const projectManager: ProjectOverview = {
  date: "2026-11-20",
  project: PROJECT,
  cards: {
    receipts_today_t: "128.50", receipts_yesterday_t: "100.00", waste_today_t: "0.00", waste_yesterday_t: "0.00",
    receipts_month_t: "500.00", receipts_total_t: "24560.80", waste_month_t: "0.00", waste_total_t: "0.00",
    equipment_total: 28, equipment_on_site: 18, equipment_off_site: 10, pending_total: 8,
  },
  latest_receipts: withDeliveries.latest_receipts,
  material_mix: [{ name: "Concrete", tonnes: "300.00" }],
  waste_mix: [],
  pending: [{ feature: "material_receipts", count: 8 }],
  photos: withDeliveries.photos,
};

describe("the consultant's 仪表板 is the project dashboard, cut by what the server sent", () => {
  it("with only 仪表板: 待处理事项 and the map, nothing of a module not given", () => {
    auth.user = consultant(["dashboard"]);
    const html = render(<ProjectReference project="p1" consultant />, dashboardOnly);
    expect(html).toContain("待处理事项");
    expect(html).toContain("目前没有需要您处理的事项。");
    for (const absent of ["今日收货（吨）", "今日废料（吨）", "设备总数", "最新材料进场记录", "物料分类统计", "废料分类统计", "最新现场照片记录", "工程进度", "吨数只算称重的"]) {
      expect(html).not.toContain(absent);
    }
    // The map takes the whole row when there are no deliveries beside it.
    expect(html).not.toContain("xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]");
  });

  it("with 材料进场: the two receipt cards, 最新材料进场记录 and the mix - never waste or machines", () => {
    auth.user = consultant(["dashboard", "item_materials_in"]);
    const html = render(<ProjectReference project="p1" consultant />, withDeliveries);
    expect(html).toContain("今日收货（吨）");
    expect(html).toContain("累计收货（吨）");
    expect(html).toContain("MI-PRJ-0001-001");
    expect(html).toContain("物料分类统计");
    expect(html).not.toContain("今日废料（吨）");
    expect(html).not.toContain("设备总数");
    expect(html).not.toContain("废料分类统计");
    // His own work, each opening the page where he acts.
    expect(html).toContain("/consultant-applications?project=p1&amp;needs_action=1");
    expect(html).toContain(messages.nav.submodule.packageReviews);
    // 「查看全部」 under the photos is 工程照片墙, not the 报表中心 photo report.
    expect(html).toContain('href="/photo-timeline"');
    expect(html).not.toContain("/reports/contractor/photos");
  });

  it("工程进度 and 整改／EHS come with their ticks, from the project manager's own figures", () => {
    auth.user = consultant(["dashboard", "item_materials_in", "item_progress_records", "item_progress_schedule", "safety"]);
    const html = render(<ProjectReference project="p1" consultant />, everything);
    expect(html).toContain("data-progress-panel");
    expect(html).toContain("施工进度记录");
    expect(html).toContain("整体进度");
    expect(html).toContain(messages.contractorDashboard.scheduleSummary.planned);
    expect(html).toContain("data-safety-panel");
    expect(html).toContain(messages.contractorDashboard.safetySummary.pending_rectification);
    expect(html).toContain("/hazard-rectifications?project=p1&amp;overdue=1");
  });

  it("with 雨天记录 and not 施工进度 the counts are named rain records", () => {
    auth.user = consultant(["dashboard", "item_progress_rain"]);
    const html = render(<ProjectReference project="p1" consultant />, { ...dashboardOnly, progress: { today: 0, month: 1, total: 2 } });
    expect(html).toContain("雨天记录");
    expect(html).not.toContain("施工进度记录");
    expect(html).not.toContain("整体进度");
  });

  it("access changed while the page was open: he is told so and how to go on", () => {
    auth.user = consultant(["dashboard"]);
    const html = render(<ProjectReference project="p1" consultant />, new ApiError("refused", 403));
    expect(html).toContain("data-consultant-refused");
    expect(html).toContain(messages.projectReference.consultantRefused);
    expect(html).toContain("重新载入");
  });
});

describe("the project manager's page is as before", () => {
  it("six cards, deliveries beside the map, three panels, the 报表中心 photo link", () => {
    auth.user = null;
    const html = render(<ProjectReference project="p1" />, projectManager);
    for (const card of ["今日收货（吨）", "今日废料（吨）", "累计收货（吨）", "累计废料（吨）", "设备总数", "待处理事项"]) {
      expect(html).toContain(card);
    }
    expect(html).toContain("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6");
    expect(html).toContain("grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]");
    expect(html).toContain("grid grid-cols-1 gap-4 lg:grid-cols-3");
    expect(html).toContain("吨数只算称重的");
    expect(html).toContain("/reports/contractor/photos?project=p1");
    expect(html).toContain("needs_action=1");
    expect(html).not.toContain("data-progress-panel");
    expect(html).not.toContain("data-safety-panel");
  });
});

describe("the banner and the page around it", () => {
  it("has no 「公司总部 / 项目」 switch for a consultant, and 通知 only with 通知中心", () => {
    auth.user = consultant(["dashboard"]);
    let html = render(<CompanyBanner scope="project" projectName="PRJ-0001 · 示范商业大厦一期" />);
    expect(html).toContain("示范建筑有限公司");
    expect(html).toContain("当前项目：PRJ-0001 · 示范商业大厦一期");
    expect(html).not.toContain('href="/dashboard/project"');
    expect(html).not.toContain('href="/notifications"');
    auth.user = consultant(["dashboard", "notifications"]);
    html = render(<CompanyBanner scope="project" projectName="PRJ-0001 · 示范商业大厦一期" />);
    expect(html).toContain('href="/notifications"');
    expect(html).not.toContain('href="/dashboard/project"');
  });

  it("keeps the switch for the project manager", () => {
    auth.user = { full_name: "PM", account_type: "TENANT", portal: "MSE_TRACE", role_name: null, company_name: "示范建筑有限公司", branding: {}, features: ["dashboard"] };
    const html = render(<CompanyBanner scope="project" projectName="PRJ-0001 · 示范商业大厦一期" />);
    expect(html).toContain('href="/dashboard/project"');
    expect(html).toContain('href="/notifications"');
  });

  it("says why there is nothing: no project granted, or none chosen yet", () => {
    auth.user = consultant(["dashboard"], { consultant_projects: [], active_project: null });
    expect(render(<ConsultantHome />)).toContain("您目前没有获授权的项目。请联系建筑商总部开通。");
    auth.user = consultant(["dashboard"], { active_project: null });
    expect(render(<ConsultantHome />)).toContain(messages.consultantHome.chooseProject);
    auth.user = consultant(["dashboard"]);
    const html = render(<ConsultantHome />, dashboardOnly);
    expect(html).toContain('data-consultant-home="project"');
    expect(html).toContain("当前项目：PRJ-0001 · 示范商业大厦一期");
  });

  it("opens 工程照片墙 to a consultant under 仪表板, and to nobody else without dashboard.view", () => {
    const mine = ["dashboard", "consultant_menu"];
    expect(isRouteAllowed("MSE_TRACE", mine, "/photo-timeline", ["project.view"])).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", ["safety", "consultant_menu"], "/photo-timeline", ["project.view"])).toBe(false);
    expect(isRouteAllowed("MSE_TRACE", ["dashboard"], "/photo-timeline", ["project.view"])).toBe(false);
    expect(isRouteAllowed("MSE_TRACE", ["dashboard"], "/photo-timeline", ["dashboard.view"])).toBe(true);
    const hrefs = visibleNavigation("MSE_TRACE", mine, ["project.view"]).flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs).toContain("/photo-timeline");
  });

  it("speaks every new line in all four languages, zh-TW in traditional characters", () => {
    for (const catalogue of [zhTW, en, ms]) {
      expect(Object.keys(catalogue.consultantHome).sort()).toEqual(Object.keys(messages.consultantHome).sort());
      for (const key of ["noPendingMine", "progress", "progressRecords", "rainRecords", "overall", "schedule", "consultantRefused", "reload", "safety"] as const) {
        expect(catalogue.projectReference[key]).toBeTruthy();
      }
    }
    expect(zhTW.consultantHome.noProjects).toContain("獲授權");
    expect(zhTW.projectReference.consultantRefused).toContain("總部");
  });
});
