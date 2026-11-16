import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isRouteAllowed } from "@/lib/navigation";

/**
 * JB207-10 (Lucas 11-16 audit): a yard with no 回收场 got an empty box and
 * 「必填」 when assigning a driver. It now says so, and where to add one.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

const source = read("src/components/tasks/assign-trip.tsx");

describe("派车 with no 回收场", () => {
  it("says so once the list has loaded empty", () => {
    expect(source).toContain("const noSites = sites.isSuccess && siteRows.length === 0;");
    expect(source).toMatch(/\{noSites \? \(/);
    expect(source).toContain('canAddSite ? t("tasks.crew.noSites") : t("tasks.crew.noSitesAskAdmin")');
  });

  it("offers 新增回收场 only to who may add one", () => {
    expect(source).toContain('const canAddSite = can("yard.manage");');
    expect(source).toMatch(
      /\{canAddSite && \(\n\s+<Button asChild size="sm" variant="outline">\n\s+<Link href="\/sites\/create">/,
    );
    expect(isRouteAllowed("MSE_SCRAP", ["yards"], "/sites/create", ["yard.manage"])).toBe(true);
    expect(isRouteAllowed("MSE_SCRAP", ["yards"], "/sites/create", ["yard.view"])).toBe(false);
  });

  it("greys 派车 out with the same sentence", () => {
    expect(source).toContain("disabled={assign.isPending || noSites}");
    expect(source).toContain("disabledReason={noSites ? noSitesText : undefined}");
  });

  it("names the menu and button the reader sees", () => {
    const zh = JSON.parse(read("src/messages/zh.json"));
    expect(zh.tasks.crew.noSites).toContain(`【${zh.nav.yards}】`);
    expect(zh.tasks.crew.noSites).toContain(`【${zh.sites.new}】`);
  });
});
