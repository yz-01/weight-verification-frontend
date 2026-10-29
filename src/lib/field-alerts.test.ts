/**
 * What the field phone says about sound and the icon's number (JB36, 客户
 * 10-26 事项 11, 图 15: the Android icon with the browser's small logo is a
 * shortcut, not an installed app).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { fieldAlertsAdvice, isSamsungBrowser, type FieldAlertsInput } from "@/lib/field-alerts";

const ready: FieldAlertsInput = {
  environment: "android",
  standalone: true,
  samsungBrowser: false,
  pushSupported: true,
  pushConfigured: true,
  permission: "granted",
  subscribed: true,
};

describe("field alerts advice (JB36)", () => {
  it("says nothing on a phone that is set up", () => {
    expect(fieldAlertsAdvice(ready)).toEqual([]);
    expect(fieldAlertsAdvice({ ...ready, environment: "ios-safari" })).toEqual([]);
  });

  it("asks to turn notifications on, or says they were refused", () => {
    expect(fieldAlertsAdvice({ ...ready, permission: "default", subscribed: false })).toEqual(["turn-on"]);
    expect(fieldAlertsAdvice({ ...ready, subscribed: false })).toEqual(["turn-on"]);
    expect(fieldAlertsAdvice({ ...ready, permission: "denied", subscribed: false })).toEqual(["denied"]);
  });

  it("an Android browser tab or a Samsung Internet shortcut is told to install from Chrome", () => {
    expect(fieldAlertsAdvice({ ...ready, standalone: false })).toEqual(["android-install"]);
    expect(fieldAlertsAdvice({ ...ready, samsungBrowser: true, permission: "default", subscribed: false })).toEqual([
      "android-install",
      "turn-on",
    ]);
  });

  it("an iPhone in a Safari tab is left to the install banner; an old iOS app is told to update", () => {
    expect(
      fieldAlertsAdvice({ ...ready, environment: "ios-safari", standalone: false, pushSupported: false }),
    ).toEqual([]);
    expect(
      fieldAlertsAdvice({ ...ready, environment: "ios-safari", pushSupported: false, permission: "unsupported" }),
    ).toEqual(["ios-update"]);
  });

  it("promises nothing when the server has no push keys", () => {
    expect(fieldAlertsAdvice({ ...ready, pushConfigured: false, permission: "default" })).toEqual([]);
  });

  it("knows Samsung Internet", () => {
    expect(
      isSamsungBrowser(
        "Mozilla/5.0 (Linux; Android 13; SM-A225F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe(true);
    expect(isSamsungBrowser("Mozilla/5.0 (Linux; Android 13) Chrome/121.0.0.0 Mobile Safari/537.36")).toBe(false);
  });

  it("the field shell shows it, and every advice has words in all four languages", () => {
    const shell = readFileSync(path.join(process.cwd(), "src/components/field-staff/field-staff-shell.tsx"), "utf8");
    expect(shell).toContain("<FieldAlertsHint />");
    for (const lang of ["en", "zh", "zh-TW", "ms"]) {
      const messages = JSON.parse(readFileSync(path.join(process.cwd(), `src/messages/${lang}.json`), "utf8"));
      for (const advice of ["android-install", "ios-update", "turn-on", "denied"]) {
        expect(messages.fieldAlerts[advice].body, `${lang} ${advice}`).toBeTruthy();
      }
      expect(messages.fieldAlerts["turn-on"].action).toBeTruthy();
      expect(messages.fieldAlerts.dismiss).toBeTruthy();
      expect(messages.hazard.recordFailed).toBeTruthy();
    }
  });

  it("a push for a chat thread replaces the last one and rings again", () => {
    const sw = readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8");
    expect(sw).toMatch(/payload\.tag \? \{ tag: String\(payload\.tag\), renotify: true \}/);
  });

  it("sets the icon's number before the worker may stop (JB79)", () => {
    // Left floating, iPhone stopped the worker first and the icon lagged.
    const sw = readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8");
    expect(sw).toContain("badgeSet = self.navigator.setAppBadge(payload.badge)");
    expect(sw).toMatch(/event\.waitUntil\(Promise\.all\(\[\s*Promise\.resolve\(badgeSet\)/);
  });
});
