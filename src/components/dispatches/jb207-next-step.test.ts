import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * JB207-10 (Lucas 11-16 audit): a waste order's next step, in words.
 *
 * The order's own page had no recycler action and the list's 派车 was a 28 px
 * truck with a hover tooltip. The page now has 【派车 / 约收运时间】, which
 * opens 废料订单's dialog through `?dispatch=`, and the list row says it too.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

const detail = read("src/components/dispatches/view-dispatch.tsx");
const list = read("src/components/incoming/incoming.tsx");

describe("the order's next step", () => {
  it("is a labelled button on the order, for a recycler who may assign", () => {
    expect(detail).toMatch(/const canArrange =\n\s+isRecycler &&\n\s+can\("task\.assign"\) &&/);
    expect(detail).toContain('(data.state === "ACCEPTED" || data.state === "PENDING_ACCEPTANCE")');
    expect(detail).toContain("<Link href={`/waste-orders?dispatch=${data.id}`}>");
    expect(detail).toMatch(/\{t\("dispatches\.recyclerNext"\)\}/);
  });

  it("lands on the dialog that 废料订单 opens from ?dispatch=", () => {
    expect(list).toContain('useSearchParams().get("dispatch")');
    expect(list).toMatch(
      /can\("task\.assign"\) && \["PENDING_ACCEPTANCE", "ACCEPTED"\]\.includes\(load\.state\)/,
    );
  });

  it("is words on the list row, not an icon", () => {
    const at = list.indexOf("onClick={() => setAssigning(row.original)}");
    expect(at).toBeGreaterThan(-1);
    const button = list.slice(list.lastIndexOf("<Button", at), list.indexOf("</Button>", at));
    expect(button).toContain('{t("dispatches.recyclerNext")}');
    expect(button).not.toContain('size="icon"');
  });

  it("is worded in every language", () => {
    for (const locale of ["zh", "zh-TW", "en", "ms"]) {
      const messages = JSON.parse(read(`src/messages/${locale}.json`));
      expect(messages.dispatches.recyclerNext, locale).toBeTruthy();
    }
  });
});
