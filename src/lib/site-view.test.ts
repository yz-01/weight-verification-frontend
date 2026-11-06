/**
 * JB111 (客户 11-06 第二轮事项 1): 「地图只服务于当前工地，不是让用户浏览世界地图」.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { boxHolds, lockMapToBox, MALAYSIA_BOX, SITE_ALONE_M, SITE_MARGIN_M, siteViewBox, type LatLng } from "@/lib/site-view";

const KL: LatLng = [3.139, 101.6869];
const PENANG: LatLng = [5.4141, 100.3288];
const METRES = 111_320;

// A site about 200 m by 200 m in Kuala Lumpur.
const SITE: LatLng[] = [
  [3.1390, 101.6869],
  [3.1408, 101.6869],
  [3.1408, 101.6887],
  [3.1390, 101.6887],
];

function heightM(box: [LatLng, LatLng]) {
  return (box[1][0] - box[0][0]) * METRES;
}

describe("siteViewBox", () => {
  it("holds the whole drawn fence", () => {
    const box = siteViewBox([{ points: SITE }])!;
    for (const point of SITE) expect(boxHolds(box, point)).toBe(true);
  });

  it("leaves room to make the fence a little bigger, but not another town", () => {
    const box = siteViewBox([{ points: SITE }])!;
    // 200 m of site plus at least 300 m each side.
    expect(heightM(box)).toBeGreaterThanOrEqual(200 + 2 * SITE_MARGIN_M - 1);
    expect(heightM(box)).toBeLessThan(2000);
    expect(boxHolds(box, PENANG)).toBe(false);
    expect(boxHolds(box, [3.16, 101.70])).toBe(false); // 2.5 km away
  });

  it("follows the fence as it is drawn bigger", () => {
    const small = siteViewBox([{ points: SITE }])!;
    const bigger = siteViewBox([{ points: [...SITE, [3.146, 101.6878]] }])!;
    expect(heightM(bigger)).toBeGreaterThan(heightM(small));
    expect(boxHolds(bigger, [3.146, 101.6878])).toBe(true);
  });

  it("holds a round fence's whole circle", () => {
    const box = siteViewBox([{ center: KL, radiusM: 500 }])!;
    expect(boxHolds(box, [KL[0] + 500 / METRES, KL[1]])).toBe(true);
    expect(boxHolds(box, [KL[0] - 500 / METRES, KL[1]])).toBe(true);
    expect(heightM(box)).toBeLessThan(3000);
  });

  it("gives a place with no fence yet room to draw it in", () => {
    const box = siteViewBox([{ center: KL }])!;
    expect(heightM(box)).toBeCloseTo(2 * SITE_ALONE_M, -1);
  });

  it("has nothing to keep to when there is no place at all", () => {
    expect(siteViewBox([])).toBeNull();
    expect(siteViewBox([{ points: [] }])).toBeNull();
    expect(siteViewBox([{ center: [0, 0] }])).toBeNull();
    expect(siteViewBox([{ center: [Number.NaN, 101] }])).toBeNull();
  });

  it("keeps a project's extra fences in view too", () => {
    const box = siteViewBox([{ points: SITE }, { center: [3.142, 101.69], radiusM: 100 }])!;
    expect(boxHolds(box, [3.142, 101.69])).toBe(true);
  });
});

describe("Malaysia, for a new project with no place yet", () => {
  it("holds the whole country and not the world", () => {
    for (const place of [KL, PENANG, [1.4927, 103.7414], [5.9804, 116.0735], [1.5533, 110.3592]] as LatLng[]) {
      expect(boxHolds(MALAYSIA_BOX, place)).toBe(true);
    }
    expect(boxHolds(MALAYSIA_BOX, [13.7563, 100.5018])).toBe(false); // Bangkok
    expect(boxHolds(MALAYSIA_BOX, [51.5072, -0.1276])).toBe(false); // London
  });
});

describe("lockMapToBox", () => {
  function fakeMap(size = { x: 600, y: 400 }) {
    return {
      options: {} as { maxBoundsViscosity?: number },
      setMaxBounds: vi.fn(),
      setMinZoom: vi.fn(),
      getSize: () => size,
      getBoundsZoom: vi.fn(() => 15),
      getMaxZoom: () => 19,
    };
  }
  const L = { latLngBounds: vi.fn((value: unknown) => ({ value })) };

  it("cannot be dragged out, nor zoomed out past the whole box", () => {
    const map = fakeMap();
    const box = siteViewBox([{ points: SITE }])!;
    lockMapToBox(map as never, L as never, box);
    expect(map.options.maxBoundsViscosity).toBe(1);
    expect(map.setMaxBounds).toHaveBeenCalledWith({ value: box });
    expect(map.getBoundsZoom).toHaveBeenCalledWith({ value: box }, false);
    expect(map.setMinZoom).toHaveBeenCalledWith(15);
  });

  it("waits for a map in an opening dialog to have a size", () => {
    const map = fakeMap({ x: 0, y: 0 });
    lockMapToBox(map as never, L as never, siteViewBox([{ points: SITE }]));
    expect(map.setMaxBounds).toHaveBeenCalled();
    expect(map.setMinZoom).not.toHaveBeenCalled();
  });

  it("lets go when there is no box", () => {
    const map = fakeMap();
    lockMapToBox(map as never, L as never, null);
    expect(map.setMaxBounds).toHaveBeenCalledWith({ value: [] });
    expect(map.setMinZoom).toHaveBeenCalledWith(0);
  });
});

describe("which maps stay on their site", () => {
  const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

  it("the fence editor (新增 / 编辑项目, 电子围栏设置) always does, Malaysia before a place", () => {
    const code = read("src/components/site-access/geofence-map-editor.tsx");
    expect(code).toContain("lockMapToBox(map, L, box ?? MALAYSIA_BOX)");
    // Before fitting: Leaflet will not show a place outside the old room.
    expect(code).toMatch(/lockRef\.current\(\);\r?\n\s*\/\/ The fence is shown once/);
  });

  it("one project's fence maps do; overview maps do not", () => {
    expect(read("src/components/site-access/geofence-workspace.tsx")).toContain('lockToSite={Boolean(project) && project !== "all"}');
    expect(read("src/components/site-operations/on-site-map.tsx")).toContain("lockToSite={Boolean(project)}");
    expect(read("src/components/site-operations/field-staff-gps.tsx")).toContain("lockToSite={Boolean(historyProjectId)}");
    expect(read("src/components/site-workers/worker-detail.tsx")).toContain("lockToSite");
    for (const overview of [
      "src/components/dashboard/headquarters-map.tsx",
      "src/components/dashboard/admin-dashboard.tsx",
      "src/components/driver/driver-task.tsx",
      "src/components/recycler-business/recycler-dashboard.tsx",
    ]) {
      expect(read(overview)).not.toContain("lockToSite");
    }
  });
});
