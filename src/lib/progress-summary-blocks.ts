/**
 * 项目进度摘要's blocks, as plain functions (2026-10 B17).
 *
 * The project manager adds, removes and reorders blocks - by dragging or with
 * the up / down buttons - and nothing is required. The editor only ever calls
 * these, so the order that is saved is exactly the order these return, and
 * the reorder rules are tested without a browser.
 */
import type {
  SummaryBlock,
  SummaryBlockType,
  SummaryChartBlock,
} from "@/interfaces/progress-reports";

export const SUMMARY_BLOCK_TYPES: readonly SummaryBlockType[] = [
  "text",
  "photos",
  "number",
  "chart",
];

let counter = 0;

/** A key unique within one summary; the server keeps whatever it is given. */
export function blockId(): string {
  counter += 1;
  return `b${Date.now().toString(36)}${counter.toString(36)}`;
}

/** An empty block of one type. Every field may stay empty. */
export function newBlock(type: SummaryBlockType, id = blockId()): SummaryBlock {
  switch (type) {
    case "text":
      return { id, type, text: "" };
    case "photos":
      return { id, type, caption: "", photo_ids: [], photos: [] };
    case "number":
      return { id, type, label: "", value: "", unit: "", note: "" };
    case "chart":
      return {
        id,
        type,
        chart: "bar",
        title: "",
        series: "",
        points: [
          { label: "", value: "" },
          { label: "", value: "" },
        ],
      };
  }
}

/** Move the block at `from` to position `to` (drag and drop). */
export function moveBlockTo<T>(blocks: readonly T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    from >= blocks.length ||
    to < 0 ||
    to >= blocks.length
  ) {
    return [...blocks];
  }
  const next = [...blocks];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** One step up (-1) or down (+1); at either end nothing moves. */
export function moveBlock<T>(blocks: readonly T[], index: number, by: -1 | 1): T[] {
  return moveBlockTo(blocks, index, index + by);
}

export function removeBlock<T extends { id: string }>(blocks: readonly T[], id: string): T[] {
  return blocks.filter((block) => block.id !== id);
}

export function replaceBlock<T extends { id: string }>(blocks: readonly T[], next: T): T[] {
  return blocks.map((block) => (block.id === next.id ? next : block));
}

/** A chart's points as numbers, for drawing; a blank value draws as 0. */
export function chartData(block: SummaryChartBlock): { label: string; value: number }[] {
  return block.points.map((point, index) => {
    const value = Number(String(point.value ?? "").replace(/,/g, "").trim());
    return {
      label: point.label || String(index + 1),
      value: Number.isFinite(value) ? value : 0,
    };
  });
}

/**
 * The blocks as they are sent: chart values that are not numbers are refused
 * by the server, so a blank one is sent as 0 rather than failing the save.
 */
export function blocksForSave(blocks: readonly SummaryBlock[]): SummaryBlock[] {
  return blocks.map((block) =>
    block.type === "chart"
      ? {
          ...block,
          points: block.points.map((point) => {
            const value = Number(String(point.value ?? "").replace(/,/g, "").trim());
            return { label: point.label, value: Number.isFinite(value) ? value : 0 };
          }),
        }
      : block,
  );
}
