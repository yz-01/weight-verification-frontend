import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ATTENDANCE_FIX_MAX_AGE_MS,
  attendanceEventLabel,
  fenceDistanceShown,
  fixIsFresh,
} from "@/lib/attendance-fence";

describe("the phone's 人员进场 by the fence rule (2026-10-10)", () => {
  it("takes a new position when the one on screen is over a minute old", () => {
    const now = 1_000_000;
    expect(fixIsFresh(now - 5_000, now)).toBe(true);
    expect(fixIsFresh(now - ATTENDANCE_FIX_MAX_AGE_MS - 1, now)).toBe(false);
    // No time at all is never fresh.
    expect(fixIsFresh(0, now)).toBe(false);
  });

  it("names an automatic entry as automatic, not 手动进场", () => {
    expect(attendanceEventLabel({ event: "CLOCK_IN", source: "MANUAL" })).toBe("clockIn");
    expect(attendanceEventLabel({ event: "CLOCK_IN", source: "GEOFENCE" })).toBe("autoIn");
    expect(attendanceEventLabel({ event: "CLOCK_OUT", source: "GEOFENCE" })).toBe("autoOut");
    expect(attendanceEventLabel({ event: "CLOCK_OUT", source: "SYSTEM" })).toBe("systemOut");
  });

  it("shows a distance to the fence only for a record made outside it", () => {
    // The screenshot: 「围栏范围内 · 距离围栏：50 米」.
    expect(fenceDistanceShown({ geofence_result: "INSIDE", distance_m: "50.00" })).toBeNull();
    expect(fenceDistanceShown({ geofence_result: "OUTSIDE", distance_m: "606.20" })).toBe(607);
    expect(fenceDistanceShown({ geofence_result: "OUTSIDE", distance_m: null })).toBeNull();
    expect(fenceDistanceShown({ geofence_result: "NOT_EVALUATED", distance_m: "12" })).toBeNull();
  });
});

describe("the attendance form does not keep an old position", () => {
  const code = readFileSync(
    path.join(process.cwd(), "src", "components", "field-staff", "field-staff-workspace.tsx"),
    "utf8",
  );
  const start = code.indexOf("function FieldAttendancePanel");
  const body = code.slice(start, code.indexOf("\nfunction ", start + 1));

  it("holds the fix in the open form only, never in the saved draft", () => {
    // A draft-restored fix is how a 进场 went through from where the phone
    // used to be.
    expect(start).toBeGreaterThan(-1);
    expect(body).not.toMatch(/useDraftState<LocationFix[^>]*>\("fix"/);
  });

  it("locates again at submit when the fix is stale", () => {
    expect(body).toContain("fixIsFresh(fixAt)");
  });

  it("asks for a new position after each submission", () => {
    // The field otherwise sat empty with no button after a 进场, and the
    // next 离开 could not be sent until the tab was left and reopened.
    expect(body).toMatch(/<LocationField\s+key=\{fixRound\}/);
  });
});
