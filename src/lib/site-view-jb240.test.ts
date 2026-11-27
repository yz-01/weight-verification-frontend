/**
 * JB240 (客户 11-23 事项 12-2): 「请检查地图上的人员、材料卸货、机械设备及现场记录
 * 图标，避免全部挤在一起，影响查看。」 - icons that would sit on each other at
 * this zoom are set apart round their middle; an icon on its own stays put.
 */
import { describe, expect, it } from "vitest";

import { ICON_CLASH_PX, ICON_SPREAD_PX, spreadPiles, type ScreenPoint } from "@/lib/site-view";

const apart = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(a.x - b.x, a.y - b.y);

function closest(points: ScreenPoint[]): number {
  let best = Infinity;
  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) best = Math.min(best, apart(points[a], points[b]));
  }
  return best;
}

describe("spreadPiles", () => {
  it("leaves icons that do not touch where they are", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: ICON_CLASH_PX + 1 },
    ];
    expect(spreadPiles(points)).toEqual(points);
    expect(spreadPiles([])).toEqual([]);
    expect(spreadPiles([{ x: 5, y: 7 }])).toEqual([{ x: 5, y: 7 }]);
  });

  it("two icons on the same spot stand left and right of it, the set gap apart", () => {
    const [left, right] = spreadPiles([
      { x: 200, y: 100 },
      { x: 200, y: 100 },
    ]);
    expect(left.x).toBeCloseTo(200 - ICON_SPREAD_PX / 2);
    expect(right.x).toBeCloseTo(200 + ICON_SPREAD_PX / 2);
    expect(left.y).toBeCloseTo(100);
    expect(right.y).toBeCloseTo(100);
  });

  it("a worker, a delivery, a machine and a record at the gate: four icons on a ring, none on another", () => {
    const gate = [
      { x: 300, y: 300 },
      { x: 304, y: 302 },
      { x: 298, y: 306 },
      { x: 310, y: 296 },
    ];
    const placed = spreadPiles(gate);
    expect(closest(placed)).toBeGreaterThanOrEqual(ICON_SPREAD_PX - 0.001);
    // Round the pile's middle, not thrown across the site.
    const middle = { x: 303, y: 301 };
    for (const point of placed) expect(apart(point, middle)).toBeLessThan(ICON_SPREAD_PX * 2);
  });

  it("a pile is whatever touches through neighbours, of any layer", () => {
    // A chain 30 px apart: each touches the next, so all three are one pile.
    const placed = spreadPiles([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 60, y: 0 },
      { x: 500, y: 500 },
    ]);
    expect(closest(placed.slice(0, 3))).toBeGreaterThanOrEqual(ICON_SPREAD_PX - 0.001);
    expect(placed[3]).toEqual({ x: 500, y: 500 });
  });

  it("thirty icons on one spot spiral out, none on another", () => {
    const pile = Array.from({ length: 30 }, () => ({ x: 400, y: 200 }));
    const placed = spreadPiles(pile);
    // Along the spiral each stands a gap from the next; the turns are a gap apart too.
    expect(closest(placed)).toBeGreaterThan(ICON_SPREAD_PX * 0.85);
  });

  it("spreads the same way every time, so a refresh does not shuffle the icons", () => {
    const pile = [
      { x: 10, y: 10 },
      { x: 12, y: 11 },
      { x: 9, y: 14 },
    ];
    expect(spreadPiles(pile)).toEqual(spreadPiles(pile));
    // The input is not changed.
    expect(pile[0]).toEqual({ x: 10, y: 10 });
  });

  it("zoomed in far enough, the same places need no spreading", () => {
    // At one zoom the two are 20 px apart and touch; two zoom steps in they are 80 px apart.
    const far = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
    ];
    expect(spreadPiles(far)).toEqual(far);
    const near = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ];
    expect(spreadPiles(near)).not.toEqual(near);
  });
});
