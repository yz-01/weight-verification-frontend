import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * One tap opens a select on a phone, and it stays open (Lucas, 2026-10-09:
 * 现场记录 → 材料进场 「材料分类」 opened and closed at once, needing a second
 * tap). The fix lives in the shared `Select`, which refuses the close Radix
 * makes when a phone's viewport only changes height. It helps a screen only
 * if the screen uses that `Select`, so both are asserted by source here; the
 * rule itself is pinned in `lib/viewport-height-change.test.ts`.
 */
const SRC = path.join(process.cwd(), "src");
const SELECT = path.join(SRC, "components", "ui", "select.tsx");

function read(file: string) {
  return readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("the shared Select keeps its list open through a phone's viewport change", () => {
  it("starts the watch when it loads and routes every open change through it", () => {
    const code = read(SELECT);
    expect(code).toMatch(/^pageViewportHeightWatch\(\)$/m);
    expect(code).toContain("if (ignoreSelectClose(next)) return");
    expect(code).toMatch(/<SelectPrimitive\.Root[\s\S]*?onOpenChange=\{handleOpenChange\}/);
  });

  it("is the only place that uses Radix Select directly", () => {
    const direct = sourceFiles(SRC)
      .filter((file) => file !== SELECT)
      .filter((file) =>
        /@radix-ui\/react-select|import\s*\{[^}]*\bSelect\b[^}]*\}\s*from\s*["']radix-ui["']/.test(read(file)),
      )
      .map((file) => path.relative(process.cwd(), file));
    expect(direct).toEqual([]);
  });
});
