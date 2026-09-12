import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const LOCALES = ["en", "zh", "zh-TW", "ms"] as const;

function catalogue(locale: string) {
  const file = path.join(process.cwd(), "src", "messages", `${locale}.json`);
  return JSON.parse(readFileSync(file, "utf8")).fieldStaffPwa;
}

/**
 * A client asked for one name per thing. The field home used to carry its own
 * tile copy - "材料拍照" - while the screen that tile opened was titled
 * "材料记录", so the same work had two names depending on where you stood.
 *
 * The tiles themselves were removed on develop, which is why nothing on screen
 * changes when these values do. That is exactly why this test exists: the
 * duplicate copy is still in the catalogues, still shipping on deploy, and
 * would drift apart again unmarked. The page title is the authority - it names
 * the whole job, not just the photograph.
 */
describe("field home tiles and the page titles they open share one name", () => {
  const pairs = [
    ["material", "records", "material"],
    ["equipment", "records", "equipment"],
    ["progress", "records", "progress"],
    ["consultant", "records", "consultant"],
    ["safety", "records", "safety"],
    ["waste", "records", "waste"],
    ["records", "records", "title"],
    ["attendance", "attendance", "title"],
  ] as const;

  for (const locale of LOCALES) {
    const fsp = catalogue(locale);
    for (const [tile, section, title] of pairs) {
      it(`${locale}: home.${tile} matches ${section}.${title}`, () => {
        expect(fsp.home[tile]).toBe(fsp[section][title]);
      });
    }
  }

  it("leaves each screen's own heading alone", () => {
    for (const locale of LOCALES) {
      const fsp = catalogue(locale);
      expect(fsp.home.title).not.toBe(fsp.records.title);
      expect(fsp.home.subtitle).not.toBe(fsp.records.subtitle);
    }
  });
});
