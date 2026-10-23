/**
 * Lucas 2026-10-24: signed in with the link and PIN, swiped Safari away,
 * reopened it, and the PIN was asked again. Private browsing forgets the
 * sign-in on close; the PIN screen says so when it can tell.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { isPrivateBrowsing } from "@/lib/private-browsing";

describe("private browsing is recognised on iPhone browsers", () => {
  it("a private WebKit tab refuses the private file system", async () => {
    const storage = {
      getDirectory: () =>
        Promise.reject(
          new Error("UnknownError: The operation failed for an unknown transient reason (e.g. out of memory)."),
        ),
    };
    await expect(isPrivateBrowsing(storage)).resolves.toBe(true);
  });

  it("a normal tab gets the directory", async () => {
    await expect(isPrivateBrowsing({ getDirectory: () => Promise.resolve({}) })).resolves.toBe(false);
  });

  it("another refusal, or no API at all, is not taken for private browsing", async () => {
    await expect(
      isPrivateBrowsing({ getDirectory: () => Promise.reject(new Error("SecurityError")) }),
    ).resolves.toBe(false);
    await expect(isPrivateBrowsing({})).resolves.toBe(false);
    await expect(isPrivateBrowsing(undefined)).resolves.toBe(false);
  });

  it("the PIN screen says it before the PIN is typed", () => {
    const source = readFileSync(
      new URL("../components/field-staff/field-access.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/void isPrivateBrowsing\(\)\.then/);
    expect(source).toMatch(/\{privateBrowsing && \(/);
    const zh = JSON.parse(readFileSync(new URL("../messages/zh.json", import.meta.url), "utf8"));
    expect(zh.fieldAccess.privateBrowsing).toContain("无痕");
  });
});
