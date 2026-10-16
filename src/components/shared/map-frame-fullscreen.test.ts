/**
 * Lucas 10/17: the map's 「全屏」 did nothing. The press went full screen, then
 * the frame appended the map's node to the spot it was already in - which
 * moves it, and a node taken out of the page leaves the browser's full
 * screen at once. The runner has no DOM, so the guard is pinned in the source.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "src/components/shared/map-frame.tsx"), "utf8");

describe("the map's 全屏 stays full screen (Lucas 10/17)", () => {
  it("puts the map back in its place only when it is not already there", () => {
    const appends = source.match(/[^\n]*appendChild\(holder\)[^\n]*/g) ?? [];
    expect(appends.length).toBeGreaterThan(0);
    for (const line of appends) {
      if (line.includes("overlay.appendChild")) continue;
      expect(line, line).toMatch(/holder\.parentNode !== slot/);
    }
  });
});
