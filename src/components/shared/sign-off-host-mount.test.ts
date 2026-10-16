/**
 * Lucas 10/17, on the live site: 「填写日报告」 or 「修改」 with no PIN set showed
 * 「This page couldn't load」, and a 更正 after it spun for ever.
 *
 * The PIN dialog is mounted at the root beside the page, outside the page's
 * TooltipProvider. Its buttons are disabled until six digits are typed, and a
 * disabled button explains itself in a Radix tooltip - which throws without a
 * provider, taking the whole page down the first time any PIN was asked for.
 * The ask it was answering never settled, so every later PIN waited behind it.
 *
 * The runner has no DOM (effects and portals do not run), so the two halves
 * of the fix are pinned in the source.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

describe("the sign-off PIN dialog can be shown (Lucas 10/17)", () => {
  const dialog = read("src/components/shared/sign-off-dialog.tsx");
  const providers = read("src/components/providers/app-providers.tsx");

  it("is mounted outside the page's tooltip provider, so it brings its own", () => {
    const pageTooltips = providers.indexOf("<TooltipProvider");
    const pageTooltipsEnd = providers.indexOf("</TooltipProvider>");
    const host = providers.indexOf("<SignOffHost");
    expect(host).toBeGreaterThan(-1);
    const insidePageProvider = host > pageTooltips && host < pageTooltipsEnd;
    const ownProvider = /return \(\s*<TooltipProvider[^>]*>\s*<Dialog/.test(dialog);
    expect(insidePageProvider || ownProvider).toBe(true);
    expect(ownProvider).toBe(true);
  });

  it("answers a PIN still asked for when it is taken off the page", () => {
    expect(dialog).toMatch(/return \(\) => \{\s*unregister\(\);[\s\S]*?answer\(null\);\s*\};\s*\}, \[answer\]\);/);
  });
});
