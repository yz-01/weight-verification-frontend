import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * JB31 guard (客户 10-26 事项 7, 图 5): 「开一期 Claim」 on a 1366x768 laptop
 * cut off its 「开这一期」 button - the panel was centred, capped at the screen
 * and clipped, and that body had no scroll of its own. The panel now sits
 * near the top and scrolls itself, title and footer held in place, so every
 * Multi Engine dialog is safe whatever its body does.
 */
const shell = readFileSync(
  path.join(process.cwd(), "src/components/contractor-ops/package-shell.tsx"),
  "utf8",
);

describe("the Multi Engine panel never hides its buttons", () => {
  it("sits near the top on a desktop instead of in the middle", () => {
    expect(shell).toMatch(/sm:items-start sm:p-4 sm:pt-\[4dvh\]/);
    expect(shell).not.toMatch(/sm:items-center/);
  });

  it("scrolls itself, keeping the title and the footer in sight", () => {
    expect(shell).toMatch(/flex-col overflow-y-auto overscroll-contain/);
    expect(shell).not.toMatch(/flex-col overflow-hidden/);
    expect(shell).toMatch(/\[&>footer\]:sticky \[&>footer\]:bottom-0/);
    expect(shell).toMatch(/<header className="sticky top-0 z-10 [^"]*bg-popover/);
  });
});
