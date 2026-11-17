/**
 * JB206 on the contractor's dispatch page (Lucas 11-16 audit):
 *
 * - JB206-5: a new photo refreshes the query the page reads
 *   (`["dispatches", "detail", id]`), not `["dispatch", id]`, which matched
 *   nothing;
 * - JB206-8: 扣杂's kind and state, the settlement's state and the payment's
 *   method in words, not `MOISTURE · PENDING`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { codeWords, dispatchDetailKey } from "@/components/dispatches/view-dispatch";
import zh from "@/messages/zh.json";

const page = readFileSync(path.join(process.cwd(), "src/components/dispatches/view-dispatch.tsx"), "utf8");

/** A `t` over the zh catalogue, as next-intl's root translator reads it. */
function words(key: string): string {
  let node: unknown = zh;
  for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
  return typeof node === "string" ? node : key;
}
const t = Object.assign(words, { has: (key: string) => words(key) !== key });

describe("a new photo shows at once (JB206-5)", () => {
  it("refreshes the key the page reads", () => {
    expect(dispatchDetailKey("d1")).toEqual(["dispatches", "detail", "d1"]);
    expect(page).toContain("queryKey: dispatchDetailKey(id),");
    expect(page).toContain("queryKey: dispatchDetailKey(data.id),");
    expect(page).not.toContain('queryKey: ["dispatch", data.id]');
  });
});

describe("the recycler's codes in words (JB206-8)", () => {
  it("words a known code and keeps an unknown one", () => {
    expect(codeWords(t, "deductions.kind", "MOISTURE")).toBe("水分");
    expect(codeWords(t, "deductions.state", "PENDING")).toBe(zh.deductions.state.PENDING);
    expect(codeWords(t, "settlements.state", "ISSUED")).toBe("已开出");
    expect(codeWords(t, "settlements.method", "BANK_TRANSFER")).toBe("银行转账");
    expect(codeWords(t, "settlements.method", "CRYPTO")).toBe("CRYPTO");
    expect(codeWords(t, "settlements.state", null)).toBeNull();
  });

  it("is what the settlement panel prints", () => {
    expect(page).toContain('codeWords(t, "deductions.kind", deduction.kind)');
    expect(page).toContain('codeWords(t, "deductions.state", deduction.state)');
    expect(page).toContain('codeWords(t, "settlements.state", execution.settlement.state)');
    expect(page).toContain('codeWords(t, "settlements.method", payment.method)');
    expect(page).not.toContain("{deduction.kind} ·");
  });
});
