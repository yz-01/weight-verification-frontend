/**
 * JB206-6 (Lucas 11-16 audit): 付款凭证's 【导出】 shows only for whom 导出 is
 * on - the server asks for `report.export`, as the other lists' 导出 do.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("付款凭证 导出 (JB206-6)", () => {
  it("is behind report.export", () => {
    const page = readFileSync(path.join(process.cwd(), "src/components/settlements/payment-proofs.tsx"), "utf8");
    expect(page).toMatch(/can\("report\.export"\) && \(\s*<ExportButton/);
    expect(page.match(/<ExportButton/g)).toHaveLength(1);
  });
});
