import { describe, expect, it } from "vitest";

import {
  cleanDocuments,
  clockTime,
  incompleteDocument,
  reportIntervalMs,
  workerLinkOutcome,
  workerLinkToken,
  workerStatusTone,
  workerWhatsappUrl,
} from "@/lib/site-workers";

describe("人员名单 status", () => {
  it("shows 定位未更新 as a warning, never as 离场", () => {
    expect(workerStatusTone("ON_SITE")).toBe("positive");
    expect(workerStatusTone("STALE")).toBe("warning");
    expect(workerStatusTone("SIGNAL_LOST")).toBe("warning");
    expect(workerStatusTone("OFF_SITE")).toBe("neutral");
    expect(workerStatusTone("NOT_STARTED")).toBe("neutral");
  });
});

describe("location link", () => {
  it("names each refusal from its code", () => {
    expect(workerLinkOutcome("worker_link_invalid")).toBe("invalid");
    expect(workerLinkOutcome("worker_link_closed")).toBe("closed");
    expect(workerLinkOutcome("worker_link_other_device")).toBe("otherDevice");
    expect(workerLinkOutcome("worker_link_phone_mismatch")).toBe("phoneMismatch");
    expect(workerLinkOutcome("network")).toBe("failed");
  });

  it("accepts only a token the server could have minted", () => {
    expect(workerLinkToken("Ab-_09".repeat(7))).toBe("Ab-_09".repeat(7));
    expect(workerLinkToken("short")).toBe("");
    expect(workerLinkToken(undefined)).toBe("");
  });

  it("opens WhatsApp on the worker's own number", () => {
    expect(workerWhatsappUrl("+60123456789", "hi there")).toBe("https://wa.me/60123456789?text=hi%20there");
    expect(workerWhatsappUrl("+8801712345678", "x")).toBe("https://wa.me/8801712345678?text=x");
  });
});

describe("other documents", () => {
  it("drops empty rows and trims", () => {
    expect(
      cleanDocuments([
        { name: " Passport ", number: " A1 " },
        { name: "", number: "" },
      ]),
    ).toEqual([{ name: "Passport", number: "A1" }]);
  });

  it("finds a row with only one half filled", () => {
    expect(incompleteDocument([{ name: "Passport", number: "" }])).toBe(true);
    expect(incompleteDocument([{ name: "", number: "" }])).toBe(false);
  });
});

describe("the worker's page", () => {
  it("shows 24-hour time", () => {
    expect(clockTime(new Date(2026, 9, 16, 7, 5))).toBe("07:05");
    expect(clockTime(null)).toBe("");
    expect(clockTime("nonsense")).toBe("");
  });

  it("reports at the company's interval within the server's limits", () => {
    expect(reportIntervalMs(60)).toBe(60_000);
    expect(reportIntervalMs(5)).toBe(30_000);
    // J24-2: a location link reports every two hours, the most allowed.
    expect(reportIntervalMs(7200)).toBe(7_200_000);
    expect(reportIntervalMs(9000)).toBe(7_200_000);
    expect(reportIntervalMs(undefined)).toBe(60_000);
  });
});
