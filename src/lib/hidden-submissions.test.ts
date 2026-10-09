import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  canHideRow,
  hideSubmission,
  HIDDEN_SUBMISSIONS_CHANGED,
  prunedHidden,
  pruneHiddenSubmissions,
  readHidden,
  unhideAllSubmissions,
  withoutHidden,
} from "@/lib/hidden-submissions";

/**
 * 「从我的列表移除」 (client 2026-10-09 四.4): a list on this phone, per user.
 * Nothing is deleted and nobody else's list changes.
 */

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  kind: "MATERIAL_RECEIPT",
  id,
  submitted_at: "2026-10-01T02:00:00Z",
  ...extra,
});

describe("the worker's own hide list", () => {
  let events: number;
  beforeEach(() => {
    events = 0;
    vi.stubGlobal("localStorage", new MemoryStorage());
    vi.stubGlobal("window", {
      dispatchEvent: (event: Event) => {
        if (event.type === HIDDEN_SUBMISSIONS_CHANGED) events += 1;
        return true;
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("hides a record from one worker's list only", () => {
    hideSubmission("u-1", row("r-1"));

    const rows = [row("r-1"), row("r-2")];
    expect(withoutHidden(rows, readHidden("u-1")).map((r) => r.id)).toEqual(["r-2"]);
    // Another worker signed in on the same phone still sees it.
    expect(withoutHidden(rows, readHidden("u-2")).map((r) => r.id)).toEqual(["r-1", "r-2"]);
    expect(events).toBe(1);
  });

  it("keys by kind as well as id: a hazard and a receipt sharing an id are different records", () => {
    hideSubmission("u-1", row("same"));
    const hazard = { ...row("same"), kind: "HAZARD" };
    expect(withoutHidden([hazard], readHidden("u-1"))).toEqual([hazard]);
  });

  it("shows everything again when asked", () => {
    hideSubmission("u-1", row("r-1"));
    hideSubmission("u-1", row("r-2"));
    unhideAllSubmissions("u-1");
    expect(readHidden("u-1")).toEqual({});
  });

  it("never hides a record whose originals are still waiting to be backed up", () => {
    const owed = row("r-3", { original_backup: { status: "ORIGINAL_PENDING" } });
    const failed = row("r-4", { original_backup: { status: "ORIGINAL_FAILED" } });
    const backedUp = row("r-5", { original_backup: { status: "ORIGINAL_BACKED_UP" } });
    expect(canHideRow(owed)).toBe(false);
    expect(canHideRow(failed)).toBe(false);
    expect(canHideRow(backedUp)).toBe(true);

    hideSubmission("u-1", owed);
    hideSubmission("u-1", failed);
    expect(readHidden("u-1")).toEqual({});
  });

  it("drops entries whose record has left the history window", () => {
    const now = new Date("2026-10-09T00:00:00Z");
    const map = {
      "MATERIAL_RECEIPT:old": { at: "2026-10-08T00:00:00Z", submittedAt: "2026-03-01T00:00:00Z" },
      "MATERIAL_RECEIPT:new": { at: "2026-10-08T00:00:00Z", submittedAt: "2026-09-01T00:00:00Z" },
    };
    expect(Object.keys(prunedHidden(map, 180, now))).toEqual(["MATERIAL_RECEIPT:new"]);

    // The same on the phone's own clock.
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    localStorage.setItem(
      "mse-hidden-submissions:v1:u-1",
      JSON.stringify({
        "MATERIAL_RECEIPT:old": { at: daysAgo(1), submittedAt: daysAgo(200) },
        "MATERIAL_RECEIPT:new": { at: daysAgo(1), submittedAt: daysAgo(30) },
      }),
    );
    pruneHiddenSubmissions("u-1", 180);
    expect(Object.keys(readHidden("u-1"))).toEqual(["MATERIAL_RECEIPT:new"]);
  });

  it("reads a damaged list as empty instead of failing the screen", () => {
    localStorage.setItem("mse-hidden-submissions:v1:u-1", "{not json");
    expect(readHidden("u-1")).toEqual({});
  });
});
