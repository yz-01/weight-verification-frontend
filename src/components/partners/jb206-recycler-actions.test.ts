/**
 * JB206-8 (Lucas 11-16 audit): a recycler partnership row's 接受 / 拒绝 /
 * 管理项目 / 暂停 say what they do in words, not only on mouse-over.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("recycler row buttons in words (JB206-8)", () => {
  it("carry their label beside the icon", () => {
    const page = readFileSync(path.join(process.cwd(), "src/components/partners/recyclers.tsx"), "utf8");
    const start = page.indexOf('data-slot="recycler-row-actions"');
    const cell = page.slice(start, page.indexOf("</div>", start));
    for (const action of ["accept", "reject", "manageProjects", "suspend"]) {
      expect(cell).toContain(`{t("recyclers.action.${action}")}`);
    }
    expect(cell).not.toContain('size="icon"');
  });
});
