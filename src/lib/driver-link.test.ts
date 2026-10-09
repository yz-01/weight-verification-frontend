import { describe, expect, it } from "vitest";

import {
  driverLinkOutcome,
  driverLinkToken,
  isDriverLinkToken,
  parseIdleDays,
  whatsappShareUrl,
} from "@/lib/driver-link";

function token(payload: Record<string, unknown>): string {
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${body}.signature`;
}

describe("driver sign-in link token", () => {
  it("accepts what the server mints and nothing shaped otherwise", () => {
    expect(driverLinkToken("a".repeat(54))).toBe("a".repeat(54));
    expect(driverLinkToken("Ab-_09".repeat(5))).toBe("Ab-_09".repeat(5));
    expect(driverLinkToken("short")).toBe("");
    expect(driverLinkToken("has space in it and is long enough")).toBe("");
    expect(driverLinkToken(null)).toBe("");
    expect(driverLinkToken(undefined)).toBe("");
  });
});

describe("refused sign-in", () => {
  it("names the screen for each code the server sends", () => {
    expect(driverLinkOutcome("driver_link_closed")).toBe("closed");
    expect(driverLinkOutcome("driver_link_other_device")).toBe("otherDevice");
    expect(driverLinkOutcome("driver_link_invalid")).toBe("invalid");
    expect(driverLinkOutcome("validation_failed")).toBe("invalid");
    expect(driverLinkOutcome("network_unreachable")).toBe("failed");
    expect(driverLinkOutcome("")).toBe("failed");
  });
});

describe("link session", () => {
  it("is told apart from a password session by its own token", () => {
    expect(isDriverLinkToken(token({ session_kind: "DRIVER_LINK", driver_link: "x" }))).toBe(true);
    expect(isDriverLinkToken(token({ session_kind: "FIELD_DEVICE", device: "x" }))).toBe(false);
    expect(isDriverLinkToken(token({ user_id: "x" }))).toBe(false);
    expect(isDriverLinkToken("not-a-jwt")).toBe(false);
    expect(isDriverLinkToken(null)).toBe(false);
  });
});

describe("WhatsApp share", () => {
  it("addresses a Malaysian mobile however it was typed", () => {
    expect(whatsappShareUrl("012-345 6789", "hi")).toBe("https://wa.me/60123456789?text=hi");
    expect(whatsappShareUrl("+60 11-2345 6789", "hi")).toBe("https://wa.me/601123456789?text=hi");
    expect(whatsappShareUrl("123456789", "hi")).toBe("https://wa.me/60123456789?text=hi");
  });

  it("still carries the message when the number is not a mobile", () => {
    expect(whatsappShareUrl("03-1234 5678", "a b")).toBe("https://wa.me/?text=a%20b");
    expect(whatsappShareUrl("", "x")).toBe("https://wa.me/?text=x");
  });
});

describe("idle days", () => {
  it("is a whole number from 1 to 365", () => {
    expect(parseIdleDays("7")).toBe(7);
    expect(parseIdleDays(" 365 ")).toBe(365);
    expect(parseIdleDays("0")).toBeNull();
    expect(parseIdleDays("366")).toBeNull();
    expect(parseIdleDays("2.5")).toBeNull();
    expect(parseIdleDays("")).toBeNull();
  });
});
