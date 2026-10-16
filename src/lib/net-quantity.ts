/**
 * How the 累计进场与退场 numbers read (I41-5, 2026-10-16): plain enough for an
 * 80-year-old. The server sends three decimals (`"22.000"`); a person wants
 * `22`, `12.7`, `50,350`, and a dash where there is nothing. Used on that view
 * only - other screens keep their own number format.
 */
export const NO_QUANTITY = "—";

const formatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

/** `"22.000"` -> `22`, `"12.700"` -> `12.7`, `"50350"` -> `50,350`, zero -> `—`. */
export function formatNetQuantity(value: string | number | null | undefined): string {
  const number = typeof value === "number" ? value : Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(number)) {
    return NO_QUANTITY;
  }
  // `-0` and anything that rounds to nothing at three decimals are zero.
  if (Math.abs(number) < 0.0005) return NO_QUANTITY;
  return formatter.format(number);
}
