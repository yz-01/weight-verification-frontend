/**
 * Rainy Weather 雨天记录 (JB192, 客户 11-13 晚上): the rules the phone and the
 * office share, kept apart from the screens so they can be tested directly.
 *
 * - A rain record is two photographs: one when the rain starts, one when it
 *   stops. The first is held on the phone (`HeldRainRecord`, offline-db
 *   store `rainHeld`) until the second is taken; both then go together.
 * - The duration is the second photo's moment minus the first's, each cut to
 *   the minute first (seconds dropped) - the server's rule, so the phone shows
 *   what the office will count. Never the upload time (客户第 15 点).
 * - Past 12 hours the phone asks 「是不是忘了拍雨停的照片？」 but does not stop it.
 */

import type { HeldRainPhoto, HeldRainRecord, RainRecordOfflineJob, StoredFile } from "@/lib/offline-db";

/** Past this the phone reminds before 【提交雨天记录】 (做法 一.9). */
export const RAIN_LONG_MINUTES = 12 * 60;

/** The time zone the office counts days and months in (Malaysia). */
export const RAIN_TIME_ZONE = "Asia/Kuala_Lumpur";

/** One open rain record per account and project (做法 一.7). */
export function heldRainId(ownerId: string, project: string): string {
  return `rain:${ownerId}:${project}`;
}

/** The queued job of a record: one per record, however often it is pressed. */
export function rainJobId(clientEventId: string): string {
  return `rain-record-job-${clientEventId}`;
}

/** Minutes since 1970 with the seconds dropped, or null for no usable time. */
function wholeMinute(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? Math.floor(time / 60_000) : null;
}

/**
 * The rain's length in whole minutes: end minus start, each cut to the minute
 * first. Zero or less when the second photo is not later; null without both.
 */
export function rainMinutes(start: string | null | undefined, end: string | null | undefined): number | null {
  const from = wholeMinute(start);
  const to = wholeMinute(end);
  return from === null || to === null ? null : to - from;
}

/** The server takes a record only when it lasted at least one minute. */
export function endIsAfterStart(start: string, end: string): boolean {
  const minutes = rainMinutes(start, end);
  return minutes !== null && minutes >= 1;
}

/** 「已经下了 X 小时 Y 分」 - from the first photo to `now`, the same way. */
export function elapsedMinutes(start: string, now: number): number {
  const from = wholeMinute(start);
  if (from === null) return 0;
  return Math.max(0, Math.floor(now / 60_000) - from);
}

/** Over 12 hours: worth asking whether the stop was photographed late. */
export function isLongRain(minutes: number | null | undefined): boolean {
  return typeof minutes === "number" && minutes > RAIN_LONG_MINUTES;
}

/** Hours and the minutes left over, never negative. */
export function durationParts(minutes: number): { hours: number; minutes: number } {
  const total = Math.max(0, Math.floor(minutes));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/**
 * 「1 小时 5 分」, 「45 分钟」: under an hour only the minutes. `t` is the
 * `rainRecords` translator (`duration.hm`, `duration.m`).
 */
export function formatRainDuration(
  minutes: number | null | undefined,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return "—";
  const parts = durationParts(minutes);
  return parts.hours > 0
    ? t("duration.hm", { hours: parts.hours, minutes: parts.minutes })
    : t("duration.m", { minutes: parts.minutes });
}

/** A GPS fix as the phone holds it; a half-known one is no fix at all. */
export interface RainFix {
  latitude?: string;
  longitude?: string;
  accuracy?: string;
}

/** One photograph as the held record keeps it: bytes, moment, fix (both or none). */
export function heldPhoto(file: StoredFile, capturedAt: string, fix?: RainFix | null): HeldRainPhoto {
  const located = Boolean(fix?.latitude && fix?.longitude);
  return {
    file,
    capturedAt,
    ...(located
      ? { latitude: fix!.latitude, longitude: fix!.longitude, ...(fix!.accuracy ? { accuracy: fix!.accuracy } : {}) }
      : {}),
  };
}

/** The record the first photo starts (客户第 2 点), saved on the phone at once. */
export function startHeldRain(input: {
  ownerId: string;
  project: string;
  projectName?: string;
  clientEventId: string;
  start: HeldRainPhoto;
  now?: Date;
}): HeldRainRecord {
  return {
    id: heldRainId(input.ownerId, input.project),
    ownerId: input.ownerId,
    project: input.project,
    ...(input.projectName ? { projectName: input.projectName } : {}),
    clientEventId: input.clientEventId,
    start: input.start,
    savedAt: (input.now ?? new Date()).toISOString(),
  };
}

/** The second photo - or a retake of it (「重拍第二张」) - into the same record. */
export function withEndPhoto(record: HeldRainRecord, end: HeldRainPhoto, now: Date = new Date()): HeldRainRecord {
  return { ...record, end, savedAt: now.toISOString() };
}

/** The coordinates of one photo under the server's names: both or neither. */
function pair(prefix: "start" | "end", photo: HeldRainPhoto): Record<string, string> {
  return photo.latitude && photo.longitude
    ? { [`${prefix}_latitude`]: photo.latitude, [`${prefix}_longitude`]: photo.longitude }
    : {};
}

/**
 * What 【提交雨天记录】 sends, in the server's names (`create_rain_record`):
 * both moments, both fixes, and the record's `client_event_id` from the
 * first photo. `photos` are the queue's own copies (at upload size).
 */
export function rainJobPayload(
  record: HeldRainRecord,
  photos: { start: StoredFile; end: StoredFile },
  deviceId?: string,
): RainRecordOfflineJob["payload"] {
  if (!record.end) throw new Error("The rain record has no second photo yet.");
  return {
    project: record.project,
    client_event_id: record.clientEventId,
    start_captured_at: record.start.capturedAt,
    end_captured_at: record.end.capturedAt,
    ...pair("start", record.start),
    ...pair("end", record.end),
    ...(deviceId ? { device_id: deviceId } : {}),
    start_photo: photos.start,
    end_photo: photos.end,
  };
}

/** What the phone needs of a refusal: the server's code and what it carried. */
export interface RainRefusalFacts {
  status?: number;
  code?: string;
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string | number>;
}

/**
 * The phone's plain words for a refusal of 【提交雨天记录】 (做法 一.10, 二.3),
 * and what the worker can still do. Keys are under `rainRecords.phone.refused`.
 *
 * - Full for this half hour: nothing but 「取消这一次」 - the same record would
 *   be refused again, so 提交 and 重拍 are not offered.
 * - The second photo not later than the first: 「重拍第二张」 (or cancel).
 * - Photos missing: 重拍 or cancel.
 * - Anything else: the server's own sentence; 提交 can be pressed again.
 */
export interface RainRefusal {
  key: string;
  values?: Record<string, string | number>;
  canSubmit: boolean;
  canRetake: boolean;
}

function whole(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

export function rainRefusal(facts: RainRefusalFacts): RainRefusal {
  const code = facts.code ?? "";
  if (code === "rain_record_quota_full") {
    const limit = whole(facts.values?.limit ?? facts.errors?.limit);
    const minutes = whole(facts.values?.minutes ?? facts.errors?.minutes);
    return limit !== null && minutes !== null
      ? { key: "quotaFull", values: { limit, minutes }, canSubmit: false, canRetake: false }
      : { key: "quotaFullPlain", canSubmit: false, canRetake: false };
  }
  if (code === "rain_end_not_after_start") {
    return { key: "endNotAfterStart", canSubmit: false, canRetake: true };
  }
  if (code === "rain_photos_required") {
    return { key: "photosRequired", canSubmit: false, canRetake: true };
  }
  return {
    key: "other",
    values: { reason: facts.message?.trim() || "—" },
    canSubmit: true,
    canRetake: true,
  };
}

/* -------------------------------------------------------------------------
 * The office's month and date range (做法 四.4, 五.1)
 * ---------------------------------------------------------------------- */

/** `YYYY-MM`, nothing else. */
export function isMonth(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** This month on the site's clock (Malaysia), as `YYYY-MM`. */
export function siteMonth(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: RAIN_TIME_ZONE, year: "numeric", month: "2-digit" })
    .format(now)
    .slice(0, 7);
}

/** A month's first and last day, `YYYY-MM-DD`. */
export function monthBounds(month: string): { from: string; to: string } | null {
  if (!isMonth(month)) return null;
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/**
 * What the tab filters by: a month, or a date range - one or the other
 * (choosing a month sets the range to it). With neither chosen it is this
 * month, so the page opens on the month's statistics.
 */
export interface RainPeriod {
  month: string;
  from: string;
  to: string;
}

export function rainPeriod(
  filters: { month?: string; date_from?: string; date_to?: string },
  now: Date = new Date(),
): RainPeriod {
  const from = filters.date_from ?? "";
  const to = filters.date_to ?? "";
  if (isMonth(filters.month)) {
    const bounds = monthBounds(filters.month)!;
    return { month: filters.month, from: bounds.from, to: bounds.to };
  }
  if (from || to) return { month: "", from, to };
  const month = siteMonth(now);
  const bounds = monthBounds(month)!;
  return { month, from: bounds.from, to: bounds.to };
}

/** The query the list and the statistics are read with, in the server's names. */
export function periodQuery(period: RainPeriod): Record<string, string> {
  if (period.month) return { month: period.month };
  return {
    ...(period.from ? { date_from: period.from } : {}),
    ...(period.to ? { date_to: period.to } : {}),
  };
}
