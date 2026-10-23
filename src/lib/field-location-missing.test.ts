import { describe, expect, it } from "vitest";

import { asFix, NO_LOCATION } from "@/lib/field-location";

describe("a missing position (Lucas 2026-10-23, choice A)", () => {
  it("sends no coordinates at all", () => {
    expect(NO_LOCATION.latitude).toBeUndefined();
    expect(NO_LOCATION.longitude).toBeUndefined();
    expect(JSON.parse(JSON.stringify({ latitude: NO_LOCATION.latitude }))).toEqual({});
  });

  it("is never taken for a fix by forms that need one", () => {
    expect(asFix(NO_LOCATION)).toBeNull();
    expect(asFix(null)).toBeNull();
    const fix = { latitude: "3.1390000", longitude: "101.6869000", accuracy: "12.00" };
    expect(asFix(fix)).toBe(fix);
  });
});
