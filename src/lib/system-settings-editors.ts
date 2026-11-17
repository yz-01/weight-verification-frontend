/**
 * JB212 (Lucas 11-16 「把它们真的做出来」): what the 系统设置 editors read and
 * send, kept apart from the screen so it can be checked without one.
 *
 * Each of these rows used to be a JSON box or free text that nothing read.
 * The backend now reads them (and refuses anything else -
 * `platform_settings/catalogue.py`), so the page offers exactly the shapes it
 * takes: ticks, one number, a date picker.
 */

/** 11.2.10 「启用的通知类别」: [SA p.13] 10.2.1–10.2.6, in the page's order. */
export const NOTIFICATION_TYPE_CODES = [
  "COMPANY",
  "SUBSCRIPTION",
  "SAAS_BILLING",
  "COMMISSION_BILLING",
  "CWE",
  "SYSTEM",
] as const;
export type NotificationTypeCode = (typeof NOTIFICATION_TYPE_CODES)[number];

export const REMINDER_DAYS = { min: 1, max: 365, fallback: 30 } as const;
export const DUPLICATE_WINDOW = { min: 10, max: 3600, fallback: 90 } as const;

function parse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** The ticked categories. A value that is not a list reads as every one on,
 *  which is what the platform does when nothing is saved. */
export function readEnabledTypes(value: string): NotificationTypeCode[] {
  const parsed = parse(value);
  if (!Array.isArray(parsed)) return [...NOTIFICATION_TYPE_CODES];
  return NOTIFICATION_TYPE_CODES.filter((code) => parsed.includes(code));
}

/** One tick changed, written back in the page's order. */
export function toggleEnabledType(
  current: readonly NotificationTypeCode[],
  code: NotificationTypeCode,
  on: boolean,
): NotificationTypeCode[] {
  return NOTIFICATION_TYPE_CODES.filter((item) =>
    item === code ? on : current.includes(item),
  );
}

function readNumber(value: string, field: string, fallback: number): number {
  const parsed = parse(value);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const raw = (parsed as Record<string, unknown>)[field];
    const number = typeof raw === "number" ? raw : Number(raw);
    if (raw !== undefined && raw !== null && raw !== "" && Number.isInteger(number)) return number;
  }
  return fallback;
}

/** 「订阅到期前几天开始提醒」 - 30 when nothing is saved. */
export function readReminderDays(value: string): number {
  return readNumber(value, "subscription_reminder_days", REMINDER_DAYS.fallback);
}

/** 「多少秒内再扫算重复使用」 - 90 when nothing is saved. */
export function readDuplicateWindow(value: string): number {
  return readNumber(value, "duplicate_window_seconds", DUPLICATE_WINDOW.fallback);
}

/** Whether a typed number is a whole number inside the allowed range. */
export function wholeNumberInRange(
  typed: string,
  range: { min: number; max: number },
): boolean {
  if (!/^\d+$/.test(typed.trim())) return false;
  const number = Number(typed);
  return number >= range.min && number <= range.max;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A stored ISO time (`2026-12-01T22:00:00+08:00`) as the `datetime-local`
 * picker wants it (`2026-12-01T22:00`), in this computer's time. Blank or
 * unreadable stays blank.
 */
export function toPickerValue(stored: string): string {
  if (!stored) return "";
  const moment = new Date(stored);
  if (Number.isNaN(moment.getTime())) return "";
  return (
    `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}` +
    `T${pad(moment.getHours())}:${pad(moment.getMinutes())}`
  );
}

/**
 * The picker's local time sent with this computer's offset, so the server
 * stores the moment the person meant (`2026-12-01T22:00` in Malaysia →
 * `2026-12-01T22:00:00+08:00`). Blank stays blank.
 */
export function fromPickerValue(local: string): string {
  if (!local) return "";
  const moment = new Date(local);
  if (Number.isNaN(moment.getTime())) return "";
  const offset = -moment.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hours = pad(Math.floor(Math.abs(offset) / 60));
  const minutes = pad(Math.abs(offset) % 60);
  return `${local.length === 16 ? `${local}:00` : local}${sign}${hours}:${minutes}`;
}

/** Why a maintenance window cannot be saved, or null. Either end may be blank
 *  (no start = from switch-on, no end = until switched off). */
export function maintenanceWindowProblem(
  startLocal: string,
  endLocal: string,
): "endBeforeStart" | null {
  if (!startLocal || !endLocal) return null;
  return new Date(endLocal).getTime() <= new Date(startLocal).getTime()
    ? "endBeforeStart"
    : null;
}
