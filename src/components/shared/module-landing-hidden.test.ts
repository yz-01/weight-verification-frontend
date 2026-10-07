import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PORTAL_NAVIGATION, hubDestination, visibleNavigation } from "@/lib/navigation";

/**
 * What the menu hides stays hidden everywhere the menu is drawn (T-388).
 *
 * 「证据归档」 left the menu in T-345 (D-204) through `menuHidden`, and stayed on
 * the 文档档案 landing page as a card, because both landing pages read the
 * navigation children themselves and never looked at the flag. Lucas found it:
 * 「证据归档为什么还在？不是应该移除了吗？」
 *
 * The landing pages are gone now (A03), and the filtering lives in one place,
 * `visibleNavigation`, which the sidebar, its cascade and the module search
 * all read.
 */

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

describe("menus skip what the menu hides", () => {
  it("still has a hidden child to protect", () => {
    const hidden = PORTAL_NAVIGATION.MSE_TRACE.flatMap((item) => item.children ?? []).filter(
      (child) => child.menuHidden,
    );
    expect(hidden.map((child) => child.href)).toContain("/evidence");
  });

  it("drops it from the visible navigation", () => {
    const documents = visibleNavigation("MSE_TRACE", ["documents", "approvals", "evidence"], [
      "audit.view",
    ])
      .flatMap((group) => group.items)
      .find((item) => item.feature === "documents");
    expect(documents?.children?.map((child) => child.href)).not.toContain("/evidence");
  });

  it("never forwards an old hub address to it", () => {
    expect(hubDestination("MSE_TRACE", "documents", ["evidence"], ["audit.view"])).toBeNull();
  });

  it("leaves the sidebar no way to read the unfiltered registry", () => {
    const sidebar = read("src/components/layout/app-sidebar.tsx");
    expect(sidebar).not.toMatch(/PORTAL_NAVIGATION/);
    expect(sidebar).toMatch(/visibleNavigation\(/);
  });
});
