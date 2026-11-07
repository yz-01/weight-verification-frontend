/**
 * 照片墙 (JB134 事项 9 今日现场照片, JB135 事项 10 MSE Timeline 工程照片墙).
 *
 * The client: 「单击照片：放大照片，可以左右连续翻看。双击照片：进入该照片对应的
 * 完整业务记录。支持日期及时间筛选。」 and 「按照拍摄时间排列，从开工第一天一直
 * 保留到竣工……支持按项目、日期及时间范围筛选，例如上午8点至12点」.
 *
 * Rendered to static markup (the runner has no DOM): the queries are seeded
 * as the server would answer them, and the click rule is tested on its own
 * with a hand-driven clock.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HeadquartersPhoto } from "@/interfaces/headquarters";
import { wallClock } from "@/lib/gate-time-range";
import { isRouteAllowed, visibleNavigation } from "@/lib/navigation";
import {
  createClickSorter,
  groupPhotosByDay,
  photoWallQuery,
  wallPhotos,
} from "@/lib/photo-wall";
import messages from "@/messages/zh.json";

const apiGet = vi.fn();
vi.mock("@/services/api-client", () => ({
  api: { get: (...args: unknown[]) => apiGet(...args) },
  download: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/photo-timeline",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u1", portal: "MSE_TRACE", company_name: "Alpha Builders", branding: null },
    can: () => true,
  }),
}));
vi.mock("@/components/shared/record-opener", () => ({
  useRecordOpener: () => ({ open: vi.fn(), sheet: null }),
}));

const { HeadquartersPhotos } = await import("@/components/dashboard/headquarters-photos");
const { PhotoTimeline } = await import("@/components/dashboard/photo-timeline");
const { getHeadquartersPhotos } = await import("@/services/contractor-dashboard.service");

function photo(id: string, capturedAt: string, extra: Partial<HeadquartersPhoto> = {}): HeadquartersPhoto {
  return {
    id,
    image: `https://cdn.example/${id}.jpg`,
    captured_at: capturedAt,
    project_id: "p1",
    project: "Alpha Tower",
    photographer: "Ah Seng",
    record_kind: "MATERIAL_RECEIPT",
    record_id: `r-${id}`,
    headline: null,
    ...extra,
  };
}

function page(results: HeadquartersPhoto[]) {
  return {
    pages: [{ count: results.length, page: 1, total_pages: 1, next: null, previous: null, results }],
    pageParams: [1],
  };
}

function render(node: React.ReactNode, seed: (client: QueryClient) => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  seed(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const wall = messages.photoWall;

describe("the filters reach the server", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiGet.mockResolvedValue({ count: 0, page: 1, total_pages: 1, results: [] });
  });

  it("asks for a day and a time of day (上午8点至12点)", async () => {
    await getHeadquartersPhotos({
      page: 2,
      page_size: 12,
      ...photoWallQuery({ date_from: "2026-11-07", date_to: "2026-11-07", time_from: "08:00", time_to: "12:00" }),
    });
    expect(apiGet).toHaveBeenCalledWith("/api/contractor-dashboard/get_headquarters_photos/", {
      page: 2,
      page_size: 12,
      date_from: "2026-11-07",
      date_to: "2026-11-07",
      time_from: "08:00",
      time_to: "12:00",
    });
  });

  it("leaves today to the server when 今日现场照片 has no date", async () => {
    await getHeadquartersPhotos({ page: 1, page_size: 12, ...photoWallQuery({}) });
    expect(apiGet.mock.calls[0][1]).toEqual({ page: 1, page_size: 12 });
  });

  it("reads every photo ever on the timeline, one project or all of them", async () => {
    expect(photoWallQuery({ project: "all" }, { timeline: true })).toEqual({ timeline: true });
    expect(photoWallQuery({ project: "p1", time_from: "08:00" }, { timeline: true })).toEqual({
      project: "p1",
      time_from: "08:00",
      timeline: true,
    });
    // A date range is its own answer: no `timeline` with it.
    expect(photoWallQuery({ date_from: "2026-10-01" }, { timeline: true })).toEqual({
      date_from: "2026-10-01",
    });
    await getHeadquartersPhotos({ page: 1, ...photoWallQuery({ project: "p1" }, { timeline: true }) });
    expect(apiGet.mock.calls[0][1]).toEqual({ page: 1, project: "p1", timeline: "1" });
  });
});

describe("one click enlarges, two open the record", () => {
  function sorter() {
    const single = vi.fn();
    const double = vi.fn();
    const timers: { run: () => void; cancelled: boolean }[] = [];
    const clicks = createClickSorter<number>({
      onSingle: single,
      onDouble: double,
      schedule: (run) => {
        const timer = { run, cancelled: false };
        timers.push(timer);
        return timer;
      },
      cancel: (handle) => {
        (handle as { cancelled: boolean }).cancelled = true;
      },
    });
    const tick = () => timers.filter((timer) => !timer.cancelled).forEach((timer) => timer.run());
    return { clicks, single, double, tick };
  }

  it("opens the viewer once the wait is over", () => {
    const { clicks, single, double, tick } = sorter();
    clicks.click(3, 1);
    expect(single).not.toHaveBeenCalled();
    tick();
    expect(single).toHaveBeenCalledWith(3);
    expect(double).not.toHaveBeenCalled();
  });

  it("a second click opens the record and never the viewer", () => {
    const { clicks, single, double, tick } = sorter();
    clicks.click(3, 1);
    clicks.click(3, 2);
    tick();
    expect(double).toHaveBeenCalledWith(3);
    expect(single).not.toHaveBeenCalled();
  });

  it("Enter opens the viewer at once", () => {
    const { clicks, single } = sorter();
    clicks.click(5, 0);
    expect(single).toHaveBeenCalledWith(5);
  });
});

describe("the timeline reads by day", () => {
  it("groups photos under the company's calendar day, newest first as sent", () => {
    const rows = [
      photo("a", "2026-11-07T04:00:00Z"),
      // 01:30 on 11-07 in Malaysia, though still 11-06 in UTC.
      photo("b", "2026-11-06T17:30:00Z"),
      photo("c", "2026-11-06T15:00:00Z"),
      photo("d", "2026-10-01T02:00:00Z"),
    ];
    const days = groupPhotosByDay(rows, "Asia/Kuala_Lumpur");
    expect(days.map((day) => day.day)).toEqual(["2026-11-07", "2026-11-06", "2026-10-01"]);
    expect(days[0].photos.map((item) => [item.photo.id, item.index])).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
    expect(days[1].photos.map((item) => item.index)).toEqual([2]);
  });

  it("keeps a photo that slid onto the next page once", () => {
    const pages = [
      { results: [photo("a", "2026-11-07T04:00:00Z"), photo("b", "2026-11-07T03:00:00Z")] },
      { results: [photo("b", "2026-11-07T03:00:00Z"), photo("c", "2026-11-07T02:00:00Z")] },
    ];
    expect(wallPhotos(pages).map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("draws a heading per day on the MSE Timeline page", () => {
    const html = render(<PhotoTimeline />, (client) => {
      client.setQueryData(
        ["contractor-dashboard", "photo-timeline", { timeline: true }],
        page([photo("a", "2026-11-07T04:00:00Z"), photo("b", "2026-11-05T04:00:00Z")]),
      );
    });
    expect(html).toContain(wall.timeline.title);
    expect(html).toContain('data-timeline-day="2026-11-07"');
    expect(html).toContain('data-timeline-day="2026-11-05"');
    expect(html.match(/data-photo-tile/g)).toHaveLength(2);
    expect(html).toContain(wall.hint);
    // A date range and a time of day, typed on a 24-hour clock.
    expect(html).toContain(wall.filter.dateFrom);
    expect(html).toContain(wall.filter.timeFrom);
    expect(html).not.toContain('type="time"');
  });
});

describe("今日现场照片 keeps its look and gains the wall's clicks and filters", () => {
  it("shows today's photos as before, every one opening large, with a day and time row", () => {
    const html = render(<HeadquartersPhotos onOpen={() => {}} />, (client) => {
      client.setQueryData(
        ["contractor-dashboard", "headquarters-photos", {}],
        page([
          photo("a", "2026-11-07T04:00:00Z"),
          // A photo whose record is gone still opens large.
          photo("b", "2026-11-07T03:00:00Z", { record_id: null }),
        ]),
      );
    });
    expect(html).toContain(messages.headquarters.photos.title);
    expect(html.match(/data-photo-tile/g)).toHaveLength(2);
    const today = wallClock(new Date(), "Asia/Kuala_Lumpur").date;
    expect(html).toContain(`type="date"`);
    expect(html).toContain(`value="${today}"`);
    expect(html).toContain(wall.filter.timeFrom);
    // Nothing filtered yet: no 「回到今天」.
    expect(html).not.toContain(wall.filter.backToToday);
  });
});

describe("MSE Timeline is in the menu for whoever reads the head-office dashboard", () => {
  const hrefs = (permissions: string[]) =>
    visibleNavigation("MSE_TRACE", ["dashboard"], permissions).flatMap((group) =>
      group.items.map((item) => item.href),
    );

  it("sits right under Dashboard with dashboard.view, and is gone without it", () => {
    expect(hrefs(["dashboard.view"])).toEqual(["/dashboard", "/photo-timeline"]);
    expect(hrefs([])).toEqual(["/dashboard"]);
    expect(isRouteAllowed("MSE_TRACE", ["dashboard"], "/photo-timeline", ["dashboard.view"])).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", ["dashboard"], "/photo-timeline", [])).toBe(false);
  });
});
