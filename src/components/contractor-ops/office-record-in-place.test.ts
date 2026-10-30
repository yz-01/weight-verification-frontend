import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 分类管理 → 查看记录 opens a movement or a progress record in place (Lucas
 * 10-30: 「打开每个事项的原记录，可是不要跳转页面」): the very window its
 * module list opens, by id, and nothing in it leaves the page.
 */
const code = readFileSync(
  path.join(process.cwd(), "src/components/contractor-ops/office-module-lists.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

function componentBody(name: string) {
  const start = code.search(new RegExp(String.raw`\n(?:export )?function ${name}\(`));
  expect(start, `${name} is declared`).toBeGreaterThan(-1);
  const rest = code.slice(start + 1);
  const next = rest.slice(1).search(/\n(?:export )?function [A-Z]/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe("in-place record windows (分类管理 查看记录)", () => {
  it("the list and the in-place movement draw the one window", () => {
    expect(componentBody("SiteEquipmentOffice")).toMatch(/<MovementRecordDialog\b/);
    const inPlace = componentBody("EquipmentMovementInPlace");
    expect(code).toMatch(/export function EquipmentMovementInPlace\(\{\s*id,\s*onClose,?\s*\}/);
    expect(inPlace).toMatch(/<MovementRecordDialog\b/);
    expect(inPlace).toMatch(/getEquipmentMovements\(\{ id, page_size: 1 \}\)/);
    // Its key is under the list's, so a change anywhere refreshes it.
    expect(inPlace).toMatch(/queryKey = \["equipment-movements", "one", id\]/);
  });

  it("the list and the in-place progress record draw the one window", () => {
    expect(componentBody("SiteProgressOffice")).toMatch(/<ProgressRecordDialog\b/);
    const inPlace = componentBody("ProgressInPlace");
    expect(inPlace).toMatch(/<ProgressRecordDialog\b/);
    expect(inPlace).toMatch(/queryKey = \["site-progress", "one", id\]/);
  });

  it("a progress record found by id is the one asked for, never another row", () => {
    const find = code.slice(code.indexOf("async function getProgressRecord("), code.indexOf("export function ProgressInPlace("));
    expect(find).toMatch(/direct\.results\[0\]\?\.id === id/);
    expect(find).toMatch(/page\.results\.find\(\(row\) => row\.id === id\)/);
  });

  it("nothing in the shared windows leaves the page", () => {
    for (const name of ["MovementRecordDialog", "ProgressRecordDialog", "EquipmentMovementInPlace", "ProgressInPlace"]) {
      const body = componentBody(name);
      expect(body, name).not.toMatch(/<Link\b/);
      expect(body, name).not.toMatch(/router\.push|window\.location/);
    }
  });
});
