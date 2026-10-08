/**
 * 项目进度摘要's blocks (2026-10 B17): the project manager reorders them by
 * dragging or with 上移 / 下移, and the order saved is the order shown. The
 * editor only ever calls these functions, so this is where the order is
 * pinned.
 */
import { describe, expect, it } from "vitest";

import type { SummaryBlock } from "@/interfaces/progress-reports";

import {
  SUMMARY_BLOCK_TYPES,
  blocksForSave,
  chartData,
  moveBlock,
  moveBlockTo,
  newBlock,
  removeBlock,
  replaceBlock,
} from "./progress-summary-blocks";

const ids = (blocks: { id: string }[]) => blocks.map((block) => block.id);

const summary: SummaryBlock[] = [
  newBlock("number", "n"),
  newBlock("chart", "c"),
  newBlock("text", "t"),
  newBlock("photos", "p"),
];

describe("reordering a summary's blocks", () => {
  it("moves one step up or down", () => {
    expect(ids(moveBlock(summary, 2, -1))).toEqual(["n", "t", "c", "p"]);
    expect(ids(moveBlock(summary, 0, 1))).toEqual(["c", "n", "t", "p"]);
  });

  it("does not move past either end", () => {
    expect(ids(moveBlock(summary, 0, -1))).toEqual(["n", "c", "t", "p"]);
    expect(ids(moveBlock(summary, 3, 1))).toEqual(["n", "c", "t", "p"]);
  });

  it("drops a dragged block where it is let go", () => {
    expect(ids(moveBlockTo(summary, 3, 0))).toEqual(["p", "n", "c", "t"]);
    expect(ids(moveBlockTo(summary, 0, 2))).toEqual(["c", "t", "n", "p"]);
  });

  it("never changes the list it was given", () => {
    moveBlockTo(summary, 3, 0);
    expect(ids(summary)).toEqual(["n", "c", "t", "p"]);
  });

  it("removes and replaces by id", () => {
    expect(ids(removeBlock(summary, "c"))).toEqual(["n", "t", "p"]);
    const edited = { ...summary[2], text: "第三层楼板已浇筑" } as SummaryBlock;
    const replaced = replaceBlock(summary, edited);
    expect(ids(replaced)).toEqual(["n", "c", "t", "p"]);
    expect(replaced[2]).toMatchObject({ text: "第三层楼板已浇筑" });
  });
});

describe("a new block", () => {
  it("can be any of the four kinds, all of it left empty", () => {
    expect(SUMMARY_BLOCK_TYPES).toEqual(["text", "photos", "number", "chart"]);
    expect(newBlock("number", "x")).toEqual({ id: "x", type: "number", label: "", value: "", unit: "", note: "" });
    expect(newBlock("photos", "x")).toMatchObject({ photo_ids: [] });
  });

  it("gets an id of its own", () => {
    expect(newBlock("text").id).not.toBe(newBlock("text").id);
  });
});

describe("a chart's hand-typed figures", () => {
  it("draws blanks as 0 and keeps decimals", () => {
    const chart = {
      ...(newBlock("chart", "c") as Extract<SummaryBlock, { type: "chart" }>),
      points: [
        { label: "7月", value: "20" },
        { label: "", value: "1,041.5" },
        { label: "9月", value: "" },
      ],
    };
    expect(chartData(chart)).toEqual([
      { label: "7月", value: 20 },
      { label: "2", value: 1041.5 },
      { label: "9月", value: 0 },
    ]);
    const saved = blocksForSave([chart])[0] as typeof chart;
    expect(saved.points.map((point) => point.value)).toEqual([20, 1041.5, 0]);
  });
});
