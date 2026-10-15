import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { awaitingFieldTasksAddress } from "@/lib/awaiting-field-tasks";

/**
 * The photo review is gone (I17, ID38). The client: 「照片审批把它删除掉，整个
 * 系统没有照片审批的审批是审批事项」.
 *
 * The page, the MR page's photo tab and every name for it went together. A
 * menu, a help sentence or a "no access" line that still says 照片审批 sends
 * the reader looking for a screen that is no longer there. A waiting photo
 * submission is a field task waiting for acceptance, so the old address opens
 * the field-task list's 待验收 view instead.
 */
const LOCALES = ["en", "zh", "zh-TW", "ms"] as const;

/** Every spelling the removed screen had, in the four catalogues. */
const RETIRED = [/照片审批/, /照片審批/, /photo approval/i, /kelulusan foto/i, /"photoApprovals"/, /"photosNote"/];

function source(...parts: string[]): string {
  return readFileSync(path.join(process.cwd(), ...parts), "utf8");
}

describe("the photo review is gone (I17)", () => {
  it.each(LOCALES)("no message in %s names it", (locale) => {
    const text = source("src", "messages", `${locale}.json`);
    const offenders = text
      .split("\n")
      .filter((line) => RETIRED.some((pattern) => pattern.test(line)))
      .map((line) => line.trim());
    expect(offenders).toEqual([]);
  });

  it("the MR page has no photo tab any more", () => {
    for (const locale of LOCALES) {
      const catalogue = JSON.parse(source("src", "messages", `${locale}.json`));
      expect(Object.keys(catalogue.materialRequest.tab), locale).toEqual(["requests", "totals"]);
    }
    expect(existsSync(path.join(process.cwd(), "src/components/field-staff/photo-approvals.tsx"))).toBe(false);
    const office = source("src/components/material-requests/material-requests-office.tsx");
    expect(office).not.toMatch(/PhotoApprovals|photosNote/);
  });

  it("the old address opens the field tasks waiting for acceptance", () => {
    const page = source("src/app/(dashboard)/photo-approvals/page.tsx");
    expect(page).toContain("router.replace(awaitingFieldTasksAddress(searchParams.toString()))");
    expect(page).not.toContain("/material-requests");

    expect(awaitingFieldTasksAddress("")).toBe("/field-tasks?stage=AWAITING");
    // What the old link carried stays; its `tab` belonged to the old page.
    const forwarded = new URL(awaitingFieldTasksAddress("?tab=photos&project=p1&task=t1"), "https://x.test");
    expect(forwarded.pathname).toBe("/field-tasks");
    expect(forwarded.searchParams.get("stage")).toBe("AWAITING");
    expect(forwarded.searchParams.get("project")).toBe("p1");
    expect(forwarded.searchParams.get("task")).toBe("t1");
    expect(forwarded.searchParams.has("tab")).toBe(false);
    // A stage the old link happened to carry does not override 待验收.
    expect(new URL(awaitingFieldTasksAddress("stage=DONE"), "https://x.test").searchParams.getAll("stage")).toEqual([
      "AWAITING",
    ]);
  });
});
