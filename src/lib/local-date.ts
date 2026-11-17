/**
 * Today as `YYYY-MM-DD` on the reader's own calendar, for a date field's
 * default.
 *
 * The first ten characters of `toISOString()` are the UTC date: in Malaysia
 * (UTC+8) it is still yesterday until 08:00, so 记录付款's 付款日期 opened on
 * 16/11 at 06:12 on the 17th and the payment was saved a day early (JB207W,
 * walk 11-17). Every form that defaulted a date to "today" that way uses this
 * instead.
 */
export function localToday(now: Date = new Date()): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
