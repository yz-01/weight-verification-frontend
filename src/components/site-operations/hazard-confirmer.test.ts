import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "src/components/site-operations/safety.tsx"),
  "utf8",
);

/**
 * One confirmer per rectification: whoever raised it (B21, E02, X8).
 *
 * B21 had 「手机现场发起 → 指定确认人；后台发起 → 后台发起人；顾问发起 → 顾问」;
 * X8 (2026-10, 「整改完成后，由原发起人确认完成」) made the phone the same as the
 * other two, so nobody picks a confirmer any more. And still not
 * 「手机和后台两端都要确认」. The server stores that one person and answers
 * `can_confirm` per reader. A screen that went on showing 【确认完成】 to anyone
 * holding `safety.verify` would put the button in front of every supervisor
 * on the project, all but one of whom the server then refuses.
 */
describe("the confirm entry follows the confirmer", () => {
  it("never decides it from the safety.verify permission", () => {
    expect(source).not.toContain('can("safety.verify")');
  });

  it("shows it from the server's can_confirm on the office row, detail and phone card", () => {
    const uses = source.match(/\.can_confirm/g) ?? [];
    // The ?incident= auto-open, the row icon, the detail drawer, the phone card.
    expect(uses.length).toBeGreaterThanOrEqual(4);
  });

  it("refuses assigning the raiser to fix their own hazard before sending", () => {
    expect(source).toContain('te("form.confirmerConflict")');
  });

  // X8 overturns the old assertion that the report form, too, warned about a
  // chosen confirmer who was also the rectifier: there is no choosing now.
  it("offers no confirmer picker: the raiser confirms (X8)", () => {
    expect(source).not.toContain("selectConfirmer");
    expect(source).not.toContain("confirmer.me");
    expect(source).not.toMatch(/confirmer:\s*(namesConfirmer|fieldMode)/);
    expect(source).toContain('t("ehs.confirmer.initiator")');
  });
});

/**
 * 「VO 不在手机 EHS，也不叫『整改 VO』」 (E07). The seeded column is switched
 * off on the server; the report form leaves it out even if a site turns it
 * back on.
 */
describe("VO is not an EHS column on the phone", () => {
  it("filters the retired VO column out of the report form", () => {
    expect(source).toContain('const RETIRED_VO_COLUMN_CODE = "HZD-VO"');
    expect(source).toMatch(/category\.code !== RETIRED_VO_COLUMN_CODE/);
  });
});
