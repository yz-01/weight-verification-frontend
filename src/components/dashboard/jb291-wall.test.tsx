/**
 * 总部大屏 (客户 11-27e = JB291).
 *
 * 一 it plays by itself (公司总览, then each project, 15 s, round and round,
 * a refresh never restarts it); 二 one screen with logo + name, clock,
 * weather, map, progress, people / machines, photos and ESG; 三 rings, a
 * drawn curve, donuts, counting numbers, a carousel, full screen, the cursor
 * hides; 四 its own page and tab outside the console, its own loop and data,
 * the last good picture kept; 五 only the wall's own safe answer, parts of a
 * switched-off module left out, 大屏展示设定 for head office. The server's
 * side is `contractor_ops/tests/test_jb291_wall.py`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";
import type { WallProject, WallScreenData } from "@/interfaces/wall-screen";
import {
  IDLE_MS,
  REFRESH_MS,
  SLIDE_MS,
  curvePath,
  keepSlide,
  nextSlideIndex,
  wallSlides,
  weightReading,
} from "@/lib/wall-rotation";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/wall",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u1", portal: "MSE_TRACE", is_field_staff: false },
    can: () => true,
    isLoading: false,
  }),
}));
vi.mock("@/components/shared/location-map", () => ({
  LocationMap: ({ markers }: { markers: Array<{ id: string; label: string }> }) => (
    <div data-test-map={markers.map((marker) => marker.label).join("|")} />
  ),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { OverviewSlide, ProjectSlide, WallScreen } = await import("@/components/dashboard/wall-screen");
const { WallSettingsDialog, WALL_SETTINGS_KEY } = await import("@/components/dashboard/wall-settings");
const { WallButton } = await import("@/components/dashboard/headquarters-wall");

const src = (file: string) => readFileSync(path.join(__dirname, "..", "..", file), "utf8");
const LANGUAGES = { zh, "zh-TW": zhTW, en, ms } as const;

const esg = {
  garbage: { trips: 5, weight_kg: "2000.50", month_trips: 3, month_weight_kg: "1200.50" },
  scrap: { trips: 1, weight_kg: "300.00", month_trips: 1, month_weight_kg: "300.00" },
  recycling: { trips: 1, weight_kg: "850.00", month_trips: 0, month_weight_kg: "0.00" },
  safety: { reported: 4, closed: 3, month_reported: 2, month_closed: 1 },
  transparency: {
    photos: 120, month_photos: 30, consultant_approvals: 12, month_consultant_approvals: 2,
    progress_confirmations: 40, month_progress_confirmations: 6,
  },
};

const tower: WallProject = {
  id: "p-tower",
  name: "Alpha Tower",
  place: "Kuala Lumpur, WP",
  latitude: "3.1390000",
  longitude: "101.6869000",
  people_on_site: 18,
  equipment_on_site: 4,
  equipment_working: 3,
  progress: {
    planned: "52.00",
    actual: "47.50",
    start: "2026-09-01",
    end: "2027-03-31",
    curve: {
      planned: [{ date: "2026-09-01", value: "0.00" }, { date: "2027-03-31", value: "100.00" }],
      actual: [{ date: "2026-09-01", value: "0.00" }, { date: "2026-11-20", value: "47.50" }],
    },
  },
  photos: [
    { id: "ph1", image: "https://files.test/1.jpg", captured_at: "2026-11-27T02:00:00Z", project_id: "p-tower", project: "Alpha Tower", title: "Level 5 slab 60%" },
    { id: "ph2", image: "https://files.test/2.jpg", captured_at: "2026-11-27T01:00:00Z", project_id: "p-tower", project: "Alpha Tower", title: "" },
  ],
  esg,
};

const depot: WallProject = {
  ...tower,
  id: "p-depot",
  name: "Alpha Depot",
  place: "",
  latitude: null,
  longitude: null,
  progress: null,
  photos: null,
  esg: null,
};

function wall(overrides: Partial<WallScreenData> = {}): WallScreenData {
  return {
    generated_at: "2026-11-27T02:00:00Z",
    date: "2026-11-27",
    company: { name: "Alpha Builders Sdn Bhd", logo_url: "https://files.test/logo.png" },
    modules: { progress: true, photos: true, people: true, equipment: true, esg: true },
    overview: {
      projects: 2,
      located: 1,
      people_on_site: 18,
      equipment_on_site: 4,
      equipment_working: 3,
      progress: [{ id: "p-tower", name: "Alpha Tower", planned: "52.00", actual: "47.50" }],
      esg,
      photos: tower.photos,
    },
    projects: [depot, tower],
    ...overrides,
  };
}

const source = {
  queryKey: ["wall-screen", "test"] as const,
  load: async () => wall(),
  weather: async () => ({ temperature: 31, weather_code: 61, place: "Kuala Lumpur" }),
};

function renderWall(data: WallScreenData) {
  return renderDetail(<WallScreen source={source} />, (client) => {
    client.setQueryData(source.queryKey, data);
    client.setQueryData([...source.queryKey, "weather", ""], { temperature: 31, weather_code: 61, place: "Kuala Lumpur" });
  });
}

describe("一 it plays by itself", () => {
  it("公司总览 first, then each project, 15 s each, round and round", () => {
    expect(SLIDE_MS).toBe(15_000);
    const slides = wallSlides(wall());
    expect(slides.map((slide) => slide.id)).toEqual(["overview", "p-depot", "p-tower"]);
    expect(nextSlideIndex(0, 3)).toBe(1);
    expect(nextSlideIndex(2, 3)).toBe(0);
  });

  it("a refresh stays on the slide on screen; a project taken off moves on, never back to the start", () => {
    const before = wallSlides(wall());
    const after = wallSlides(wall({ projects: [tower] }));
    expect(keepSlide("p-tower", 2, after)).toBe(1);
    expect(keepSlide("p-depot", 1, after)).toBe(1);
    expect(keepSlide("p-tower", 2, before)).toBe(2);
    expect(keepSlide("gone", 5, before)).toBe(0);
  });

  it("refreshes in the background every 1-2 minutes, the cursor hides after a few seconds", () => {
    expect(REFRESH_MS).toBeGreaterThanOrEqual(60_000);
    expect(REFRESH_MS).toBeLessThanOrEqual(120_000);
    expect(IDLE_MS).toBeLessThanOrEqual(5_000);
    const screen = src("components/dashboard/wall-screen.tsx");
    expect(screen).toContain("refetchIntervalInBackground: true");
    // Every timer is cleared with what armed it (hours of running).
    expect(screen.match(/setTimeout\(/g)?.length).toBe(screen.match(/clearTimeout\(/g)?.length);
    expect(screen.match(/setInterval\(/g)?.length).toBe(screen.match(/clearInterval\(/g)?.length);
    expect(screen.match(/requestAnimationFrame\(/g)!.length).toBeGreaterThan(0);
  });
});

describe("二 / 三 the overview on one screen", () => {
  const html = renderWall(wall());

  it("logo and company name, the title, the ticking clock, the weather, 更新于", () => {
    expect(html).toContain("Alpha Builders Sdn Bhd");
    expect(html).toContain('src="https://files.test/logo.png"');
    expect(html).toContain("数字化智慧工地 · 总部大屏");
    expect(html).toContain("data-wall-clock");
    expect(html).toContain("data-wall-updated");
    expect(html).toContain("公司总览");
    // The slide timer and where in the loop: 第 1 / 3 页.
    expect(html).toContain("第 1 / 3 页");
    expect(html).toContain("wall-timer 15000ms linear forwards");
  });

  it("map, each project's progress, people and machines, photos, ESG", () => {
    expect(html).toContain('data-wall-panel="map"');
    expect(html).toContain('data-test-map="Alpha Tower"');
    expect(html).toContain('data-wall-panel="progress"');
    expect(html).toContain("现场人员");
    expect(html).toContain("今日运作设备");
    expect(html).toContain('data-wall-panel="photos"');
    expect(html).toContain('src="https://files.test/1.jpg"');
    // Only the photo on screen is in the page.
    expect(html).not.toContain('src="https://files.test/2.jpg"');
    expect(html).toContain('data-wall-esg="company"');
    for (const word of ["环境保护", "垃圾清运", "废料处理", "废料回收", "安全管理", "管理透明化", "现场照片存证", "顾问审批完成"]) {
      expect(html).toContain(word);
    }
    // Coloured donuts; tonnes from 1 000 kg.
    expect(html.match(/data-wall-donut/g)?.length).toBe(2);
    expect(html).toContain("吨");
  });

  it("full screen button, dark presentation theme, never a scrollbar", () => {
    expect(html).toContain("data-wall-fullscreen");
    expect(html).toContain("全屏");
    expect(html).toMatch(/class="dark fixed inset-0 z-50 overflow-hidden/);
  });
});

describe("二 / 三 a project slide", () => {
  it("name and place, the gauge and the drawn curve, people and machines, photos, ESG, a pin", () => {
    const html = renderDetail(<ProjectSlide project={tower} modules={wall().modules} />);
    expect(html).toContain('data-wall-panel="gauge"');
    expect(html).toContain("data-wall-ring");
    expect(html).toContain('data-wall-panel="curve"');
    expect(html).toContain("wall-draw");
    expect(html).toContain('data-wall-panel="pin"');
    expect(html).toContain('data-wall-panel="photos"');
    expect(html).toContain('data-wall-esg="project"');
    expect(html).toContain("Level 5 slab 60%");
  });

  it("what head office did not allow, or a module that is off, is not drawn - no empty box", () => {
    const html = renderDetail(<ProjectSlide project={depot} modules={wall().modules} />);
    expect(html).not.toContain('data-wall-panel="photos"');
    expect(html).not.toContain("data-wall-esg");
    expect(html).not.toContain('data-wall-panel="curve"');
    expect(html).not.toContain('data-wall-panel="gauge"');
    const off = renderDetail(
      <OverviewSlide
        data={wall({
          modules: { progress: false, photos: false, people: true, equipment: false, esg: true },
          overview: { ...wall().overview, photos: null, progress: [], equipment_on_site: null, equipment_working: null, esg: { ...esg, garbage: null, scrap: null, recycling: null, safety: null } },
        })}
      />,
    );
    expect(off).not.toContain('data-wall-panel="photos"');
    expect(off).not.toContain('data-wall-panel="progress"');
    expect(off).not.toContain("今日运作设备");
    expect(off).not.toContain('data-wall-esg-part="environment"');
    expect(off).not.toContain('data-wall-esg-part="safety"');
    expect(off).toContain('data-wall-esg-part="transparency"');
  });

  it("the curve's points sit on a 0-100 % chart", () => {
    expect(curvePath([{ date: "2026-01-01", value: "0" }, { date: "2026-01-11", value: "50" }], "2026-01-01", "2026-01-21", 200, 100)).toBe(
      "M0.0,100.0 L100.0,50.0",
    );
    expect(weightReading("2000.50")).toEqual({ value: 2, unit: "t", decimals: 1 });
    expect(weightReading("850.4")).toEqual({ value: 850, unit: "kg", decimals: 0 });
  });
});

describe("四 independent of the back office", () => {
  it("【大屏模式】 opens the wall in its own tab, at its own page outside the console", () => {
    const html = renderDetail(<WallButton />);
    expect(html).toContain('href="/wall"');
    expect(html).toContain('target="_blank"');
    expect(src("app/wall/page.tsx")).toContain("HeadquartersWall");
    expect(src("app/(dashboard)/dashboard/wall/page.tsx")).toContain('redirect("/wall")');
  });

  it("never reads the top bar's project, the live stream or the old dashboard feeds", () => {
    for (const file of ["components/dashboard/wall-screen.tsx", "components/dashboard/headquarters-wall.tsx"]) {
      const text = src(file);
      expect(text).not.toMatch(/useCurrentProject|current-project-provider|useOrderRealtime|getHeadquarters\b|getHeadquartersWall/);
    }
  });

  it("keeps the last good picture through a failed refresh and says how old it is", () => {
    const text = src("components/dashboard/wall-screen.tsx");
    expect(text).toContain('t("stale", { time: updated })');
    expect(zh.jb291.stale).toContain("{time}");
  });

  it("a wall link is public at /screen, private, and never sends the office's login", () => {
    const proxy = src("proxy.ts");
    expect(proxy).toContain('"/screen",');
    expect(proxy).toContain('pathname.startsWith("/screen/")');
    const service = src("services/wall-screen.service.ts");
    expect(service).toContain('credentials: "omit"');
    expect(service).toContain("/api/wall-screen/");
  });
});

describe("五 大屏展示设定", () => {
  it("per active project 上大屏 / 现场照片 / ESG, and the reception link", () => {
    const html = renderDetail(<WallSettingsDialog open onOpenChange={() => {}} onSaved={() => {}} />, (client) => {
      client.setQueryData(WALL_SETTINGS_KEY, {
        projects: [{ project: "p-tower", code: "TWR", name: "Alpha Tower", shown: true, photos: false, esg: true }],
        link: { id: "l1", created_at: "2026-11-27T02:00:00Z", created_by: "Head Office", last_opened_at: null },
      });
    });
    expect(html).toContain("大屏展示设定");
    expect(html).toContain('data-wall-setting-row="p-tower"');
    for (const word of ["上大屏", "现场照片", "ESG", "接待区大屏链接", "停用链接", "还没有打开过"]) expect(html).toContain(word);
    expect(html).toContain(zh.jb291.neverShown);
  });
});

describe("QA291 walk fixes", () => {
  function failedAfterData(error: Error, failure?: (error: unknown) => string | null) {
    const linkSource = { ...source, queryKey: ["wall-screen", "qa", String(Math.random())] as const, failure };
    return renderDetail(<WallScreen source={linkSource} />, (client) => {
      client.setQueryData(linkSource.queryKey, wall());
      client.getQueryCache().find({ queryKey: linkSource.queryKey })?.setState({ status: "error", error, fetchStatus: "idle" });
    });
  }

  it("an ended wall link stops the screen at its next refresh, not 「网络中断」 over the old picture", () => {
    const gone = new ApiError("gone", 404, {}, "wall_link_not_found");
    const html = failedAfterData(gone, (error) => (error instanceof ApiError && error.status === 404 ? zh.jb291.linkGone : null));
    expect(html).toContain(zh.jb291.linkGone);
    expect(html).not.toContain("data-wall-slide");
    expect(html).not.toContain("Alpha Tower");
    // A network failure still keeps the last good picture with the amber note.
    const offline = failedAfterData(new ApiError("network", 0, {}, "network_error"), () => null);
    expect(offline).toContain("data-wall-slide");
    expect(offline).toContain("网络中断");
  });

  it("no project on the wall: one plain sentence, no empty boxes, no page counter", () => {
    const html = renderWall(wall({
      projects: [],
      overview: { ...wall().overview, projects: 0, located: 0, people_on_site: 0, equipment_on_site: 0, equipment_working: 0, progress: [], esg: null, photos: null },
    }));
    expect(html).toContain(zh.jb291.noProjects);
    expect(html).not.toContain("data-wall-panel");
    expect(html).not.toContain("data-wall-indicator");
    expect(html).toContain("Alpha Builders Sdn Bhd");
  });

  it("a project slide: ring and figures on the left, the pin under the curve, % labels as page text", () => {
    const html = renderDetail(<ProjectSlide project={tower} modules={wall().modules} />);
    const at = (panel: string) => html.indexOf(`data-wall-panel="${panel}"`);
    expect(at("gauge")).toBeLessThan(at("curve"));
    expect(at("curve")).toBeLessThan(at("pin"));
    expect(at("pin")).toBeLessThan(at("photos"));
    expect(html.match(/data-wall-curve-tick/g)?.length).toBe(5);
    expect(html).toContain(">100%</span>");
    const curve = html.slice(at("curve"), at("pin"));
    expect(curve).not.toContain("<text");
  });

  it("大屏展示设定 keeps the back office's 16 px type on a small screen while it is open", () => {
    const text = src("components/dashboard/wall-settings.tsx");
    expect(text).toContain("useOfficeTextSize(open)");
    expect(text).toContain("root.style.fontSize = `${OFFICE_TEXT_PX}px`");
    expect(text).toContain("export const OFFICE_TEXT_PX = 16");
  });

  it("the small 项目位置 map is as tall as its box, so its pin shows", () => {
    expect(src("components/dashboard/wall-screen.tsx")).toContain('className="absolute inset-0 h-full w-full min-h-0!"');
  });

  it("a project without a schedule fills its left column with two big figures", () => {
    const html = renderDetail(<ProjectSlide project={depot} modules={wall().modules} />);
    expect(html.match(/text-\[6rem\]/g)?.length).toBe(2);
  });

  it("Esc in 大屏展示设定 closes the dialog only: the wall hears Esc before the dialog does", () => {
    const text = src("components/dashboard/headquarters-wall.tsx");
    expect(text).toContain('window.addEventListener("keydown", onKey, true)');
    expect(text).toContain('window.removeEventListener("keydown", onKey, true)');
  });

  it("停用链接 says when the screen stops (its next refresh), in four languages", () => {
    expect(zh.jb291.confirmRevoke).toContain("下一次自动更新");
    expect(zhTW.jb291.confirmRevoke).toContain("下一次自動更新");
    expect(en.jb291.confirmRevoke).not.toContain("at once");
    expect(ms.jb291.confirmRevoke).not.toContain("serta-merta");
  });
});

describe("words", () => {
  it("every JB291 word in four languages, saying 你 never 您", () => {
    const keys = Object.keys(zh.jb291).sort();
    for (const [name, messages] of Object.entries(LANGUAGES)) {
      expect(Object.keys(messages.jb291).sort(), name).toEqual(keys);
      expect(JSON.stringify(messages.jb291), name).not.toContain("您");
      expect(messages.errors.api.wall_link_not_found, name).toBeTruthy();
      expect(messages.errors.api.wall_project_unavailable, name).toBeTruthy();
      expect(messages.audit.operation.wall_display_settings_saved, name).toBeTruthy();
    }
  });
});
