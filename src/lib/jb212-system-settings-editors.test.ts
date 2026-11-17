/**
 * JB212 (Lucas 11-16 「把它们真的做出来」): the values behind the 系统设置
 * editors that replaced the JSON boxes - ticks for 通知类别, one number for the
 * reminder days and the 重复使用 seconds, a picker for the maintenance times.
 * The runner is on Asia/Kuala_Lumpur (vitest.config.ts), as the office is.
 */
import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_TYPE_CODES,
  fromPickerValue,
  maintenanceWindowProblem,
  readDuplicateWindow,
  readEnabledTypes,
  readReminderDays,
  toPickerValue,
  toggleEnabledType,
  wholeNumberInRange,
  DUPLICATE_WINDOW,
  REMINDER_DAYS,
} from "@/lib/system-settings-editors";

describe("通知类别 ticks (JB212-1)", () => {
  it("are the six platform categories of 10.2.1–10.2.6", () => {
    expect(NOTIFICATION_TYPE_CODES).toEqual([
      "COMPANY", "SUBSCRIPTION", "SAAS_BILLING", "COMMISSION_BILLING", "CWE", "SYSTEM",
    ]);
  });

  it("read the saved list, drop unknown codes and keep the page order", () => {
    expect(readEnabledTypes('["CWE","COMPANY","NOPE"]')).toEqual(["COMPANY", "CWE"]);
    expect(readEnabledTypes("[]")).toEqual([]);
  });

  it("read nothing sensible as every category on (the server's own default)", () => {
    expect(readEnabledTypes("")).toEqual([...NOTIFICATION_TYPE_CODES]);
    expect(readEnabledTypes("{}")).toEqual([...NOTIFICATION_TYPE_CODES]);
  });

  it("toggle one tick and write back in the page order", () => {
    expect(toggleEnabledType(["CWE", "COMPANY"], "SYSTEM", true)).toEqual(["COMPANY", "CWE", "SYSTEM"]);
    expect(toggleEnabledType(["COMPANY", "CWE"], "COMPANY", false)).toEqual(["CWE"]);
  });
});

describe("reminder days and the 重复使用 window (JB212-2, JB212-3)", () => {
  it("read the saved number, or today's 30 days / 90 seconds", () => {
    expect(readReminderDays('{"subscription_reminder_days": 10}')).toBe(10);
    expect(readReminderDays("{}")).toBe(30);
    expect(readReminderDays("not json")).toBe(30);
    expect(readDuplicateWindow('{"duplicate_window_seconds": 600}')).toBe(600);
    expect(readDuplicateWindow("{}")).toBe(90);
  });

  it("only accept a whole number inside the range", () => {
    expect(wholeNumberInRange("10", REMINDER_DAYS)).toBe(true);
    expect(wholeNumberInRange("0", REMINDER_DAYS)).toBe(false);
    expect(wholeNumberInRange("366", REMINDER_DAYS)).toBe(false);
    expect(wholeNumberInRange("2.5", REMINDER_DAYS)).toBe(false);
    expect(wholeNumberInRange("", REMINDER_DAYS)).toBe(false);
    expect(wholeNumberInRange("9", DUPLICATE_WINDOW)).toBe(false);
    expect(wholeNumberInRange("3600", DUPLICATE_WINDOW)).toBe(true);
  });
});

describe("maintenance date pickers (JB212-6)", () => {
  it("show a stored time in the office's own time", () => {
    expect(toPickerValue("2026-12-01T22:00:00+08:00")).toBe("2026-12-01T22:00");
    expect(toPickerValue("2026-12-01T14:00:00Z")).toBe("2026-12-01T22:00");
    expect(toPickerValue("")).toBe("");
    expect(toPickerValue("garbage")).toBe("");
  });

  it("send the picked time with the office's offset", () => {
    expect(fromPickerValue("2026-12-01T22:00")).toBe("2026-12-01T22:00:00+08:00");
    expect(fromPickerValue("")).toBe("");
  });

  it("refuse an end that is not after the start, and allow either end blank", () => {
    expect(maintenanceWindowProblem("2026-12-01T22:00", "2026-12-01T21:00")).toBe("endBeforeStart");
    expect(maintenanceWindowProblem("2026-12-01T22:00", "2026-12-01T22:00")).toBe("endBeforeStart");
    expect(maintenanceWindowProblem("2026-12-01T22:00", "2026-12-02T02:00")).toBeNull();
    expect(maintenanceWindowProblem("", "2026-12-02T02:00")).toBeNull();
    expect(maintenanceWindowProblem("2026-12-01T22:00", "")).toBeNull();
  });
});
