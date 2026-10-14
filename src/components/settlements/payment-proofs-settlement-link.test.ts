import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isRouteAllowed } from "@/lib/navigation";

/**
 * 「查看结算」 goes to /settlements, which only the recycler's portal opens
 * (H16 second fix round). A contractor sees 付款凭证 but must not be handed a
 * link the route guard turns away; the dialog's own PDF buttons stay.
 */
const source = readFileSync(
  path.join(process.cwd(), "src/components/settlements/payment-proofs.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("the settlement link on 付款凭证", () => {
  it("is drawn only where the portal opens /settlements", () => {
    const links = [...source.matchAll(/<Link href=\{`\/settlements\//g)];
    expect(links).toHaveLength(2);
    for (const match of links) {
      const before = source.slice(Math.max(0, (match.index ?? 0) - 400), match.index);
      expect(before).toMatch(/canOpenSettlement && \(/);
    }
    expect(source).toMatch(/isRouteAllowed\(user\.portal, user\.features, "\/settlements"/);
  });

  it("is refused to a contractor and open to a recycler", () => {
    expect(isRouteAllowed("MSE_TRACE", ["recyclers"], "/settlements/abc", ["settlement.view"])).toBe(false);
    expect(
      isRouteAllowed("MSE_SCRAP", ["weighing_records"], "/settlements/abc", ["settlement.view", "weighing.view"]),
    ).toBe(true);
  });

  it("keeps the dialog's own 预览 · 打印 · 导出 · 发送", () => {
    expect(source).toMatch(/<RecordExportButton kind="SETTLEMENT" recordId=\{settlement\.id\}/);
  });
});
