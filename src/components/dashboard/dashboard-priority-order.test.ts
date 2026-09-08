import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("dashboard first-screen priorities", () => {
  it("renders contractor priorities before the project overview", () => {
    const code = source("src/components/dashboard/contractor-dashboard.tsx");
    const placement = code.indexOf("{priorityGrid}");
    const overview = code.indexOf("{data.overview &&", placement);
    expect(placement).toBeGreaterThan(-1);
    expect(overview).toBeGreaterThan(placement);
    expect(code).toContain('data-dashboard-priority');
    expect(code).toContain('data-dashboard-overview');
  });

  it("renders admin pending work and notifications before the map", () => {
    const code = source("src/components/dashboard/admin-dashboard.tsx");
    const priority = code.indexOf('data-dashboard-priority');
    const map = code.indexOf('{show("map") &&', priority);
    expect(priority).toBeGreaterThan(-1);
    expect(map).toBeGreaterThan(priority);
    expect(code).toContain('href={adminNotificationHref(notification)}');
    expect(code).toContain('return typeof rawHref === "string" && rawHref.startsWith("/")');
  });
});
