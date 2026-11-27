/**
 * JB240 (客户 11-23 事项 12-1): 「希望整个工地尽量放大，覆盖整个地图显示框」「不要求
 * 100%精确填满」. Why the JB222 map did not: 10 % kept clear on each side, the
 * zoom rounded down to a quarter step, and the zoom stopped at the tiles' own
 * closest level (OpenStreetMap: 19), where a 900 px map already shows about
 * 270 m - a smaller site could not fill it. Read from the source (no DOM in
 * the runner); location-map-defaults.test.ts keeps every other map as it was.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SITE_FILL } from "@/components/dashboard/project-site-map";
import { SITE_OVERZOOM, SITE_ZOOM_SNAP } from "@/components/shared/location-map";
import { sitePadding } from "@/lib/site-view";

const map = readFileSync(path.join(process.cwd(), "src/components/shared/location-map.tsx"), "utf8").replace(/\r\n/g, "\n");

/** Metres one screen pixel covers at a zoom (Web Mercator, 256 px tiles). */
const metresPerPixel = (zoom: number, latitude = 3.14) =>
  (156_543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;

describe("the project map fills its box with the site (JB240-1)", () => {
  it("keeps only a thin edge round the fence, not a tenth on each side", () => {
    expect(SITE_FILL).toBeGreaterThanOrEqual(0.95);
    expect(SITE_FILL).toBeLessThan(1);
    // The dashboard's map box: 18 px and 7 px, so the fence line is not cut off.
    expect(sitePadding(900, 352, SITE_FILL)).toEqual([18, 7]);
  });

  it("rounds the zoom down by a tenth of a step at most, not a quarter", () => {
    expect(SITE_ZOOM_SNAP).toBe(0.1);
    // A tenth of a step is at most 7 % of the site's size, a quarter was 16 %.
    expect(1 - 1 / 2 ** SITE_ZOOM_SNAP).toBeLessThan(0.07);
  });

  it("goes two steps past the tiles' closest zoom, so a small site fills the box too", () => {
    expect(SITE_OVERZOOM).toBe(2);
    // At OpenStreetMap's 19 a 352 px high box shows ~105 m: a 60 m site filled ~57 %.
    expect(60 / (352 * metresPerPixel(19))).toBeLessThan(0.6);
    // Two steps further it can fill it.
    expect(60 / (352 * metresPerPixel(19 + SITE_OVERZOOM))).toBeGreaterThan(1);
    expect(map).toContain("maxZoom: MAP_TILE_MAX_ZOOM + SITE_OVERZOOM,\n                animate: false,\n                padding: sitePadding(size.x, size.y, siteFill),");
  });
});

describe("icons that would sit on each other stand apart (JB240-2)", () => {
  it("each moved icon has a thin line and a dot at its real place, and the spread is redone on every zoom", () => {
    expect(map).toContain("spreadPiles(real)");
    expect(map).toContain("L.polyline([at, shown]");
    expect(map).toContain("L.circleMarker(at,");
    expect(map).toContain('map.on("zoomend", spread);');
    expect(map).toContain('map.off("zoomend", spread);');
    // An icon that needs no room goes back to its own place.
    expect(map).toContain("point.setLatLng(at);");
  });

  it("the lines and dots do not take a press: a press still opens the icon's card", () => {
    expect(map.match(/interactive: false/g)?.length).toBe(2);
  });
});
