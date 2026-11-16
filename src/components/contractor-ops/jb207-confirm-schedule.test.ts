import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * JB207-9 (Lucas 11-16 audit): 【确认收运时间】 is drawn for whoever the
 * backend lets press it - `confirm_collection_plan` asks `dispatch.update`,
 * which is also who gets the card - not `waste_outgoing.order`.
 */
const source = readFileSync(
  path.join(process.cwd(), "src/components/contractor-ops/waste-outgoing-workspace.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("【确认收运时间】", () => {
  it("is gated on dispatch.update", () => {
    const button = source.slice(
      source.indexOf('row.dispatch_state === "ACCEPTED"'),
      source.indexOf('t("action.confirmSchedule")'),
    );
    expect(button).toContain('can("dispatch.update")');
    expect(button).not.toContain('can("waste_outgoing.order")');
  });
});
