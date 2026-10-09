/**
 * The driver's link for one trip: the pieces pure enough to test.
 *
 * Drivers have no login. The office types who is driving in 接单与派车 and
 * sends the trip's link; the driver works that one order from it, no PIN.
 * The link closes with the trip (weighed, cancelled), or after N idle days
 * when the office chose that rule (「比较 flexible」).
 */

export type DriverLinkCloseRule = "CLOSE_AFTER_WEIGHING" | "EXPIRE_AFTER_IDLE_DAYS";

export const DRIVER_LINK_CLOSE_RULES: DriverLinkCloseRule[] = [
  "CLOSE_AFTER_WEIGHING",
  "EXPIRE_AFTER_IDLE_DAYS",
];

export type DriverLinkStatus = "NONE" | "NOT_OPENED" | "ACTIVE" | "EXPIRED" | "CLOSED";

/** Which screen a refused link shows, from the backend's error code. */
export type DriverLinkOutcome = "closed" | "expired" | "otherDevice" | "invalid" | "failed";

export function driverLinkOutcome(code: string | null | undefined): DriverLinkOutcome {
  if (code === "driver_link_closed") return "closed";
  if (code === "driver_link_expired") return "expired";
  if (code === "driver_link_other_device") return "otherDevice";
  if (code === "driver_link_invalid") return "invalid";
  return "failed";
}

/** The token as it can appear in the address, or "" when it cannot be one. */
export function driverLinkToken(value: string | null | undefined): string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(value)
    ? value
    : "";
}

/**
 * A wa.me address that opens a chat with the driver, message filled in.
 *
 * Malaysian mobiles are typed 012-345 6789; wa.me wants the country code and
 * digits only. A number that does not look Malaysian still gets the message,
 * with the office choosing the chat themselves.
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

/** A plate as the weighbridge compares it: upper case, no spaces or dashes. */
export function plateKey(value: string): string {
  return value.toUpperCase().replace(/[\s-]+/g, "");
}

/** A known driver whose name was typed exactly (ignoring case and spaces). */
export function matchDriverByName<T extends { full_name: string }>(
  drivers: T[],
  name: string,
): T | undefined {
  const wanted = name.trim().replace(/\s+/g, " ").toLowerCase();
  if (!wanted) return undefined;
  return drivers.find(
    (driver) => driver.full_name.trim().replace(/\s+/g, " ").toLowerCase() === wanted,
  );
}
