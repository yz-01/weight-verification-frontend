/**
 * The 材料进场 badge counts accepted deliveries waiting for a 【确认归档】
 * (2026-10 C4, X10), so everything that names it says 待确认 - not 未读,
 * which is what it counted before.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { BADGE_PERMISSIONS, badgeFor, badgeLabelKey } from "@/hooks/use-unread-badges";

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

describe("one number per entry, from the counts of its pages (2026-10-08)", () => {
  it("adds the pages up", () => {
    expect(
      badgeFor({ material_receipts: 2, material_outgoing: 4 }, ["material_receipts", "material_outgoing"]),
    ).toBe(6);
    expect(badgeFor({ equipment: 5 }, ["equipment"])).toBe(5);
  });

  it("is zero, not unknown, when the counts loaded and nothing is waiting", () => {
    expect(badgeFor({ equipment: 0 }, ["equipment"])).toBe(0);
    expect(badgeFor({}, ["progress", "schedule"])).toBe(0);
  });

  it("is unknown when the counts never loaded, unless a page still has a number", () => {
    expect(
      badgeFor({ material_receipts: null, material_outgoing: null }, ["material_receipts", "material_outgoing"]),
    ).toBeNull();
    expect(
      badgeFor({ material_receipts: null, material_outgoing: 4 }, ["material_receipts", "material_outgoing"]),
    ).toBe(4);
  });

  it("reads one endpoint for every module, asks again on focus, keeps no timer of its own", () => {
    const source = readFileSync(path.join(process.cwd(), "src", "hooks", "use-unread-badges.ts"), "utf8");
    expect(source).toContain("getSidebarBadges(");
    // The shell's live stream and the app-wide safety poll refresh it; a
    // second interval on every page of every office user is what not to add.
    expect(source).not.toMatch(/refetchInterval/);
    expect(source).toMatch(/staleTime: BADGE_STALE_MS/);
    expect(source).toMatch(/refetchOnWindowFocus: true/);
    // The top bar's current project (B13), as every list sends it.
    expect(source).toMatch(/current\.active \? current\.projectId : ""/);
    expect(source).toMatch(/queryKey: \["sidebar-badges", project\]/);
    expect(source).not.toContain("getContractorDashboard(");
    const service = readFileSync(
      path.join(process.cwd(), "src", "services", "contractor-dashboard.service.ts"),
      "utf8",
    );
    expect(service).toContain("/api/contractor-dashboard/get_badges/");
  });

  it("asks only when the reader holds a permission the endpoint opens for", () => {
    // Mirrors `contractor_ops.sidebar_badges.BADGE_PERMISSIONS` (the backend
    // test reads this list): the view permission of each counted list, and
    // nothing else - a button without its list gives no number.
    expect(BADGE_PERMISSIONS).toContain("receipt.view");
    expect(BADGE_PERMISSIONS).toContain("equipment.view");
    expect(BADGE_PERMISSIONS.every((code) => code.endsWith(".view"))).toBe(true);
    expect(BADGE_PERMISSIONS).not.toContain("dashboard.view");
    const source = readFileSync(path.join(process.cwd(), "src", "hooks", "use-unread-badges.ts"), "utf8");
    // A consultant shares the portal but not the contractor's office counts.
    expect(source).toMatch(/user\.account_type === "TENANT"/);
  });
});
