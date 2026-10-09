import { describe, expect, it } from "vitest";

import {
  driverLinkOutcome,
  driverLinkToken,
  matchDriverByName,
  parseIdleDays,
  plateKey,
  whatsappShareUrl,
} from "@/lib/driver-link";

describe("trip link token", () => {
  it("accepts what the server mints and nothing shaped otherwise", () => {
    expect(driverLinkToken("a".repeat(43))).toBe("a".repeat(43));
    expect(driverLinkToken("Ab-_09".repeat(5))).toBe("Ab-_09".repeat(5));
    expect(driverLinkToken("short")).toBe("");
    expect(driverLinkToken("has space in it and is long enough")).toBe("");
    expect(driverLinkToken(null)).toBe("");
  });
});

describe("refused link", () => {
  it("names the screen for each code the server sends", () => {
    expect(driverLinkOutcome("driver_link_closed")).toBe("closed");
    expect(driverLinkOutcome("driver_link_expired")).toBe("expired");
    expect(driverLinkOutcome("driver_link_other_device")).toBe("otherDevice");
    expect(driverLinkOutcome("driver_link_invalid")).toBe("invalid");
    expect(driverLinkOutcome("network_unreachable")).toBe("failed");
    expect(driverLinkOutcome("")).toBe("failed");
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

describe("repeat crews", () => {
  it("compares plates the way the weighbridge does", () => {
    expect(plateKey(" wlk-1001 ")).toBe("WLK1001");
    expect(plateKey("WLK 1001")).toBe(plateKey("wlk1001"));
  });

  it("finds a driver typed again, whatever the spacing or case", () => {
    const drivers = [{ full_name: "Ah Kow" }, { full_name: "Muthu  Kumar" }];
    expect(matchDriverByName(drivers, "ah kow")).toBe(drivers[0]);
    expect(matchDriverByName(drivers, " muthu kumar ")).toBe(drivers[1]);
    expect(matchDriverByName(drivers, "Ah")).toBeUndefined();
    expect(matchDriverByName(drivers, "")).toBeUndefined();
  });
});
