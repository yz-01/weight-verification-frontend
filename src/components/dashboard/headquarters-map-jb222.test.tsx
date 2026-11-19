/**
 * JB222-1 (客户 11-19 事项 2): 「建筑商总部仪表板：显示所有建筑项目的地理分布。」
 *
 * The head-office map opens on the project pins - one project at city level,
 * several at most at district level - with every fence still drawn but no
 * longer pulling the view down to one street (图 3). Static markup with the
 * Leaflet map stubbed: what is checked is what the map is given.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { HeadquartersProject } from "@/interfaces/headquarters";
import messages from "@/messages/zh.json";

vi.mock("@/components/shared/location-map", () => ({
  LocationMap: (props: Record<string, unknown>) => (
    <div
      data-stub="map"
      data-fit-to={String(props.fitTo)}
      data-fit-max-zoom={String(props.fitMaxZoom)}
      data-single-zoom={String(props.singlePointZoom)}
      data-zones={String((props.zones as unknown[]).length)}
      data-markers={String((props.markers as unknown[]).length)}
      data-lock={String(props.lockToSite)}
    />
  ),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u1" }, can: () => true }),
}));

const { HeadquartersMap } = await import("@/components/dashboard/headquarters-map");

const project = {
  id: "p1",
  code: "TOWER",
  name: "Alpha Tower",
  status: "ACTIVE",
  address: "",
  city: "",
  state: "",
  latitude: "3.1410000",
  longitude: "101.7110000",
  has_location: true,
  latest_photo: null,
  fences: [
    {
      id: "f1", name: "Boundary", shape: "POLYGON", latitude: null, longitude: null, radius_m: null, is_primary: true,
      polygon: [[3.14, 101.71], [3.14, 101.712], [3.142, 101.712], [3.142, 101.71]],
    },
  ],
  today_records: 0, on_site_now: 0, pending_approvals: 0, open_tasks: 0, overdue_tasks: 0,
  overdue_rectifications: 0, material_receipts_today: 0, today_records_by_kind: {},
  waste_dispatches: { records: 0, trips: 0, weighed_kg: "0.00" },
  site_disposals: { records: 0, trips: 0, weight_kg: "0.00", completed: 0, with_weight: 0 },
} as unknown as HeadquartersProject;

function attr(html: string, name: string) {
  return html.match(new RegExp(`${name}="([^"]*)"`))?.[1];
}

describe("the head-office map shows where every project is (JB222-1)", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <HeadquartersMap projects={[project]} withoutLocation={[]} date="2026-11-19" />
    </NextIntlClientProvider>,
  );

  it("opens on the pins, a lone project at city level, several at most at district level", () => {
    expect(attr(html, "data-fit-to")).toBe("markers");
    expect(attr(html, "data-single-zoom")).toBe("12");
    expect(attr(html, "data-fit-max-zoom")).toBe("14");
  });

  it("still draws every fence, and is not kept to one site", () => {
    expect(attr(html, "data-zones")).toBe("1");
    expect(attr(html, "data-markers")).toBe("1");
    expect(attr(html, "data-lock")).toBe("undefined");
  });
});
