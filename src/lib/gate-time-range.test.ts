import { describe, expect, it } from "vitest";

import {
  isBackwards,
  normalizeClock,
  quickRange,
  rangeFromDates,
  rangeFromParts,
  shiftDate,
  splitLocal,
  todayRange,
  wallClock,
} from "./gate-time-range";

/**
 * I15 (ID34/ID62): 「昨天 14:00 – 15:00」 on a 24-hour clock, on the company's
 * clock - never the browser's, never UTC. The server reads the same values on
 * the same clock (`site_access.test_gate_talk_and_time`).
 */
const KL = "Asia/Kuala_Lumpur";

describe("the wall clock is the company's, not the browser's", () => {
  it("reads 14:30 in Kuala Lumpur off 06:30 UTC - no eight-hour drift", () => {
    expect(wallClock(new Date("2026-10-14T06:30:00Z"), KL)).toEqual({ date: "2026-10-14", time: "14:30" });
    // The same instant on another clock is another wall time.
    expect(wallClock(new Date("2026-10-14T06:30:00Z"), "UTC")).toEqual({ date: "2026-10-14", time: "06:30" });
  });

  it("is a 24-hour clock, midnight included", () => {
    expect(wallClock(new Date("2026-10-14T16:00:00Z"), KL)).toEqual({ date: "2026-10-15", time: "00:00" });
    expect(wallClock(new Date("2026-10-14T15:59:00Z"), KL).time).toBe("23:59");
  });
});

describe("the quick buttons", () => {
  // 2026-10-15 00:20 in Kuala Lumpur, which is still the 14th in UTC.
  const justAfterMidnight = new Date("2026-10-14T16:20:00Z");

  it("今天 is the whole of the company's today", () => {
    expect(quickRange("today", KL, justAfterMidnight)).toEqual({
      occurred_from: "2026-10-15T00:00",
      occurred_to: "2026-10-15T23:59",
    });
    expect(todayRange(KL, justAfterMidnight)).toEqual(quickRange("today", KL, justAfterMidnight));
  });

  it("昨天 is the whole day before, across a month end too", () => {
    expect(quickRange("yesterday", KL, justAfterMidnight)).toEqual({
      occurred_from: "2026-10-14T00:00",
      occurred_to: "2026-10-14T23:59",
    });
    expect(quickRange("yesterday", KL, new Date("2026-11-01T02:00:00Z"))).toEqual({
      occurred_from: "2026-10-31T00:00",
      occurred_to: "2026-10-31T23:59",
    });
  });

  it("最近 1 小时 reaches back across midnight", () => {
    expect(quickRange("lastHour", KL, justAfterMidnight)).toEqual({
      occurred_from: "2026-10-14T23:20",
      occurred_to: "2026-10-15T00:20",
    });
  });
});

describe("typing a time on a phone keypad", () => {
  it("reads the ways a guard types a 24-hour time", () => {
    expect(normalizeClock("14:00")).toBe("14:00");
    expect(normalizeClock("14")).toBe("14:00");
    expect(normalizeClock("1430")).toBe("14:30");
    expect(normalizeClock("930")).toBe("09:30");
    expect(normalizeClock("9:5")).toBe("09:05");
    expect(normalizeClock("14.30")).toBe("14:30");
    expect(normalizeClock(" 0:00 ")).toBe("00:00");
    expect(normalizeClock("23:59")).toBe("23:59");
  });

  it("refuses what is not a time, a 12-hour time included", () => {
    for (const text of ["", "24:00", "12:60", "2pm", "2:00 PM", "abc", "12345"]) {
      expect(normalizeClock(text), text).toBeNull();
    }
  });
});

describe("the four boxes make one range", () => {
  it("joins date and time; an empty time is the start or end of that day", () => {
    expect(
      rangeFromParts({ fromDate: "2026-10-14", fromTime: "22:00", toDate: "2026-10-15", toTime: "02:00" }, "2026-10-15"),
    ).toEqual({ occurred_from: "2026-10-14T22:00", occurred_to: "2026-10-15T02:00" });
    expect(rangeFromParts({ fromDate: "2026-10-14", fromTime: "", toDate: "2026-10-14", toTime: "" }, "x")).toEqual({
      occurred_from: "2026-10-14T00:00",
      occurred_to: "2026-10-14T23:59",
    });
  });

  it("a time with no date takes the other end's date, else today", () => {
    expect(rangeFromParts({ fromDate: "", fromTime: "14:00", toDate: "2026-10-13", toTime: "" }, "2026-10-15")).toEqual({
      occurred_from: "2026-10-13T14:00",
      occurred_to: "2026-10-13T23:59",
    });
    expect(rangeFromParts({ fromDate: "", fromTime: "14:00", toDate: "", toTime: "15:00" }, "2026-10-15")).toEqual({
      occurred_from: "2026-10-15T14:00",
      occurred_to: "2026-10-15T15:00",
    });
    expect(rangeFromParts({ fromDate: "", fromTime: "", toDate: "", toTime: "" }, "2026-10-15")).toEqual({
      occurred_from: undefined,
      occurred_to: undefined,
    });
  });

  it("splits a bound back into its boxes", () => {
    expect(splitLocal("2026-10-14T14:00")).toEqual({ date: "2026-10-14", time: "14:00" });
    expect(splitLocal("2026-10-14")).toEqual({ date: "2026-10-14", time: "" });
    expect(splitLocal(undefined)).toEqual({ date: "", time: "" });
  });

  it("says when the end is before the start, and not across midnight", () => {
    expect(isBackwards({ occurred_from: "2026-10-14T15:00", occurred_to: "2026-10-14T14:00" })).toBe(true);
    expect(isBackwards({ occurred_from: "2026-10-14T22:00", occurred_to: "2026-10-15T02:00" })).toBe(false);
    expect(isBackwards({ occurred_from: "2026-10-14T22:00" })).toBe(false);
  });

  it("turns an older link's whole days into the same range", () => {
    expect(rangeFromDates({ date_from: "2026-10-14", date_to: "2026-10-15" })).toEqual({
      occurred_from: "2026-10-14T00:00",
      occurred_to: "2026-10-15T23:59",
    });
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });
});
