/**
 * 人员进场 on the phone, by the one fence rule (2026-10-10).
 *
 * Lucas, with a screenshot: 「我不在围栏内可以 clock in，可是 clock out 就不能」.
 * The 进场 went through on a position the phone was no longer at: the form
 * kept its GPS fix in the device draft, and on reopening the tab it showed
 * 「GPS 已准备」 with the saved coordinates instead of asking again - so the
 * first submission after a while carried an old position and the next one,
 * freshly located, was judged where the worker really stood. The phone now
 * holds the fix only while the form is open and takes a new one at submit
 * when it is older than `ATTENDANCE_FIX_MAX_AGE_MS`.
 */
import type { AttendanceRecord } from "@/interfaces/site-operations";

/** A position older than this is taken again before 进场 / 离开 is sent. */
export const ATTENDANCE_FIX_MAX_AGE_MS = 60_000;

export function fixIsFresh(takenAt: number, now: number = Date.now()): boolean {
  return takenAt > 0 && now - takenAt <= ATTENDANCE_FIX_MAX_AGE_MS;
}

/**
 * The words on a record's first badge.
 *
 * Every 进场 used to read 「手动进场」, including the ones the fence wrote by
 * itself with no button pressed - so an automatic entry looked like a manual
 * one the worker could not remember making.
 */
export function attendanceEventLabel(
  row: Pick<AttendanceRecord, "event" | "source">,
): "clockIn" | "clockOut" | "autoIn" | "autoOut" | "systemOut" {
  if (row.source === "SYSTEM") return "systemOut";
  if (row.source === "GEOFENCE") return row.event === "CLOCK_IN" ? "autoIn" : "autoOut";
  return row.event === "CLOCK_IN" ? "clockIn" : "clockOut";
}

/**
 * Metres to the fence, only for a record made outside it.
 *
 * 「围栏范围内 · 距离围栏：50 米」 said in and out at once: inside, there is
 * nothing to walk, so no distance is shown.
 */
export function fenceDistanceShown(
  row: Pick<AttendanceRecord, "geofence_result" | "distance_m">,
): number | null {
  if (row.geofence_result !== "OUTSIDE" || !row.distance_m) return null;
  const metres = Math.ceil(Number(row.distance_m));
  return Number.isFinite(metres) && metres > 0 ? metres : null;
}
