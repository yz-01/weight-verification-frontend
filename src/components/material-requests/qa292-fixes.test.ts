/**
 * QA292 (browser walk of JB292, 客户 11-27f) - what the walk found, kept fixed:
 *
 * 1. A double click on 【批准】 sent the approval twice; the second came back
 *    「已经审批过」 in red under a request that had just been approved (an
 *    elderly approver double-clicks). One decision per press now, for 【批准】
 *    and 【退回】 alike.
 * 2. A chip's ✕ shrank to 16 px beside a long supplier name (Syarikat …
 *    Sdn. Bhd.); it keeps its 28 px now.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

describe("QA292 1. one decision per press", () => {
  it("【批准】 and 【退回】 go through the guarded decide()", () => {
    const page = read("src/components/material-requests/material-requests-office.tsx");
    expect(page).toMatch(
      /if \(sending\.current\) return;\s+sending\.current = true;\s+review\.mutate\(decision, \{\s+onSettled: \(\) => \{\s+sending\.current = false;/,
    );
    expect(page).toContain('onClick={() => decide("APPROVED")}');
    expect(page).toContain('onClick={() => decide("RETURNED")}');
    expect(page).not.toContain("review.mutate(\"APPROVED\")");
    expect(page).not.toContain("review.mutate(\"RETURNED\")");
  });
});

describe("QA292 2. the big ✕ keeps its size beside a long name", () => {
  it("the large chip's ✕ does not shrink", () => {
    const list = read("src/components/shared/multi-pick-list.tsx");
    expect(list).toContain('"inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full');
  });
});
