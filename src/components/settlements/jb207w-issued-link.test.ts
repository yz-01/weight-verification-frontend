import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * JB207W (walk 11-17): after 【开单】 the 开结算单 page stayed on the form
 * instead of opening the new settlement, which invites issuing it twice. The
 * page still goes to the settlement; until it does it names the one just
 * issued with 【打开这张结算单】, and the form is cleared.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

const source = read("src/components/settlements/create-settlement.tsx");
const start = source.indexOf("onSuccess: (settlement) =>");
// To the end of the useMutation({ ... }) call: `setIssued({ ... });` inside
// it closes with the same three characters.
const onSuccess = source.slice(start, source.indexOf("\n  });", start));

describe("开结算单 after 【开单】", () => {
  it("still opens the new settlement", () => {
    expect(onSuccess).toContain("finish(`/settlements/${settlement.id}`)");
  });

  it("keeps the one just issued and clears the form", () => {
    expect(onSuccess).toContain("setIssued({ id: settlement.id, settlement_no: settlement.settlement_no })");
    for (const reset of ['setDispatch("")', 'setUnitPrice("")', 'setNotes("")']) {
      expect(onSuccess).toContain(reset);
    }
    // The issued load leaves the picker.
    expect(onSuccess).toContain('queryClient.invalidateQueries({ queryKey: ["incoming"] })');
  });

  it("names it with a link to open it", () => {
    const panel = source.slice(source.indexOf("{issued && ("), source.indexOf(")}", source.indexOf("</Button>", source.indexOf("{issued && ("))));
    expect(panel).toContain('t("settlements.issue.done", { no: issued.settlement_no })');
    expect(panel).toContain("<Link href={`/settlements/${issued.id}`}>");
    expect(panel).toContain('t("settlements.issue.open")');
  });

  it("says it in all four languages", () => {
    for (const locale of ["zh", "zh-TW", "en", "ms"]) {
      const issue = JSON.parse(read(`src/messages/${locale}.json`)).settlements.issue;
      expect(issue.done, locale).toContain("{no}");
      expect(issue.open, locale).toBeTruthy();
    }
    expect(JSON.parse(read("src/messages/zh.json")).settlements.issue.open).toBe("打开这张结算单");
  });
});
