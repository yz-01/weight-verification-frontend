import { describe, expect, it } from "vitest";

import { claimDateToCapturedAt } from "@/components/sundry-claims/sundry-claim-create";

describe("claimDateToCapturedAt", () => {
  it("leaves today out so the server dates it now", () => {
    expect(claimDateToCapturedAt("2026-10-16", "2026-10-16")).toBeUndefined();
    expect(claimDateToCapturedAt("", "2026-10-16")).toBeUndefined();
  });

  it("sends an earlier day as a time on that day", () => {
    const sent = claimDateToCapturedAt("2026-10-10", "2026-10-16");
    expect(sent).toBeDefined();
    expect(new Date(sent as string).getTime()).toBe(new Date("2026-10-10T12:00:00").getTime());
  });

  it("ignores a date it cannot read", () => {
    expect(claimDateToCapturedAt("not-a-date", "2026-10-16")).toBeUndefined();
  });
});
