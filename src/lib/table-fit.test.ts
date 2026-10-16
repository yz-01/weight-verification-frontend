import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LIST_FITS } from "@/lib/list-fits";
import {
  FIT_KIND_PX,
  FIT_TABLE_PX,
  clippedText,
  defaultVisibility,
  fitWidth,
  initialVisibility,
  type ClipBox,
  type ListFit,
} from "@/lib/table-fit";

/**
 * I39 / ID80: on a 1366 px desktop every back-office list shows its default
 * columns and its 「查看 / 更改」 without scrolling right, by the widths each
 * column needs at its narrowest (FIT_KIND_PX).
 */

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

const FITS = Object.entries(LIST_FITS) as Array<[string, ListFit]>;

/** Columns the shared frame adds rather than the list's own source. */
const FRAME_COLUMNS = new Set(["pack", "needs_action", "actions", "cover_photo"]);

/** The keys before I39, so a list whose defaults changed can be seen to bump. */
const KEYS_BEFORE_I39: Record<string, string> = {
  materialReceipts: "receipts.v4",
  materialOutgoing: "material-outgoing.v2",
  materialRequests: "material-requests.v5",
  equipmentMovements: "equipment-movements",
  equipmentRegister: "site-equipment-register",
  siteProgress: "site-progress",
  hazards: "trace-safety",
  permits: "permits.v1",
  gatePhotos: "gate-records.photos.v1",
  gateIssues: "gate-records.issues.v1",
  visitors: "visitor-records.v1",
  siteWorkers: "site-workers.roster",
  siteWorkerVisits: "site-workers.visits",
  siteDisposals: "site-disposals",
  wasteOutgoing: "waste-outgoing",
  sundryClaims: "sundry-claims",
};

describe("every back-office list fits 1366 px (I39-3, I39-5)", () => {
  it("leaves the table the screen less the sidebar and gutters", () => {
    expect(FIT_TABLE_PX).toBe(1048);
  });

  it.each(FITS)("%s: its default columns fit", (_, fit) => {
    expect(fitWidth(fit.columns, fit.hidden)).toBeLessThanOrEqual(FIT_TABLE_PX);
  });

  it("covers the lists the client named", () => {
    expect(Object.keys(LIST_FITS).sort()).toEqual(Object.keys(KEYS_BEFORE_I39).sort());
  });

  it.each(FITS)("%s: hides only columns it has, never the number or 查看 / 更改", (_, fit) => {
    for (const id of fit.hidden) {
      expect(fit.columns, id).toHaveProperty(id);
      expect(fit.columns[id], id).not.toBe("recno");
      expect(fit.columns[id], id).not.toBe("actions");
    }
  });

  it.each(FITS)("%s: names the columns its page really has, and reads its key and defaults here", (name, fit) => {
    const source = read(fit.file);
    for (const id of Object.keys(fit.columns)) {
      if (FRAME_COLUMNS.has(id)) continue;
      expect(source, `${name}.${id}`).toMatch(new RegExp(`(accessorKey|id): "${id}"`));
    }
    if (name === "gatePhotos" || name === "gateIssues") {
      expect(source).toContain(
        'storageKey={LIST_FITS[tab === "photos" ? "gatePhotos" : "gateIssues"].storageKey}',
      );
      expect(source).toContain(
        'defaultHidden={LIST_FITS[tab === "photos" ? "gatePhotos" : "gateIssues"].hidden}',
      );
    } else {
      expect(source).toContain(`storageKey={LIST_FITS.${name}.storageKey}`);
      expect(source).toContain(`defaultHidden={LIST_FITS.${name}.hidden}`);
    }
  });

  it.each(FITS)("%s: a list whose defaults changed remembers columns under a new key (I39 rule 6)", (name, fit) => {
    if (fit.hidden.length > 0) expect(fit.storageKey).not.toBe(KEYS_BEFORE_I39[name]);
    else expect(fit.storageKey).toBe(KEYS_BEFORE_I39[name]);
  });

  it("gives every list its own key", () => {
    const keys = FITS.map(([, fit]) => fit.storageKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("the equipment list of 图 1 fits with its number, status, name and 查看", () => {
    const fit = LIST_FITS.equipmentMovements;
    for (const id of ["record_no", "occurred_at", "status", "equipment", "quantity", "actions"]) {
      expect(fit.hidden).not.toContain(id);
    }
    // Everything shown, it would not fit - which is why some wait in 「字段」.
    expect(fitWidth(fit.columns)).toBeGreaterThan(FIT_TABLE_PX);
  });

  it("adds up widths with the cell padding", () => {
    expect(fitWidth({ a: "thumb", b: "actions" })).toBe(FIT_KIND_PX.thumb + FIT_KIND_PX.actions + 32);
    expect(fitWidth({ a: "thumb", b: "actions" }, ["a"])).toBe(FIT_KIND_PX.actions + 16);
  });
});

describe("the column choice a table starts with (I39-5)", () => {
  it("hides a list's defaults when nothing is saved", () => {
    expect(defaultVisibility(["a", "b"])).toEqual({ a: false, b: false });
    expect(initialVisibility(null, ["a"])).toEqual({ visibility: { a: false }, corrupt: false });
  });

  it("keeps the reader's own saved choice, even one that shows a default-hidden column", () => {
    expect(initialVisibility('{"a":true,"c":false}', ["a"])).toEqual({
      visibility: { a: true, c: false },
      corrupt: false,
    });
  });

  it("drops a saved value it cannot read and falls back to the defaults", () => {
    expect(initialVisibility("{oops", ["a"])).toEqual({ visibility: { a: false }, corrupt: true });
    expect(initialVisibility("[1]", ["a"])).toEqual({ visibility: { a: false }, corrupt: true });
  });
});

describe("the hover text of a clipped cell (I39: 「…」 then the whole text)", () => {
  const box = (over: Partial<ClipBox> = {}): ClipBox => ({
    scrollWidth: 100,
    clientWidth: 100,
    scrollHeight: 40,
    clientHeight: 40,
    textContent: "  Furklife   truck\nAAA 342 ",
    ...over,
  });

  it("says nothing when the whole text is on screen", () => {
    expect(clippedText(box())).toBeNull();
  });

  it("gives the whole text, spaces tidied, when the two-line clamp cuts it", () => {
    expect(clippedText(box({ scrollHeight: 60 }))).toBe("Furklife truck AAA 342");
  });

  it("also when a one-line truncate inside the cell cuts it", () => {
    const inner = box({ scrollWidth: 180 });
    expect(clippedText(box({ querySelectorAll: () => [inner] }))).toBe("Furklife truck AAA 342");
  });

  it("prefers the rendered text when the browser gives it", () => {
    expect(clippedText(box({ scrollWidth: 140, innerText: "Crane 50t\nCRANEE" }))).toBe("Crane 50t CRANEE");
  });
});
