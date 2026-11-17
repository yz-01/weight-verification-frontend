import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DISPATCH_STATES } from "@/interfaces/contractor";

/**
 * JB207W (walk 11-17 observation): an ACCEPTED order with no driver said
 * 「此车已离场，无法再修改。若最终没有送达，请取消。」 - shown for every state
 * that is not editable. The line now says why in that state's own words, and
 * only says the lorry left when it has.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

const LOCALES = ["zh", "zh-TW", "en", "ms"] as const;
const catalogues = Object.fromEntries(
  LOCALES.map((locale) => [locale, JSON.parse(read(`src/messages/${locale}.json`))]),
);
// Only DRAFT is editable (`WasteDispatch.is_editable`); a cancelled order
// shows no line.
const LOCKED = DISPATCH_STATES.filter((state) => state !== "DRAFT" && state !== "CANCELLED");

describe("the order page's 'cannot be changed' line", () => {
  it("is chosen by the order's state", () => {
    const page = read("src/components/dispatches/view-dispatch.tsx");
    expect(page).toContain("{t(`dispatches.lockedBy.${data.state}`)}");
    expect(page).not.toContain('{t("dispatches.lockedNote")}');
  });

  it("has a line for every locked state in all four languages", () => {
    for (const locale of LOCALES) {
      for (const state of LOCKED) {
        expect(catalogues[locale].dispatches.lockedBy[state], `${locale} ${state}`).toBeTruthy();
      }
    }
  });

  it("says the lorry left only once it has", () => {
    const zh = catalogues.zh.dispatches.lockedBy;
    for (const state of ["PENDING_ACCEPTANCE", "ACCEPTED"]) {
      expect(zh[state]).not.toContain("离场");
      expect(zh[state]).not.toContain("取消");
    }
    expect(zh.ACCEPTED).toContain("回收商已接单");
    // RELEASED is the one the old sentence was written for, cancel and all.
    expect(zh.RELEASED).toBe(catalogues.zh.dispatches.lockedNote);
  });
});
