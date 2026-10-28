import { describe, expect, it } from "vitest";

import { PAGE_RATIO, cropBox, frameBox } from "@/lib/passport-frame";

describe("passport frame", () => {
  it("is the data page's shape, as wide as fits a portrait picture", () => {
    const box = frameBox(1080, 1920);
    expect(box.width).toBeCloseTo(972);
    expect(box.width / box.height).toBeCloseTo(PAGE_RATIO);
    expect(box.leftPct).toBeCloseTo(5);
    expect(box.topPct + box.heightPct / 2).toBeCloseTo(50);
  });

  it("fits the height of a landscape picture", () => {
    const box = frameBox(1920, 1080);
    expect(box.height).toBeCloseTo(864);
    expect(box.width / box.height).toBeCloseTo(PAGE_RATIO);
    expect(box.x).toBeGreaterThan(0);
  });

  it("keeps a margin, stays inside the picture and is at most 2000 px", () => {
    const crop = cropBox(1080, 1920);
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1080);
    expect(crop.height).toBeGreaterThan(frameBox(1080, 1920).height);
    const big = cropBox(4000, 3000);
    expect(Math.max(big.outWidth, big.outHeight)).toBeLessThanOrEqual(2000);
  });
});
