/**
 * J32: the head-office dashboard as the client's reference, on real data.
 * 「较昨日」 only where yesterday is counted; no weather when none was read;
 * each project's latest photo with what its record is; 在场人数 by who is
 * there; 快捷入口 only what the reader may open.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { HeadquartersOverview } from "@/interfaces/headquarters";
import messages from "@/messages/zh.json";

const can = vi.fn((code: string) => code !== "report.view");
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { company_preferences: { dashboard_title: "", dashboard_subtitle: "" }, branding: {} },
    can,
  }),
}));
vi.mock("@/components/providers/current-project-provider", () => ({
  useCurrentProject: () => ({ active: false, projectId: null }),
}));

const {
  HeadquartersHero,
  HeadquartersKpis,
  HeadquartersPresenceSplit,
  HeadquartersQuickLinks,
  HeadquartersSiteActivity,
} = await import("@/components/dashboard/headquarters-reference");

const counts = {
  today_records: 7, on_site_now: 12, pending_approvals: 3, open_tasks: 0, overdue_tasks: 0,
  overdue_rectifications: 0, material_receipts_today: 2, today_records_by_kind: {},
  waste_dispatches: { records: 0, trips: 0, weighed_kg: "0" },
  site_disposals: { records: 0, trips: 0, weight_kg: "0" },
};

const DATA = {
  date: "2026-10-21",
  generated_at: "2026-10-21T02:00:00Z",
  all_projects: true,
  totals: {
    ...counts, projects: 2, active_projects: 2, app_on_site: 5,
    gate_on_site: 7, gate_by_type: { WORKER: 6, VISITOR: 1 },
    yesterday: { today_records: 4, material_receipts_today: 2 },
  },
  projects: [
    {
      ...counts, id: "p1", code: "P-1", name: "Puchong 工地", status: "ACTIVE", address: "", city: "", state: "Selangor",
      latitude: null, longitude: null, has_location: false,
      latest_photo: {
        id: "a1", image: "https://cdn.example/a1.jpg", captured_at: "2026-10-21T01:12:00Z", project_id: "p1",
        project: "Puchong 工地", photographer: "张伟", record_kind: "MATERIAL_RECEIPT", record_id: "r1",
        headline: { title: "钢筋", quantity: "20.000", unit: "TONNE" },
      },
    },
    {
      ...counts, id: "p2", code: "P-2", name: "Kajang 项目", status: "ACTIVE", address: "", city: "", state: "Selangor",
      latitude: null, longitude: null, has_location: false, latest_photo: null,
    },
  ],
  other: counts,
  has_other: false,
  without_location: [],
} as unknown as HeadquartersOverview;

function render(node: React.ReactNode, weather: unknown = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["contractor-dashboard", "weather"], weather);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("the head-office dashboard (J32)", () => {
  it("says the reference's title, with the date and no weather when none was read", () => {
    const html = render(<HeadquartersHero date="2026-10-21" />);
    expect(html).toContain("让老板从看报表变成看现场");
    expect(html).toContain("总公司视图");
    expect(html).toContain("星期三");
    expect(html).not.toContain("data-weather");
  });

  it("shows the weather it read", () => {
    const html = render(<HeadquartersHero date="2026-10-21" />, { temperature: 32, weather_code: 2, place: "Shah Alam" });
    expect(html).toContain("data-weather");
    expect(html).toContain("32°C");
    expect(html).toContain("多云");
  });

  it("gives 较昨日 only where yesterday is counted", () => {
    const html = render(<HeadquartersKpis data={DATA} />);
    expect(html.match(/较昨日/g)).toHaveLength(2);
    expect(html).toContain("+3");
    expect(html).toContain("持平");
    expect(html).toContain("当前在场人数");
  });

  it("shows each project's latest photo with what its record is, and a placeholder for none", () => {
    const html = render(<HeadquartersSiteActivity data={DATA} onOpenPhoto={() => {}} map={null} />);
    expect(html).toContain("a1.jpg");
    expect(html).toContain("钢筋 · 20 吨（Ton）");
    expect(html).toContain("张伟");
    expect(html).toContain("还没有现场照片");
  });

  it("splits who is on site by what the system knows", () => {
    const html = render(<HeadquartersPresenceSplit data={DATA} />);
    expect(html).toContain("系统人员（打卡）");
    expect(html).toContain("工人通行证");
    expect(html).toContain("访客");
    expect(html).not.toContain("分包");
  });

  it("offers only the shortcuts this reader may open", () => {
    const html = render(<HeadquartersQuickLinks />);
    expect(html).toContain('href="/approvals"');
    expect(html).not.toContain('href="/reports"');
  });
});
