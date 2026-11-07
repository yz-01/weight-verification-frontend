/**
 * Every drop-down opens under its box (Lucas 11-08: an empty list's
 * 「没有可选项」 showed in the screen's top-left corner). Radix's default
 * "item-aligned" lines the list up with the chosen item; a list with no items
 * - empty, or only a load-error line - has none, and was placed at 0,0.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve("src/components/ui/select.tsx"), "utf8");

describe("SelectContent", () => {
  it("defaults to the popper position, under the trigger", () => {
    expect(source).toMatch(/position = "popper"/);
    expect(source).not.toMatch(/position = "item-aligned"/);
  });
});
