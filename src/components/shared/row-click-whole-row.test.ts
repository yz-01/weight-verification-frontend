import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Lucas 2026-10-27 (JB42): the blank 资料包 cell of a 工程进度 row opened
 * nothing - the shared table swallowed every click on the whole 资料包 and
 * 操作 cells, not only on their buttons. A row opens wherever it is pressed;
 * a button, link or tick box keeps its own press through `clickOpensRow`,
 * which also ignores presses inside a popup opened from the row.
 */
const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

describe("the empty part of a cell opens the row (JB42)", () => {
  it("keeps only the tick-box column's whole cell to itself", () => {
    const source = read("src/components/shared/data-table.tsx");
    expect(source).toContain("const OWN_CLICK_COLUMNS = new Set([PACK_SELECT_COLUMN]);");
  });

  it("opens a supplier return wherever its row is pressed, photos and signatures their own", () => {
    const source = read("src/components/suppliers/supplier-return-badge.tsx");
    expect(source).toMatch(/if \(clickOpensRow\(event\)\) onOpen\(\);/);
    expect(source).not.toContain("<TableCell onClick=");
  });

  it("leaves no other table cell swallowing its row's click", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(path.join(process.cwd(), dir))) {
        const rel = `${dir}/${name}`;
        if (statSync(path.join(process.cwd(), rel)).isDirectory()) walk(rel);
        // The shared table's one exception, the tick box, is checked above.
        else if (rel.endsWith(".tsx") && !rel.includes(".test.") && rel !== "src/components/shared/data-table.tsx") {
          if (/<TableCell[^>]*\bonClick=/.test(read(rel))) offenders.push(rel);
        }
      }
    };
    walk("src/components");
    expect(offenders).toEqual([]);
  });
});
