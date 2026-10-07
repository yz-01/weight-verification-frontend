/**
 * The 材料进场 badge counts accepted deliveries waiting for a 【确认归档】
 * (2026-10 C4, X10), so everything that names it says 待确认 - not 未读,
 * which is what it counted before.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { badgeLabelKey } from "@/hooks/use-unread-badges";

const messages = (locale: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "src", "messages", `${locale}.json`), "utf8"));

describe("the sidebar's deliveries badge says what it counts", () => {
  it("names the deliveries badge 待确认 and the approvals badge as work waiting", () => {
    expect(badgeLabelKey("material_receipts")).toBe("nav.waitingConfirm");
    expect(badgeLabelKey("approvals")).toBe("nav.waitingForYou");
  });

  it.each([
    ["zh", /待确认/],
    ["zh-TW", /待確認/],
    ["en", /confirmation/i],
    ["ms", /pengesahan/i],
  ])("%s says confirm, not unread", (locale, pattern) => {
    const text = messages(locale).nav.waitingConfirm as string;
    expect(text).toMatch(pattern);
    expect(text).toContain("{count}");
    expect(text).not.toMatch(/未读|未讀|unread|belum dibaca/i);
  });

  it("puts that label on the badge as its name and its tooltip", () => {
    const sidebar = readFileSync(path.join(process.cwd(), "src", "components", "layout", "app-sidebar.tsx"), "utf8");
    expect(sidebar).toMatch(/aria-label=\{t\(badgeLabelKey\(item\.feature\), \{/);
    expect(sidebar).toMatch(/title=\{t\(badgeLabelKey\(item\.feature\), \{/);
    expect(sidebar).not.toMatch(/t\("nav\.waitingForYou"/);
  });

  it.each(["zh", "zh-TW", "en", "ms"])("%s: the dashboard's stale-data note no longer says unread", (locale) => {
    expect(messages(locale).contractorDashboard.liveStopped).not.toMatch(/未读|未讀|unread|belum dibaca/i);
  });
});
