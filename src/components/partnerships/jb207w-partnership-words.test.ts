import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * JB207W (walk 11-17 observation): on the recycler's 建筑商合作 an ACTIVE row's
 * 管理项目 / 暂停 were icon-only, while the contractor's 合作回收商 has said them
 * in words since JB206-8. Same pattern now on both sides.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

/** The JSX of the button whose click runs `marker`. */
function buttonAround(source: string, marker: string): string {
  const at = source.indexOf(marker);
  expect(at, marker).toBeGreaterThan(-1);
  return source.slice(source.lastIndexOf("<Button", at), source.indexOf("</Button>", at));
}

describe("建筑商合作 row buttons in words", () => {
  const source = read("src/components/partnerships/partnerships.tsx");

  it("管理项目 and 暂停 carry their label beside the icon", () => {
    const manage = buttonAround(source, "setManagingId(partnership.id)");
    const suspend = buttonAround(source, "setSuspending(partnership)");
    expect(manage).toContain('{t("partnerships.projects.manage")}');
    expect(suspend).toContain('{t("partnerships.suspend.confirm")}');
    expect(manage + suspend).not.toContain('size="icon-sm"');
  });

  it("wraps on a narrow screen rather than running off the row", () => {
    const start = source.indexOf('data-slot="partnership-row-actions"');
    expect(start).toBeGreaterThan(-1);
    expect(source.slice(source.lastIndexOf("<div", start), start)).toContain("flex-wrap");
  });
});
