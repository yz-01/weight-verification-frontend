/**
 * JB205 (Lucas 11-16 audit) - the MSE Admin menu.
 *
 * - JB205-5: 平台监控 › 后台任务 reads and runs the job table, which is
 *   `platform.maintenance`. A Support Agent (platform.monitor only) was
 *   offered it and the page opened on a refusal.
 * - JB205-6: 系统设置 › 系统集成 asked for the `integrations` feature, which the
 *   MSE Admin portal never has, so it never appeared. It follows
 *   `integration.view` now - and the builder's menu, which dropped 系统集成
 *   on purpose (JB99), and the recycler's own entry stay as they were.
 */
import { describe, expect, it } from "vitest";

import { isRouteAllowed, navLeaves, PORTAL_NAVIGATION, visibleNavigation } from "./navigation";

const ADMIN_FEATURES = ["platform_monitoring", "platform_settings"];

function adminHrefs(permissions: string[]): string[] {
  return visibleNavigation("MSE_ADMIN", ADMIN_FEATURES, permissions).flatMap((group) =>
    group.items.flatMap((item) => [item.href, ...navLeaves(item.children).map((child) => child.href)]),
  );
}

describe("JB205-5: 后台任务 is in the menu for platform.maintenance only", () => {
  it("is not offered to whoever only monitors", () => {
    const hrefs = adminHrefs(["platform.monitor", "platform_settings.view"]);
    expect(hrefs).toContain("/monitoring/exceptions");
    expect(hrefs).not.toContain("/monitoring/jobs");
  });

  it("is offered to whoever may run jobs", () => {
    const hrefs = adminHrefs(["platform.monitor", "platform.maintenance", "platform_settings.view"]);
    expect(hrefs).toContain("/monitoring/jobs");
  });
});

describe("JB205-6: 系统集成 appears under 系统设置", () => {
  it("for whoever may read integrations", () => {
    const hrefs = adminHrefs(["platform_settings.view", "integration.view"]);
    expect(hrefs).toContain("/integrations");
    expect(isRouteAllowed("MSE_ADMIN", ADMIN_FEATURES, "/integrations", ["platform_settings.view", "integration.view"])).toBe(true);
  });

  it("not for whoever may not", () => {
    expect(adminHrefs(["platform_settings.view"])).not.toContain("/integrations");
  });

  it("stays out of the builder's menu and keeps the recycler's own entry", () => {
    const everything = ["integration.view", "integration.manage", "company_settings.manage"];
    const builder = visibleNavigation("MSE_TRACE", ["company_settings", "integrations"], everything).flatMap((group) =>
      group.items.flatMap((item) => [item.href, ...navLeaves(item.children).map((child) => child.href)]),
    );
    expect(builder).not.toContain("/integrations");
    expect(isRouteAllowed("MSE_TRACE", ["company_settings", "integrations"], "/integrations", everything)).toBe(false);
    expect(isRouteAllowed("MSE_SCRAP", ["integrations"], "/integrations", ["integration.view"])).toBe(true);
    const recycler = PORTAL_NAVIGATION.MSE_SCRAP.find((entry) => entry.href === "/integrations");
    expect(recycler?.feature).toBe("integrations");
  });
});
