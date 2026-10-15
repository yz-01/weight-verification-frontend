/**
 * 工地门禁 › 日常拍照记录 / 门岗事项 (I25, ID61), searched by date + 24-hour
 * time (I15, ID62), seen as a list or a 照片墙 (I33, ID74).
 *
 * The two menu entries open the two tabs of one page (`/gate-records`), so
 * the page has to show whichever tab the address names on every render - not
 * the one it mounted with - or the second entry clicked would change nothing
 * (the lesson of 工地门禁's own tabs, `site-access-tabs.test.tsx`). Rendered
 * to static markup: the runner has no DOM.
 */
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { navLeaves, PORTAL_NAVIGATION } from "@/lib/navigation";
import type { WallRecord } from "@/lib/gate-photo-wall";
import messages from "@/messages/zh.json";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/gate-records",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));
vi.mock("@/components/providers/current-project-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/current-project-provider")>()),
  usePageProject: () => ["all", () => {}],
  useProjectBoxShown: () => true,
}));
vi.mock("@/components/shared/location-map", () => ({ LocationMap: () => null }));

const { GateRecordsOffice } = await import("@/components/site-access/gate-records-office");

function render(search: string, seed: (client: QueryClient) => void = () => {}) {
  nav.search = search;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  seed(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <GateRecordsOffice />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** The tab the page shows: the one trigger Radix marks active. */
function shownTab(html: string): string {
  const active = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => tag.includes('data-state="active"'));
  expect(active).toHaveLength(1);
  return /aria-controls="[^"]*-content-([a-z-]+)"/.exec(active[0])?.[1] ?? "";
}

const siteAccess = PORTAL_NAVIGATION.MSE_TRACE.find((item) => item.feature === "site_access");
const entry = (labelKey: string) =>
  navLeaves(siteAccess?.children).find((leaf) => leaf.labelKey === labelKey)!.href;
const query = (href: string) => href.split("?", 2)[1] ?? "";

describe("工地门禁's two gate entries open the two tabs (I25)", () => {
  it("shows the tab the address names, render after render", () => {
    const photos = query(entry("nav.submodule.gatePhotoRecords"));
    const issues = query(entry("nav.submodule.gateIssues"));
    expect([photos, issues, photos, "", "gate_incident=g1"].map((search) => shownTab(render(search)))).toEqual([
      "photos",
      "issues",
      "photos",
      "photos",
      "photos",
    ]);
  });

  it("names each tab what its menu entry is called", () => {
    const html = render("tab=photos");
    expect(html).toContain(messages.nav.submodule.gatePhotoRecords);
    expect(html).toContain(messages.nav.submodule.gateIssues);
  });
});

describe("the date + 24-hour time range (I15)", () => {
  it("is on both tabs, with 今天 · 昨天 · 最近 1 小时", () => {
    for (const tab of ["photos", "issues"]) {
      const html = render(`tab=${tab}`);
      expect(html).toContain("data-date-time-range");
      for (const kind of ["today", "yesterday", "lastHour"]) {
        expect(html).toContain(`data-quick-range="${kind}"`);
      }
      expect(html).toContain("最近 1 小时");
      // Typed on a 24-hour clock, not the browser's AM / PM picker.
      expect(html).not.toContain('type="time"');
    }
  });

  it("shows the range the address holds, across midnight", () => {
    const html = render("tab=photos&occurred_from=2026-10-14T22:00&occurred_to=2026-10-15T02:00");
    expect(html).toContain('value="2026-10-14"');
    expect(html).toContain('value="22:00"');
    expect(html).toContain('value="2026-10-15"');
    expect(html).toContain('value="02:00"');
  });
});

describe("日常拍照记录 as a photo wall (I33)", () => {
  const record = {
    id: "g1",
    incident_no: "GT-P1-0001",
    project: "p1",
    project_name: "Tower A",
    is_issue: false,
    issue_status: null,
    guard_name: "Ah Seng",
    occurred_at: "2026-10-14T06:30:00Z",
    latitude: "3.1",
    longitude: "101.6",
    wall_photos: [
      {
        id: "ph1",
        thumbnail: "https://cdn.example/gate-1-small.webp",
        watermarked_image: "https://cdn.example/gate-1-stamped.jpg",
        captured_at: "2026-10-14T06:30:00Z",
        latitude: "3.1",
        longitude: "101.6",
        accuracy_m: null,
        guard_name: "Ah Seng",
        gate_name: "",
      },
    ],
  } as unknown as WallRecord;

  const wallSearch = "tab=photos&view=wall&occurred_from=2026-10-14T14:00&occurred_to=2026-10-14T15:00";
  const seedWall = (client: QueryClient) =>
    client.setQueryData(
      [
        "gate-incidents",
        "wall",
        { occurred_from: "2026-10-14T14:00", occurred_to: "2026-10-14T15:00", kind: "photos" },
      ],
      { pages: [{ count: 1, page: 1, page_size: 40, total_pages: 1, results: [record] }], pageParams: [1] },
    );

  it("offers 列表 / 照片墙 on 日常拍照记录 only", () => {
    expect(render("tab=photos")).toContain('data-gate-view="list"');
    expect(render("tab=issues")).not.toContain("data-gate-view");
  });

  it("shows thumbnails only, under the same filters", () => {
    const html = render(wallSearch, seedWall);
    expect(html).toContain('data-gate-view="wall"');
    expect(html).toContain("data-gate-photo-wall");
    expect(html).toContain("https://cdn.example/gate-1-small.webp");
    // No record facts on the wall itself, and no table.
    expect(html).not.toContain("Tower A");
    expect(html).not.toContain("<table");
    // The time range is still the one in the address.
    expect(html).toContain('value="14:00"');
    expect(html).toContain('value="15:00"');
  });

  it("is a list again without view=wall, filters and all", () => {
    const html = render("tab=photos&occurred_from=2026-10-14T14:00&occurred_to=2026-10-14T15:00");
    expect(html).not.toContain("data-gate-photo-wall");
    expect(html).toContain('value="14:00"');
  });
});
