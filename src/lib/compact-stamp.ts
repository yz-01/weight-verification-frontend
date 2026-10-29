/**
 * 「28/10 14:35」: a short date and time for a narrow line (JB71 fix round,
 * 10-29). The 现场任务 row's 最后确认时间 in the long form
 * (「2026年10月28日 14:35」) was cut to 「2026年10月28日 2…」 at 1440 px and the
 * client could not read the time. Day/month and the clock; the year only
 * when it is not this year. `time` is the reader's own clock text
 * (`useDateFormat().time`), so a 12-hour company keeps its AM / PM.
 */
export function compactStamp(
  value: string | null | undefined,
  timeZone: string,
  time: string,
  now: Date = new Date(),
): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const parts = (date: Date) =>
    Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone })
        .formatToParts(date)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
  const day = parts(parsed);
  const thisYear = parts(now).year;
  const date = day.year === thisYear ? `${day.day}/${day.month}` : `${day.day}/${day.month}/${day.year}`;
  return `${date} ${time}`.trim();
}
