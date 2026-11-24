/**
 * JB222 changed the shared map for one map only: the project dashboard's
 * (`siteFill`, `overlay`, `popups={false}`) and head office's opening view
 * (`fitTo="markers"`, `fitMaxZoom`). Every other map - the MSE admin map
 * (JB220 hides its project pins), the geofence editor, 人员实时位置, the driver
 * routes - must open and behave exactly as before. These pins say so: the
 * defaults are today's behaviour, and nobody else passes the new props.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(path.join(process.cwd(), dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(process.cwd(), rel)).isDirectory()) return walk(rel);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [rel] : [];
  });
}

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), "src", file), "utf8").replace(/\r\n/g, "\n");

const map = read("components/shared/location-map.tsx");
const frame = read("components/shared/map-frame.tsx");

describe("the shared map's defaults are what every map had before JB222", () => {
  it("defaults: fit everything, zoom at most 16, popups on, no fill, no overlay", () => {
    expect(map).toMatch(/fitTo = "all",/);
    expect(map).toMatch(/fitMaxZoom = 16,/);
    expect(map).toMatch(/popups = true,/);
    expect(map).toMatch(/\n  siteFill,\n/);
    expect(map).toMatch(/\n  spreadOverlaps = false,\n/);
    expect(map).toMatch(/\n  overlay,\n/);
  });

  it("a site map without siteFill still fits its fence with 24 px and zoom 17", () => {
    expect(map).toContain('map.fitBounds(fence, { maxZoom: 17, animate: false, padding: [24, 24] });');
    expect(map).toContain("map.fitBounds(target.pad(0.15), { maxZoom: fitMaxZoom, animate: false });");
    // In-between zoom steps only for a fill-to-share map.
    expect(map).toContain("...(siteFillRef.current ? { zoomSnap: SITE_ZOOM_SNAP } : {}),");
    // Drawn past the tiles' closest zoom (JB240) only for a fill-to-share map too.
    expect(map).toContain(
      "...(siteFillRef.current ? { maxNativeZoom: MAP_TILE_MAX_ZOOM, maxZoom: MAP_TILE_MAX_ZOOM + SITE_OVERZOOM } : {}),",
    );
    // Icons are spread only when asked (JB240).
    expect(map).toContain("if (!spreadOverlaps || drawn.length < 2) return;");
  });

  it("the frame draws an overlay only when one is given", () => {
    expect(frame).toMatch(/\{overlay \? <MapFrameContext\.Provider value=\{frameState\}>\{overlay\}<\/MapFrameContext\.Provider> : null\}/);
  });
});

describe("only the two JB222 maps use the new props", () => {
  const users = walk("src")
    .map((file) => ({ file, text: readFileSync(path.join(process.cwd(), file), "utf8") }))
    .filter(({ text }) => text.includes("<LocationMap"));

  it("finds the maps it guards, the MSE admin map among them", () => {
    const files = users.map(({ file }) => file);
    expect(files.some((file) => file.endsWith("dashboard/admin-dashboard.tsx"))).toBe(true);
    expect(files.length).toBeGreaterThan(8);
  });

  it("siteFill, spreadOverlaps, overlay and popups={false}: the project dashboard's map only", () => {
    for (const { file, text } of users) {
      const mine = file.endsWith("dashboard/project-site-map.tsx");
      for (const prop of [/\bsiteFill=/, /\bspreadOverlaps\b/, /\boverlay=\{/, /\bpopups=\{false\}/]) {
        expect(prop.test(text), `${file} ${prop}`).toBe(mine);
      }
    }
  });

  it("fitTo and fitMaxZoom: head office's map only", () => {
    for (const { file, text } of users) {
      const mine = file.endsWith("dashboard/headquarters-map.tsx");
      expect(/\bfitTo=/.test(text), file).toBe(mine);
      expect(/\bfitMaxZoom=/.test(text), file).toBe(mine);
    }
  });
});
