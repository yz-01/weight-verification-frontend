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
  ])("%s filters on menuHidden", (file) => {
    expect(read(file)).toMatch(/!child\.menuHidden/);
  });
});
