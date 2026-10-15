import { describe, expect, it } from "vitest";

import { wallItems, wallStep, type WallRecord } from "./gate-photo-wall";

/**
 * I33 (ID74): 「放大后可直接左右切换上一张、下一张照片，详细记录同步切换」.
 * The photos of one record first, then the next record, then the next page.
 */
function record(id: string, photos: number): WallRecord {
  return {
    id,
    incident_no: `GT-${id}`,
    wall_photos: Array.from({ length: photos }, (_, index) => ({
      id: `${id}-p${index + 1}`,
      thumbnail: `https://cdn.example/${id}-${index + 1}-small.webp`,
      watermarked_image: `https://cdn.example/${id}-${index + 1}.jpg`,
      captured_at: "2026-10-14T06:00:00Z",
      latitude: "3.1",
      longitude: "101.6",
      accuracy_m: null,
      guard_name: "Ah Seng",
      gate_name: "",
    })),
  } as unknown as WallRecord;
}

/** Walk right from the first photo the way the viewer does, loading pages as it goes. */
function walkRight(pages: { results: WallRecord[] }[], loadedPages: number) {
  const seen: string[] = [];
  let shown = loadedPages;
  let items = wallItems(pages.slice(0, shown));
  let index = 0;
  seen.push(items[index].key);
  for (;;) {
    const step = wallStep(index, 1, items.length, shown < pages.length);
    if (step.kind === "none") break;
    if (step.kind === "load") {
      shown += 1;
      items = wallItems(pages.slice(0, shown));
      if (step.index >= items.length) break;
    }
    index = step.index;
    seen.push(items[index].key);
  }
  return seen;
}

describe("the photo wall's viewing order", () => {
  const pages = [
    { results: [record("A", 2), record("B", 1)] },
    { results: [record("C", 3)] },
  ];

  it("lists every photo, a record's photos together, newest record first", () => {
    expect(wallItems(pages).map((item) => [item.key, item.photoIndex, item.photoCount])).toEqual([
      ["A:A-p1", 0, 2],
      ["A:A-p2", 1, 2],
      ["B:B-p1", 0, 1],
      ["C:C-p1", 0, 3],
      ["C:C-p2", 1, 3],
      ["C:C-p3", 2, 3],
    ]);
  });

  it("goes through a record's photos, then the next record, then the next page", () => {
    expect(walkRight(pages, 1)).toEqual([
      "A:A-p1",
      "A:A-p2",
      "B:B-p1",
      "C:C-p1",
      "C:C-p2",
      "C:C-p3",
    ]);
  });

  it("asks for the next page only past the last loaded photo, and stops at the end", () => {
    expect(wallStep(1, 1, 3, true)).toEqual({ kind: "show", index: 2 });
    expect(wallStep(2, 1, 3, true)).toEqual({ kind: "load", index: 3 });
    expect(wallStep(2, 1, 3, false)).toEqual({ kind: "none" });
    expect(wallStep(0, -1, 3, true)).toEqual({ kind: "none" });
    expect(wallStep(2, -1, 3, false)).toEqual({ kind: "show", index: 1 });
  });

  it("shows a record once when new photos pushed it onto the next page", () => {
    const shifted = [
      { results: [record("A", 1), record("B", 1)] },
      { results: [record("B", 1), record("C", 1)] },
    ];
    expect(wallItems(shifted).map((item) => item.record.id)).toEqual(["A", "B", "C"]);
  });

  it("leaves out a record with no photo to show", () => {
    expect(wallItems([{ results: [record("A", 0), record("B", 1)] }]).map((item) => item.key)).toEqual(["B:B-p1"]);
  });
});
