/**
 * JB222 (客户 11-19 事项 2): 「让整个工地占据地图约80%的空间」, and many points at
 * one spot read as one icon with a number.
 */
import { describe, expect, it } from "vitest";

import { groupNearby, metresApart, sitePadding, type LatLng } from "@/lib/site-view";

const GATE: LatLng = [3.1425, 101.7183];
/** About 5 m north of the gate. */
const BESIDE: LatLng = [3.142545, 101.7183];
/** About 50 m north. */
const OFFICE: LatLng = [3.14295, 101.7183];

describe("sitePadding", () => {
  it("leaves a tenth of the map on each side, so the site fills 80 %", () => {
    expect(sitePadding(800, 400, 0.8)).toEqual([80, 40]);
    const [x, y] = sitePadding(1000, 600, 0.8);
    expect((1000 - 2 * x) / 1000).toBeCloseTo(0.8);
    expect((600 - 2 * y) / 600).toBeCloseTo(0.8);
  });

  it("never pads past the map or below nothing", () => {
    expect(sitePadding(500, 300, 1)).toEqual([0, 0]);
    expect(sitePadding(500, 300, 2)).toEqual([0, 0]);
    expect(sitePadding(500, 300, -1)).toEqual([250, 150]);
  });
});

describe("groupNearby", () => {
  it("puts what stands within 8 m on one icon, in the order given", () => {
    expect(metresApart(GATE, BESIDE)).toBeLessThan(8);
    expect(metresApart(GATE, OFFICE)).toBeGreaterThan(40);
    const items = [
      { id: "a", at: GATE },
      { id: "b", at: OFFICE },
      { id: "c", at: BESIDE },
    ];
    const groups = groupNearby(items, (item) => item.at, 8);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([["a", "c"], ["b"]]);
    expect(groups[0].at).toEqual(GATE);
  });

  it("leaves out a point with no place", () => {
    const groups = groupNearby(
      [
        { id: "a", at: [Number.NaN, 101.7] as LatLng },
        { id: "b", at: [0, 0] as LatLng },
        { id: "c", at: GATE },
      ],
      (item) => item.at,
    );
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([["c"]]);
  });
});
