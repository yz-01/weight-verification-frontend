/**
 * Driver sign-in links: the pieces that are pure enough to test.
 *
 * The client asked that a recycler's driver need no email: the office sends a
 * link, like field staff get, but with no PIN, and the link ends either after
 * the load is weighed or after N idle days (「比较 flexible」).
 */

export type DriverLinkCloseRule = "CLOSE_AFTER_WEIGHING" | "EXPIRE_AFTER_IDLE_DAYS";

export const DRIVER_LINK_CLOSE_RULES: DriverLinkCloseRule[] = [
  "CLOSE_AFTER_WEIGHING",
  "EXPIRE_AFTER_IDLE_DAYS",
];

export type DriverLinkStatus = "NOT_OPENED" | "ACTIVE" | "EXPIRED" | "CLOSED";

/** Where the phone ends up after trying a link. */
export type DriverLinkOutcome = "closed" | "otherDevice" | "invalid" | "failed";

/** The token from the address bar, or "" when it cannot be one. */
export function driverLinkToken(value: string | null | undefined): string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(value)
    ? value
    : "";
}

/** Which screen a refused sign-in shows, from the backend's error code. */
export function driverLinkOutcome(code: string | null | undefined): DriverLinkOutcome {
  if (code === "driver_link_closed") return "closed";
  if (code === "driver_link_other_device") return "otherDevice";
  if (code === "driver_link_invalid" || code === "validation_failed") return "invalid";
  return "failed";
}

/**
 * Whether a token was issued from a sign-in link.
 *
 * Read off the token itself because the account looks like any other driver's;
 * only the session knows it came from a link.
 */
export function isDriverLinkToken(token: string | null | undefined): boolean {
  if (!token) return false;
  try {
    const payload = token.split(".")[1];
    if (!payload) return false;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(
      atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    ) as { session_kind?: string; driver_link?: string };
    return decoded.session_kind === "DRIVER_LINK" && Boolean(decoded.driver_link);
  } catch {
    return false;
  }
}

/**
 * A wa.me address that opens a chat with the driver, message filled in.
 *
 * Malaysian mobiles are written 012-345 6789 on the form; wa.me wants the
 * country code and digits only. A number that does not look Malaysian still
 * gets the message, with the office choosing the chat themselves.
 */
export function whatsappShareUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  let international = "";
  if (/^601\d{7,9}$/.test(digits)) international = digits;
  else if (/^01\d{7,9}$/.test(digits)) international = `6${digits}`;
  else if (/^1\d{7,9}$/.test(digits)) international = `60${digits}`;
  const text = encodeURIComponent(message);
  return international
    ? `https://wa.me/${international}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

/** Days for the idle rule: a whole number from 1 to 365, or null. */
export function parseIdleDays(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const days = Number(value);
  return days >= 1 && days <= 365 ? days : null;
}
