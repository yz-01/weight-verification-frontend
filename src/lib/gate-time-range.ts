/**
 * 「开始日期 时间 – 结束日期 时间」, on a 24-hour clock (I15, ID34/ID62).
 *
 * The client: 「门岗记录必须要按日期和时间搜索比如说昨天发生事情了，要查回门岗，从
 * 2:00那段时间这样搜索」, and Lucas: 「按日期和时间24小时的时间，不是日期至日期」.
 *
 * A bound travels as `YYYY-MM-DDTHH:mm` with no offset - the wall clock the
 * office reads - in the address (`occurred_from` / `occurred_to`) and to the
 * server, which reads it on the company's clock (`site_access.services.
 * occurred_window`). Nothing here converts to UTC: a browser on another
 * clock would otherwise move the window by its own offset, the eight-hour
 * mistake this filter must not make. The quick buttons work out "now" on the
 * company's clock for the same reason.
 *
 * Pure: no React, no request. The control is `date-time-range-filter.tsx`.
 */

export interface LocalRange {
  occurred_from?: string;
  occurred_to?: string;
}

export type QuickRange = "today" | "yesterday" | "lastHour";

export const QUICK_RANGES: readonly QuickRange[] = ["today", "yesterday", "lastHour"];

/** Where an empty start or end time lands: the whole of that day. */
export const DAY_START = "00:00";
export const DAY_END = "23:59";

/** `YYYY-MM-DD` and `HH:mm` of an instant, read on `timeZone`'s clock. */
export function wallClock(instant: Date, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  // Some engines still say 24 for midnight under h23's older spelling.
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
}

/** A calendar date `days` away, by the calendar alone (no clock, no zone). */
export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** 今天 / 昨天 / 最近 1 小时, on the company's clock. */
export function quickRange(kind: QuickRange, timeZone: string, now: Date = new Date()): Required<LocalRange> {
  const here = wallClock(now, timeZone);
  if (kind === "lastHour") {
    // Worked out from the instant, so 00:20 reaches back to 23:20 yesterday.
    const before = wallClock(new Date(now.getTime() - 60 * 60 * 1000), timeZone);
    return {
      occurred_from: joinLocal(before.date, before.time),
      occurred_to: joinLocal(here.date, here.time),
    };
  }
  const day = kind === "today" ? here.date : shiftDate(here.date, -1);
  return { occurred_from: joinLocal(day, DAY_START), occurred_to: joinLocal(day, DAY_END) };
}

/** Today, the whole day, on the company's clock (the dashboard's 今日照片). */
export function todayRange(timeZone: string, now: Date = new Date()): Required<LocalRange> {
  return quickRange("today", timeZone, now);
}

/** `YYYY-MM-DDTHH:mm` from its two halves. */
export function joinLocal(date: string, time: string): string {
  return `${date}T${time}`;
}

/** The date and the `HH:mm` of a bound; a bare date has no time. */
export function splitLocal(value: string | undefined): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  const [date, time = ""] = value.split("T");
  return { date: date.slice(0, 10), time: time.slice(0, 5) };
}

/**
 * What somebody typed into a time box, as `HH:mm` on a 24-hour clock, or
 * null when it is not a time. Typing is forgiving on a phone keypad:
 * 「14」 is 14:00, 「1430」 and 「14.30」 are 14:30, 「930」 is 09:30.
 */
export function normalizeClock(text: string): string | null {
  const value = text.trim().replace(/[.：]/g, ":");
  let hour: number;
  let minute: number;
  let match = /^(\d{1,2})$/.exec(value);
  if (match) {
    hour = Number(match[1]);
    minute = 0;
  } else if ((match = /^(\d{1,2}):(\d{1,2})$/.exec(value))) {
    hour = Number(match[1]);
    minute = Number(match[2]);
  } else if ((match = /^(\d{1,2})(\d{2})$/.exec(value))) {
    hour = Number(match[1]);
    minute = Number(match[2]);
  } else {
    return null;
  }
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * The range from the four boxes. An end with a date but no time is the end
 * of that day; a time with no date takes the other end's date, else today -
 * a guard typing only 「14:00」 means today's 14:00.
 */
export function rangeFromParts(
  parts: { fromDate: string; fromTime: string; toDate: string; toTime: string },
  today: string,
): LocalRange {
  const fromDate = parts.fromDate || (parts.fromTime ? parts.toDate || today : "");
  const toDate = parts.toDate || (parts.toTime ? parts.fromDate || today : "");
  return {
    occurred_from: fromDate ? joinLocal(fromDate, parts.fromTime || DAY_START) : undefined,
    occurred_to: toDate ? joinLocal(toDate, parts.toTime || DAY_END) : undefined,
  };
}

/** An end before its start: nothing can match, and the screen says why. */
export function isBackwards(range: LocalRange): boolean {
  return Boolean(range.occurred_from && range.occurred_to && range.occurred_from > range.occurred_to);
}

/**
 * An older link's whole days (`date_from` / `date_to`, e.g. a bookmark from
 * before I15) as the new range, so the boxes show what the list is showing.
 */
export function rangeFromDates(dates: { date_from?: string; date_to?: string }): LocalRange {
  return {
    occurred_from: dates.date_from ? joinLocal(dates.date_from, DAY_START) : undefined,
    occurred_to: dates.date_to ? joinLocal(dates.date_to, DAY_END) : undefined,
  };
}
