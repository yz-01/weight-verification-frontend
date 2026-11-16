import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

/** The JSX of the button whose click runs `marker`. */
function buttonAround(source: string, marker: string): string {
  const at = source.indexOf(marker);
  expect(at, marker).toBeGreaterThan(-1);
  return source.slice(source.lastIndexOf("<Button", at), source.indexOf("</Button>", at));
}

describe("JB207-10: 接受 / 拒绝 say so in words", () => {
  it("on the recycler's 建筑商合作", () => {
    const source = read("src/components/partnerships/partnerships.tsx");
    const accept = buttonAround(source, 'setResponse({ partnership, status: "ACTIVE" })');
    const reject = buttonAround(source, 'setResponse({ partnership, status: "REJECTED" })');
    expect(accept).toContain('{t("partnerships.respond.accept")}');
    expect(reject).toContain('{t("partnerships.respond.reject")}');
    expect(accept + reject).not.toContain('size="icon-sm"');
  });

  it("on the contractor's 合作回收商", () => {
    const source = read("src/components/partners/recyclers.tsx");
    const accept = buttonAround(source, "acceptPartnership(partnership.id)");
    const reject = buttonAround(source, 'setConfirmation({ kind: "reject", partnership })');
    expect(accept).toContain('{t("recyclers.action.accept")}');
    expect(reject).toContain('{t("recyclers.action.reject")}');
    expect(accept + reject).not.toContain('size="icon"');
  });
});

describe("JB207-5b: a rejected or suspended partner can be asked again", () => {
  it("is not left out of the recycler's request picker", () => {
    const source = read("src/components/partnerships/partnerships.tsx");
    const start = source.indexOf("const excludedCompanyIds");
    const excluded = source.slice(start, source.indexOf("return (", start));
    expect(excluded).toContain('partnership.status === "PENDING" || partnership.status === "ACTIVE"');
  });
});
