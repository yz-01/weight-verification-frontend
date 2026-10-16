/**
 * I7 (ID23): a saved geofence is only looked at until 「编辑围栏」 is on, the
 * map never re-centres by itself once the reader has it, and every map can
 * fill the screen - the browser's own full screen, or an overlay.
 */
import { describe, expect, it } from "vitest";

import {
  SETTLE_MS,
  fitsOnResize,
  fullscreenMode,
  geofenceClick,
  pointsDraggable,
} from "@/lib/map-view";

describe("a click on the geofence map (I7-1)", () => {
  it("changes nothing while 「编辑围栏」 is off", () => {
    expect(geofenceClick("CIRCLE", false, false)).toBe("none");
    expect(geofenceClick("POLYGON", false, true)).toBe("none");
    expect(geofenceClick("POLYGON", false, false)).toBe("none");
  });

  it("moves the circle's centre, or adds a point while drawing, once it is on", () => {
    expect(geofenceClick("CIRCLE", true, false)).toBe("center");
    expect(geofenceClick("POLYGON", true, true)).toBe("point");
    // A finished polygon: points are added only after 「继续画」.
    expect(geofenceClick("POLYGON", true, false)).toBe("none");
  });

  it("lets the numbered points be dragged only while editing and drawing", () => {
    expect(pointsDraggable(true, true)).toBe(true);
    expect(pointsDraggable(false, true)).toBe(false);
    expect(pointsDraggable(true, false)).toBe(false);
  });
});

describe("the map keeps its view (I7-2)", () => {
  it("fits the fence while its dialog settles, never after the reader moved it", () => {
    expect(fitsOnResize(false, 0)).toBe(true);
    expect(fitsOnResize(false, SETTLE_MS - 1)).toBe(true);
    expect(fitsOnResize(false, SETTLE_MS)).toBe(false);
    expect(fitsOnResize(true, 10)).toBe(false);
  });
});

describe("full screen (I7-3)", () => {
  const element = { requestFullscreen: () => Promise.resolve() };

  it("uses the browser's own full screen where the page may have it", () => {
    expect(fullscreenMode(element, { fullscreenEnabled: true })).toBe("native");
    expect(
      fullscreenMode({ webkitRequestFullscreen: () => undefined }, { webkitFullscreenEnabled: true }),
    ).toBe("native");
  });

  it("lays the map over the whole window where it may not (an iPhone)", () => {
    expect(fullscreenMode({}, { fullscreenEnabled: false })).toBe("overlay");
    expect(fullscreenMode(element, { fullscreenEnabled: false })).toBe("overlay");
    expect(fullscreenMode(element, {})).toBe("overlay");
    expect(fullscreenMode(null, { fullscreenEnabled: true })).toBe("overlay");
  });
});
