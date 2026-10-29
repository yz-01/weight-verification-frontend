import { describe, expect, it } from "vitest";

import { compactStamp } from "@/lib/compact-stamp";

const NOW = new Date("2026-10-29T06:00:00Z");

describe("compactStamp (JB71: 最后确认时间 readable at any width)", () => {
  it("is day/month and the clock this year, in the company's zone", () => {
    // 06:35 UTC is 14:35 in Kuala Lumpur.
    expect(compactStamp("2026-10-28T06:35:00Z", "Asia/Kuala_Lumpur", "14:35", NOW)).toBe("28/10 14:35");
  });

  it("names the year of another year", () => {
    expect(compactStamp("2025-12-31T20:00:00Z", "Asia/Kuala_Lumpur", "04:00", NOW)).toBe("01/01 04:00");
    expect(compactStamp("2025-03-02T02:00:00Z", "Asia/Kuala_Lumpur", "10:00", NOW)).toBe("02/03/2025 10:00");
  });

  it("is short enough for the row", () => {
    expect(compactStamp("2026-10-28T06:35:00Z", "Asia/Kuala_Lumpur", "02:35 PM", NOW).length).toBeLessThanOrEqual(14);
  });

  it("says nothing for no date", () => {
    expect(compactStamp(null, "Asia/Kuala_Lumpur", "", NOW)).toBe("");
    expect(compactStamp("nonsense", "Asia/Kuala_Lumpur", "", NOW)).toBe("");
  });
});
