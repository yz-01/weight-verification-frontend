/**
 * J23 (Q23-1): a map can be made bigger or smaller and zoomed, and none of
 * it moves a fence - each fence is drawn from its own stored coordinates.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { HeadquartersProject } from "@/interfaces/headquarters";
import messages from "@/messages/zh.json";

const { MapFrame, clampMapHeight, MAP_MIN_HEIGHT, MAP_MAX_HEIGHT } = await import(
  "@/components/shared/map-frame"
);
const { fenceZones } = await import("@/components/dashboard/headquarters-map");

describe("resizing a map (J23-1)", () => {
  it("keeps the height between its smallest and largest", () => {
    expect(clampMapHeight(10)).toBe(MAP_MIN_HEIGHT);
    expect(clampMapHeight(5000)).toBe(MAP_MAX_HEIGHT);
    expect(clampMapHeight(480.4)).toBe(480);
  });

  it("puts a drag handle under every map, named for a screen reader", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <MapFrame sizeKey="test">
          <div />
        </MapFrame>
      </NextIntlClientProvider>,
    );
    expect(html).toContain("data-map-resize");
    expect(html).toContain("拖动调整地图大小");
  });
});

describe("a project's fences on the map (J23-3, J23-4)", () => {
  const polygon: Array<[number, number]> = [
    [3.14, 101.71],
    [3.14, 101.712],
    [3.142, 101.712],
  ];
  const project = {
    id: "p1",
    code: "P-1",
    fences: [
      { id: "f1", name: "Main gate", shape: "CIRCLE", latitude: "3.1425000", longitude: "101.7183000", radius_m: 100, polygon: [], is_primary: true },
      { id: "f2", name: "Yard", shape: "POLYGON", latitude: null, longitude: null, radius_m: null, polygon, is_primary: false },
    ],
  } as unknown as HeadquartersProject;

  it("draws each fence from its stored coordinates, the main one solid", () => {
    const [main, yard] = fenceZones(project);
    expect(main).toEqual({ id: "f1", center: [3.1425, 101.7183], radiusM: 100, label: "P-1 · Main gate", dashed: false });
    expect(yard.points).toBe(polygon);
    expect(yard.dashed).toBe(true);
  });

  it("draws nothing for a project without fences", () => {
    expect(fenceZones({ ...project, fences: [] })).toEqual([]);
    expect(fenceZones({ ...project, fences: undefined })).toEqual([]);
  });
});
