/**
 * J34-5: the project dashboard as the client's picture (图 5), on real data.
 * Tonnes with 较昨日, the latest deliveries, this month's mixes, what waits by
 * module and one photograph per record - and empty states, never samples.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ProjectOverview } from "@/interfaces/headquarters";
import messages from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/dashboard/project",
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const { ProjectReference } = await import("@/components/dashboard/project-reference");

const empty: ProjectOverview = {
  date: "2026-10-21",
  project: { id: "p1", code: "P-1", name: "Tower", latitude: null, longitude: null },
  cards: {
    receipts_today_t: "0.00", receipts_yesterday_t: "0.00", waste_today_t: "0.00", waste_yesterday_t: "0.00",
    receipts_month_t: "0.00", receipts_total_t: "0.00", waste_month_t: "0.00", waste_total_t: "0.00",
    equipment_total: 0, equipment_on_site: 0, equipment_off_site: 0, pending_total: 0,
  },
  latest_receipts: [],
  map_points: [],
  material_mix: [],
  waste_mix: [],
  pending: [],
  photos: [],
};

const full: ProjectOverview = {
  ...empty,
  cards: { ...empty.cards, receipts_today_t: "128.50", receipts_yesterday_t: "100.00", receipts_month_t: "500.00", receipts_total_t: "24560.80", equipment_total: 28, equipment_on_site: 18, equipment_off_site: 10, pending_total: 8 },
  latest_receipts: [
    { id: "r1", receipt_no: "MI-0012", business_at: "2026-10-21T01:15:00Z", supplier: "Sunway Concrete", material: "Ready Mix", category: "Concrete", quantity: "28.500", unit: "TONNE", acceptance_status: "ACCEPTED" },
  ],
  material_mix: [{ name: "Concrete", tonnes: "300.00" }, { name: "", tonnes: "100.00", other: true }],
  pending: [{ feature: "material_receipts", count: 8 }],
  photos: [
    { kind: "MATERIAL_RECEIPT", record_id: "r1", reference: "MI-0012", captured_at: "2026-10-21T01:15:00Z", thumbnail_url: "https://cdn.example/t.webp", url: "https://cdn.example/f.jpg", photo_count: 3 },
  ],
};

function render(data: ProjectOverview) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["contractor-dashboard", "project-overview", "p1"], data);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <ProjectReference project="p1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("the project dashboard as the client's picture (J34-5)", () => {
  it("draws the six figures, with 较昨日 only for today's two", () => {
    const html = render(full);
    expect(html).toContain("今日收货（吨）");
    expect(html).toContain("128.5");
    expect(html).toContain("+28.5");
    expect(html.match(/较昨日/g)).toHaveLength(2);
    expect(html).toContain("在场 18 | 离场 10");
    expect(html).toContain("本月 500 吨");
  });

  it("lists the latest deliveries, the month's mix, what waits and one photo per record", () => {
    const html = render(full);
    expect(html).toContain("MI-0012");
    expect(html).toContain("已验收");
    expect(html).toContain("Concrete");
    expect(html).toContain("其他");
    expect(html).toContain("材料进场");
    expect(html).toContain("needs_action=1");
    expect(html).toContain("t.webp");
  });

  it("says so where there is nothing - no sample figures, photos or slices", () => {
    const html = render(empty);
    expect(html).toContain("还没有材料进场记录。");
    expect(html).toContain("本月还没有称重的数量。");
    expect(html).toContain("没有待处理事项。");
    expect(html).toContain("还没有现场照片。");
    expect(html).not.toContain("<circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"none\" stroke=\"currentColor\"");
  });
});
