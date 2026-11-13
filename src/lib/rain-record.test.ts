/**
 * JB192 (客户 11-13 晚上): Rainy Weather 雨天记录 - the rules the phone and the
 * office share.
 *
 * > 4. 两张照片完成后一起提交，形成一份完整的雨天记录，系统自动计算本次下雨时长。
 * > 15. 系统根据两张照片的实际拍摄时间，自动计算每次下雨的小时及分钟，不使用上传时间计算。
 */
import { describe, expect, it } from "vitest";

import {
  durationParts,
  elapsedMinutes,
  endIsAfterStart,
  formatRainDuration,
  heldPhoto,
  heldRainId,
  isLongRain,
  monthBounds,
  periodQuery,
  rainJobId,
  rainJobPayload,
  rainMinutes,
  rainPeriod,
  rainRefusal,
  siteMonth,
  startHeldRain,
  withEndPhoto,
} from "@/lib/rain-record";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import { createTranslator } from "next-intl";

const bytes = (name: string) => ({ bytes: new ArrayBuffer(2), name, type: "image/jpeg", lastModified: 1 });

describe("the duration (做法 四.1)", () => {
  it("is end minus start, each cut to the minute first - never the upload time", () => {
    // 14:05:59 → 15:10:01 is 65 minutes: the seconds are dropped on both.
    expect(rainMinutes("2026-11-13T06:05:59Z", "2026-11-13T07:10:01Z")).toBe(65);
    expect(rainMinutes("2026-11-13T06:05:00Z", "2026-11-13T06:05:59Z")).toBe(0);
    expect(rainMinutes("2026-11-13T06:05:00Z", undefined)).toBeNull();
  });

  it("must be at least one minute (做法 四.1: 第二张不晚于第一张的拒收)", () => {
    expect(endIsAfterStart("2026-11-13T06:05:10Z", "2026-11-13T06:06:00Z")).toBe(true);
    expect(endIsAfterStart("2026-11-13T06:05:10Z", "2026-11-13T06:05:50Z")).toBe(false);
    expect(endIsAfterStart("2026-11-13T06:05:00Z", "2026-11-13T06:00:00Z")).toBe(false);
  });

  it("reads 「X 小时 Y 分」, under an hour only the minutes, in four languages", () => {
    expect(durationParts(65)).toEqual({ hours: 1, minutes: 5 });
    expect(durationParts(-3)).toEqual({ hours: 0, minutes: 0 });
    const words = (messages: typeof zh, locale: string) => {
      const t = createTranslator({ locale, messages, namespace: "rainRecords" });
      return [65, 45, 120].map((minutes) => formatRainDuration(minutes, (key, values) => t(key as never, values as never)));
    };
    expect(words(zh, "zh")).toEqual(["1 小时 5 分", "45 分钟", "2 小时 0 分"]);
    expect(words(zhTW, "zh-TW")).toEqual(["1 小時 5 分", "45 分鐘", "2 小時 0 分"]);
    expect(words(en, "en")).toEqual(["1h 5m", "45m", "2h 0m"]);
    expect(words(ms, "ms")).toEqual(["1 j 5 min", "45 min", "2 j 0 min"]);
    expect(formatRainDuration(null, () => "x")).toBe("—");
  });

  it("ticks 「已经下了」 from the first photo the same way", () => {
    const start = "2026-11-13T06:05:59Z";
    expect(elapsedMinutes(start, Date.parse("2026-11-13T07:10:01Z"))).toBe(65);
    expect(elapsedMinutes(start, Date.parse("2026-11-13T06:00:00Z"))).toBe(0);
  });

  it("reminds past 12 hours, not at 12 hours (做法 一.9)", () => {
    expect(isLongRain(12 * 60)).toBe(false);
    expect(isLongRain(12 * 60 + 1)).toBe(true);
    expect(isLongRain(null)).toBe(false);
  });
});

describe("the record held on the phone (做法 一.2, 一.3, 一.7)", () => {
  it("is one per account and project", () => {
    expect(heldRainId("u-1", "p-1")).toBe("rain:u-1:p-1");
    expect(heldRainId("u-1", "p-2")).not.toBe(heldRainId("u-1", "p-1"));
    expect(heldRainId("u-2", "p-1")).not.toBe(heldRainId("u-1", "p-1"));
  });

  it("keeps the photo's bytes, moment and a whole GPS fix - or none", () => {
    const located = heldPhoto(bytes("a.jpg"), "2026-11-13T06:05:00Z", {
      latitude: "3.1",
      longitude: "101.6",
      accuracy: "8",
    });
    expect(located).toMatchObject({ capturedAt: "2026-11-13T06:05:00Z", latitude: "3.1", longitude: "101.6" });
    expect(located.file.bytes).toBeInstanceOf(ArrayBuffer);
    const half = heldPhoto(bytes("a.jpg"), "2026-11-13T06:05:00Z", { latitude: "3.1" });
    expect(half.latitude).toBeUndefined();
    expect(heldPhoto(bytes("a.jpg"), "2026-11-13T06:05:00Z", null)).not.toHaveProperty("latitude");
  });

  it("starts with the first photo and its event id, then takes (or retakes) the second", () => {
    const start = heldPhoto(bytes("a.jpg"), "2026-11-13T06:05:00Z");
    const record = startHeldRain({
      ownerId: "u-1",
      project: "p-1",
      projectName: "Site A",
      clientEventId: "rain-1",
      start,
      now: new Date("2026-11-13T06:05:01Z"),
    });
    expect(record).toMatchObject({ id: "rain:u-1:p-1", clientEventId: "rain-1", projectName: "Site A" });
    expect(record.end).toBeUndefined();
    const ended = withEndPhoto(record, heldPhoto(bytes("b.jpg"), "2026-11-13T07:10:00Z"));
    const retaken = withEndPhoto(ended, heldPhoto(bytes("c.jpg"), "2026-11-13T07:12:00Z"));
    expect(retaken.end?.file.name).toBe("c.jpg");
    // The same record, the same event id: a retake is not a new record.
    expect(retaken.clientEventId).toBe("rain-1");
    expect(retaken.start).toBe(start);
  });
});

describe("what 【提交雨天记录】 sends (接口 1)", () => {
  const record = withEndPhoto(
    startHeldRain({
      ownerId: "u-1",
      project: "p-1",
      clientEventId: "rain-1",
      start: heldPhoto(bytes("a.jpg"), "2026-11-13T06:05:00Z", { latitude: "3.1", longitude: "101.6" }),
    }),
    heldPhoto(bytes("b.jpg"), "2026-11-13T07:10:00Z"),
  );

  it("names every field as the server does, with the first photo's event id", () => {
    const start = bytes("small-a.jpg");
    const end = bytes("small-b.jpg");
    expect(rainJobPayload(record, { start, end }, "device-1")).toEqual({
      project: "p-1",
      client_event_id: "rain-1",
      start_captured_at: "2026-11-13T06:05:00Z",
      end_captured_at: "2026-11-13T07:10:00Z",
      start_latitude: "3.1",
      start_longitude: "101.6",
      device_id: "device-1",
      start_photo: start,
      end_photo: end,
    });
    // No GPS for the second photo: neither half is sent.
    expect(rainJobPayload(record, { start, end })).not.toHaveProperty("end_latitude");
    expect(rainJobId("rain-1")).toBe("rain-record-job-rain-1");
  });

  it("is never built without the second photo", () => {
    const { end: _end, ...open } = record;
    void _end;
    expect(() => rainJobPayload(open, { start: bytes("a"), end: bytes("b") })).toThrow();
  });
});

describe("a refusal in plain words (做法 一.10, 二.3; JB192-8)", () => {
  it("full for this half hour: only 「取消这一次」, with the project's numbers", () => {
    expect(
      rainRefusal({ status: 409, code: "rain_record_quota_full", errors: { limit: "5", minutes: "30" } }),
    ).toEqual({ key: "quotaFull", values: { limit: 5, minutes: 30 }, canSubmit: false, canRetake: false });
    expect(rainRefusal({ status: 409, code: "rain_record_quota_full" })).toMatchObject({
      key: "quotaFullPlain",
      canSubmit: false,
      canRetake: false,
    });
  });

  it("the second photo not later: retake it", () => {
    expect(rainRefusal({ status: 400, code: "rain_end_not_after_start" })).toMatchObject({
      key: "endNotAfterStart",
      canRetake: true,
      canSubmit: false,
    });
    expect(rainRefusal({ status: 400, code: "rain_photos_required" })).toMatchObject({ key: "photosRequired" });
  });

  it("anything else: the server's sentence, and 提交 can be pressed again", () => {
    expect(rainRefusal({ status: 403, code: "permission_denied", message: "你没有权限做这件事。" })).toEqual({
      key: "other",
      values: { reason: "你没有权限做这件事。" },
      canSubmit: true,
      canRetake: true,
    });
  });

  it("is worded in all four languages, saying 你 not 您", () => {
    const keys = ["quotaFull", "quotaFullPlain", "endNotAfterStart", "photosRequired", "other"];
    for (const messages of [zh, zhTW, en, ms]) {
      for (const key of keys) {
        const text = (messages.rainRecords.phone.refused as Record<string, string>)[key];
        expect(text, key).toBeTruthy();
      }
    }
    expect(JSON.stringify(zh.rainRecords)).not.toContain("您");
    expect(JSON.stringify(zhTW.rainRecords)).not.toContain("您");
    expect(zh.rainRecords.phone.refused.quotaFull).toContain("取消这一次");
  });
});

describe("the office's month or date range (做法 四.4)", () => {
  it("knows a month's first and last day", () => {
    expect(monthBounds("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(monthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthBounds("2026-13")).toBeNull();
  });

  it("counts the month on Malaysian time", () => {
    // 31 Oct 17:00 UTC is already 1 Nov in Kuala Lumpur.
    expect(siteMonth(new Date("2026-10-31T17:00:00Z"))).toBe("2026-11");
  });

  it("is a month or a range - one or the other - and this month when neither", () => {
    const now = new Date("2026-11-13T04:00:00Z");
    expect(rainPeriod({ month: "2026-10", date_from: "2026-11-01" }, now)).toEqual({
      month: "2026-10",
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(rainPeriod({ date_from: "2026-11-03", date_to: "2026-11-09" }, now)).toEqual({
      month: "",
      from: "2026-11-03",
      to: "2026-11-09",
    });
    expect(rainPeriod({}, now)).toEqual({ month: "2026-11", from: "2026-11-01", to: "2026-11-30" });
    expect(periodQuery(rainPeriod({ month: "2026-10" }, now))).toEqual({ month: "2026-10" });
    expect(periodQuery(rainPeriod({ date_from: "2026-11-03", date_to: "2026-11-09" }, now))).toEqual({
      date_from: "2026-11-03",
      date_to: "2026-11-09",
    });
  });
});
