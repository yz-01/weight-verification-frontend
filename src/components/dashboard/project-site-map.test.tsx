/**
 * JB222 (客户 11-19 事项 2): the project dashboard's map.
 *
 * 「项目仪表板的地图是用来管理工地现场，而不是查看整个城市的道路分布。」 - it opens
 * on the fence at about 80 %, stays on the site, offers only the layers the
 * server allowed, says what it left out, and a press shows a card whose
 * button opens the record itself. Rendered to static markup (no DOM in the
 * runner) with the Leaflet map stubbed, so what is checked is what the map is
 * given.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectMap, ProjectMapPerson, ProjectMapRow } from "@/interfaces/headquarters";
import messages from "@/messages/zh.json";

const auth = { can: (code: string) => Boolean(code) };
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }) }));
vi.mock("@/components/providers/auth-provider", () => ({ useAuth: () => auth }));
vi.mock("@/components/shared/record-opener", () => ({ useRecordOpener: () => ({ open: () => true, sheet: null }) }));
vi.mock("@/components/site-workers/worker-detail", () => ({ WorkerDetailDialog: () => null }));
vi.mock("@/components/shared/location-map", () => ({
  LocationMap: (props: Record<string, unknown>) => (
    <div
      data-stub="map"
      data-markers={JSON.stringify(props.markers)}
      data-zones={JSON.stringify(props.zones)}
      data-lock={String(props.lockToSite)}
      data-fill={String(props.siteFill)}
      data-popups={String(props.popups)}
      data-fit-label={String(props.fitLabel)}
    >
      {props.overlay as React.ReactNode}
    </div>
  ),
}));

const apiGet = vi.fn((..._args: unknown[]) => Promise.resolve({}));
vi.mock("@/services/api-client", () => ({ api: { get: (...args: unknown[]) => apiGet(...args) }, download: vi.fn() }));

const { ProjectSiteMap, MapOverlay, siteZones, siteMarkers, mapItems } = await import("@/components/dashboard/project-site-map");
const { useDateFormat } = await import("@/lib/dates");
const { getProjectMap } = await import("@/services/contractor-dashboard.service");

const CENTRE = { latitude: "3.1425000", longitude: "101.7183000" };
const fence = {
  id: "f1", name: "Main", shape: "CIRCLE" as const, latitude: CENTRE.latitude, longitude: CENTRE.longitude,
  radius_m: 100, polygon: [], is_primary: true,
};
const receipt = (id: string, latitude = "3.1429497"): ProjectMapRow => ({
  kind: "MATERIAL_RECEIPT", id, reference: `MI-${id}`, label: "Sunway · Ready mix", at: "2026-11-19T02:00:00Z",
  latitude, longitude: "101.7183000",
});
const person: ProjectMapPerson = {
  kind: "APP", id: "u1", name: "阿华", trade: "木工", department: "", latitude: "3.1422300", longitude: "101.7183000",
  at: "2026-11-19T03:00:00Z", since: "2026-11-19T00:30:00Z", stale: true,
};

function mapData(overrides: Partial<ProjectMap> = {}, layers: Partial<ProjectMap["layers"]> = {}): ProjectMap {
  return {
    project: { id: "p1", code: "P-1", name: "Tower" },
    window: "today",
    from: "2026-11-18T16:00:00Z",
    to: "2026-11-19T16:00:00Z",
    cap: 200,
    site: { fences: [fence], radius_circle: null, location: null },
    layers: {
      people: { allowed: true, app_allowed: true, roster_allowed: true, rows: [person] },
      receipts: { allowed: true, rows: [receipt("1"), receipt("2")], capped: false },
      machines: { allowed: true, rows: [], without_position: 0 },
      records: { allowed: true, kinds: ["SAFETY_INCIDENT"], rows: [], capped: false },
      ...layers,
    },
    generated_at: "2026-11-19T04:00:00Z",
    ...overrides,
  };
}

function render(data: ProjectMap, consultant = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["contractor-dashboard", "project-map", "p1", "today"], data);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <ProjectSiteMap project="p1" consultant={consultant} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function attr(html: string, name: string): string {
  const found = html.match(new RegExp(`${name}="([^"]*)"`));
  return (found?.[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

const words = messages.projectSiteMap;

beforeEach(() => {
  auth.can = (code: string) => Boolean(code);
});

describe("the map is about the site, not the city (JB222-2, JB222-8)", () => {
  it("draws the fence, keeps to it and fills about 80 % of the map", () => {
    const html = render(mapData());
    expect(attr(html, "data-lock")).toBe("true");
    expect(attr(html, "data-fill")).toBe("0.8");
    expect(attr(html, "data-fit-label")).toBe(words.backToSite);
    expect(JSON.parse(attr(html, "data-zones"))).toEqual([
      { id: "f1", center: [3.1425, 101.7183], radiusM: 100, label: "Main", dashed: false },
    ]);
  });

  it("does not draw a place outside the site, and says how many it left out", () => {
    const html = render(mapData({}, { receipts: { allowed: true, rows: [receipt("1"), receipt("far", "3.1605000")], capped: false } }));
    const markers = JSON.parse(attr(html, "data-markers")) as Array<{ count: number; icon: string }>;
    expect(markers.filter((marker) => marker.icon === "truck")).toHaveLength(1);
    expect(html).toContain("另有 1 个位置在工地范围以外，没有画在地图上。");
  });

  it("shows several things at one spot as one icon with their number", () => {
    const markers = JSON.parse(attr(render(mapData()), "data-markers")) as Array<{ count: number; icon: string; stale: boolean }>;
    const truck = markers.find((marker) => marker.icon === "truck");
    expect(truck?.count).toBe(2);
    // A person not heard from for ten minutes is greyed.
    expect(markers.find((marker) => marker.icon === "person")?.stale).toBe(true);
  });
});

describe("the layers are the reader's own (JB222-7)", () => {
  it("offers a switch, with its count, only for a layer the server allowed", () => {
    const html = render(mapData({}, { people: { allowed: false, app_allowed: false, roster_allowed: false, rows: [] } }));
    expect(html).not.toContain('data-map-layer="people"');
    expect(html).toMatch(/data-map-layer="receipts"[^>]*>[\s\S]*?材料卸货[\s\S]*?>2</);
    expect(html).toContain('data-map-layer="machines"');
    expect(html).toContain('data-map-layer="records"');
    expect(html).toContain(words.legendNote.replace(/\{window, select, today \{(.+?)\} other \{.+?\}\}/, "$1"));
  });

  it("offers no switch at all to a reader the server gave nothing", () => {
    const none = { allowed: false, rows: [] };
    const html = render(
      mapData({}, {
        people: { ...none, app_allowed: false, roster_allowed: false },
        receipts: { ...none, capped: false },
        machines: { ...none, without_position: 0 },
        records: { ...none, kinds: [], capped: false },
      }),
    );
    expect(html).not.toContain("data-map-layers");
  });

  it("a layer switched off draws none of its icons; the others stay", () => {
    const items = mapItems(mapData());
    const label = ((key: string) => key) as unknown as Parameters<typeof siteMarkers>[2];
    const all = siteMarkers(items, new Set(), label).markers.map((marker) => marker.icon);
    expect(all).toEqual(["person", "truck"]);
    const withoutPeople = siteMarkers(items, new Set(["people"] as const), label).markers.map((marker) => marker.icon);
    expect(withoutPeople).toEqual(["truck"]);
  });

  it("「最近 7 天」 asks the server for the week", async () => {
    apiGet.mockClear();
    await getProjectMap("p1", "week");
    expect(apiGet).toHaveBeenCalledWith("/api/contractor-dashboard/get_project_map/", { project: "p1", window: "week" });
  });

  it("early in the day with nothing yet: the fence, and one sentence saying so", () => {
    const html = render(
      mapData({}, {
        people: { allowed: true, app_allowed: true, roster_allowed: false, rows: [] },
        receipts: { allowed: true, rows: [], capped: false },
      }),
    );
    expect(html).toContain('data-stub="map"');
    expect(html).toContain("今天还没有可以画在地图上的人员、设备或记录。");
  });

  it("says when a layer was cut to the newest 200, and machines with no place", () => {
    const html = render(
      mapData({}, {
        receipts: { allowed: true, rows: [receipt("1")], capped: true },
        machines: { allowed: true, rows: [], without_position: 2 },
      }),
    );
    expect(html).toContain("材料卸货只显示最新 200 条");
    expect(html).toContain("另有 2 台在场设备没有定位记录。");
  });
});

describe("a project with no fence (D11)", () => {
  it("with a place: the map on it, the sentence, and 「去画电子围栏」 for whoever may", () => {
    const html = render(mapData({ site: { fences: [], radius_circle: null, location: CENTRE } }));
    expect(html).toContain(words.noFence);
    expect(html).toContain(words.drawFence);
    expect(html).toContain('href="/geofences?project=p1"');
    expect(JSON.parse(attr(html, "data-markers"))[0]).toMatchObject({ id: "project-place", icon: "project" });
  });

  it("someone who may not draw it is told whom to ask", () => {
    auth.can = (code: string) => code !== "geofence.manage";
    const html = render(mapData({ site: { fences: [], radius_circle: null, location: CENTRE } }));
    expect(html).toContain(words.askAdmin);
    expect(html).not.toContain(words.drawFence);
  });

  it("with no place either: no map, one sentence", () => {
    const html = render(mapData({ site: { fences: [], radius_circle: null, location: null } }));
    expect(html).not.toContain('data-stub="map"');
    expect(html).toContain(words.noPlace);
  });

  it("the project's own radius stands in for a fence", () => {
    const zones = siteZones({ fences: [], radius_circle: { ...CENTRE, radius_m: 150 }, location: CENTRE });
    expect(zones).toEqual([{ id: "project-radius", center: [3.1425, 101.7183], radiusM: 150 }]);
  });
});

/** The notes under the map, where the sentences are. */
function notes(html: string): string {
  return html.slice(html.indexOf("data-map-notes"), html.indexOf("</ul>", html.indexOf("data-map-notes")));
}

describe("a consultant's notes (JB226 audit F2): his layers, and 建筑商总部", () => {
  // People and machines are never sent to a consultant (CONSULTANT_MAP_KINDS).
  const his = {
    people: { allowed: false, app_allowed: false, roster_allowed: false, rows: [] },
    machines: { allowed: false, rows: [], without_position: 0 },
  };

  it("never speaks of people or machines; says what the map holds for him", () => {
    const html = render(
      mapData({}, { ...his, receipts: { allowed: true, rows: [], capped: false }, records: { allowed: true, kinds: ["SAFETY_INCIDENT"], rows: [], capped: false } }),
      true,
    );
    const said = notes(html);
    expect(said).toContain("地图上是总部为您开通的、今天的记录，只画出有定位的。");
    expect(said).toContain("今天还没有可以画在地图上的记录。");
    for (const word of ["人员", "机械设备", "设备"]) {
      expect(said).not.toContain(word);
    }
  });

  it("with nothing of the map opened: why it is bare, and whom to ask", () => {
    const html = render(
      mapData({}, { ...his, receipts: { allowed: false, rows: [], capped: false }, records: { allowed: false, kinds: [], rows: [], capped: false } }),
      true,
    );
    const said = notes(html);
    expect(said).toContain(words.consultantNoLayers);
    expect(said).toContain("建筑商总部");
    expect(said).not.toContain("人员");
    expect(said).not.toContain("公司管理员");
  });

  it("a missing fence is 建筑商总部's to draw, not 公司管理员's", () => {
    const html = render(mapData({ site: { fences: [], radius_circle: null, location: CENTRE } }, his), true);
    expect(html).toContain(words.askHeadOffice);
    expect(html).not.toContain(words.askAdmin);
    expect(html).not.toContain(words.drawFence);
    const bare = render(mapData({ site: { fences: [], radius_circle: null, location: null } }, his), true);
    expect(bare).toContain(words.askHeadOffice);
    expect(bare).not.toContain(words.askAdmin);
  });

  it("the office's notes are as before", () => {
    const said = notes(render(mapData()));
    expect(said).toContain("人员和机械设备是现在的位置");
    expect(said).not.toContain(words.consultantNoLayers);
  });
});

function Card({ chosen }: { chosen: Parameters<typeof MapOverlay>[0]["chosen"] }) {
  const df = useDateFormat();
  return (
    <MapOverlay
      offered={["people", "receipts", "machines", "records"]}
      hidden={new Set()}
      counts={{ people: 1, receipts: 2, machines: 0, records: 0 }}
      onToggle={() => {}}
      chosen={chosen}
      onClose={() => {}}
      df={df}
      project="p1"
      onOpenRecord={() => {}}
      onOpenWorker={() => {}}
    />
  );
}

function renderCard(chosen: Parameters<typeof MapOverlay>[0]["chosen"]) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <Card chosen={chosen} />
    </NextIntlClientProvider>,
  );
}

describe("a press shows the card, and the card opens the record (JB222-7)", () => {
  it("a person: who, since when, 最新定位 and why it is grey", () => {
    const html = renderCard([{ layer: "people", person }]);
    expect(html).toContain("阿华");
    expect(html).toContain("现场 App · 木工");
    expect(html).toContain("最新定位");
    expect(html).toContain(words.stale);
    expect(html).toContain('href="/site-gps?project=p1&amp;user=u1"');
    expect(html).toContain(words.openRoute);
  });

  it("a roster worker opens his details", () => {
    const html = renderCard([{ layer: "people", person: { ...person, kind: "ROSTER", stale: false } }]);
    expect(html).toContain(words.openWorker);
    expect(html).not.toContain(words.stale);
  });

  it("a record or a delivery: its kind, number and 「查看完整记录」", () => {
    const html = renderCard([{ layer: "records", row: { ...receipt("9"), kind: "PERMIT", reference: "PM-009" } }]);
    expect(html).toContain("施工准证 · PM-009");
    expect(html).toContain(words.openRecord);
  });

  it("a machine: where its place came from and its entry record", () => {
    const html = renderCard([
      {
        layer: "machines",
        row: { ...receipt("m1"), kind: "MACHINE", reference: "EQ-1", label: "Tower crane", source: "OPERATING_LOG", movement_id: "mv1" },
      },
    ]);
    expect(html).toContain("Tower crane");
    expect(html).toContain("设备操作员工时");
    expect(html).toContain(words.openEntry);
  });

  it("several at one spot: a list, each with its own button", () => {
    const html = renderCard([
      { layer: "receipts", row: receipt("1") },
      { layer: "receipts", row: receipt("2") },
    ]);
    expect(html).toContain("这个位置有 2 项");
    expect(html.match(new RegExp(words.openRecord, "g"))).toHaveLength(2);
    // The card replaces the switches while it is open.
    expect(html).not.toContain("data-map-layers");
  });
});
