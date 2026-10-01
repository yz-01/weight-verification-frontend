import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PORTAL_NAVIGATION } from "@/lib/navigation";

/**
 * A module's landing page lists what its menu lists (T-388).
 *
 * 「证据归档」 left the menu in T-345 (D-204) through `menuHidden`, and stayed on
 * the 文档档案 landing page as a card, because both landing pages read the
 * navigation children themselves and never looked at the flag. Lucas found it:
 * 「证据归档为什么还在？不是应该移除了吗？」
 */

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("landing pages skip what the menu hides", () => {
  it("still has a hidden child to protect", () => {
    const hidden = PORTAL_NAVIGATION.MSE_TRACE.flatMap((item) => item.children ?? []).filter(
      (child) => child.menuHidden,
    );
    expect(hidden.map((child) => child.href)).toContain("/evidence");
  });

  it.each([
    "src/components/contractor-ops/contractor-module-landing.tsx",
    "src/components/admin/admin-module-landing.tsx",
    // The sidebar was the half nobody checked: the cards stopped offering
    // 「证据归档」 and the menu beside them went on listing it, which is the
    // same report coming back a second time.
    "src/components/layout/app-sidebar.tsx",
  ])("%s filters on menuHidden", (file) => {
    expect(read(file)).toMatch(/!child\.menuHidden/);
  });

  it("leaves no unfiltered children list in the sidebar", () => {
    // Filtering once and then rendering `item.children` anyway would pass the
    // check above and still show the entry.
    const sidebar = read("src/components/layout/app-sidebar.tsx");
    const uses = sidebar.match(/item\.children/g) ?? [];
    expect(uses, "only the line that builds the filtered list may read it").toHaveLength(1);
  });
});
