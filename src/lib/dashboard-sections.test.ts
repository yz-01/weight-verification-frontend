import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseOpenSections,
  readOpenSectionsRaw,
  setSectionOpen,
  subscribeOpenSections,
} from "@/lib/dashboard-sections";

/** A browser window with a working (or refusing) localStorage. */
function fakeWindow(refuse = false) {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => {
      if (refuse) throw new Error("blocked");
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (refuse) throw new Error("blocked");
      store.set(key, value);
    },
  };
  return Object.assign(new EventTarget(), { localStorage: storage });
}

describe("remembered dashboard sections (F7)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", fakeWindow());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with every section collapsed", () => {
    expect(parseOpenSections(readOpenSectionsRaw("u1")).size).toBe(0);
  });

  it("remembers what one viewer opened, and only for them", () => {
    setSectionOpen("u1", "safety", true);
    setSectionOpen("u1", "schedule", true);
    setSectionOpen("u1", "schedule", false);
    expect([...parseOpenSections(readOpenSectionsRaw("u1"))]).toEqual(["safety"]);
    expect(parseOpenSections(readOpenSectionsRaw("u2")).size).toBe(0);
  });

  it("tells the page when the choice changes", () => {
    const seen = vi.fn();
    const stop = subscribeOpenSections(seen);
    setSectionOpen("u1", "map", true);
    stop();
    setSectionOpen("u1", "map", false);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("still opens a section when the browser refuses storage", () => {
    vi.stubGlobal("window", fakeWindow(true));
    expect(readOpenSectionsRaw("u3")).toBe("");
    expect(() => setSectionOpen("u3", "timeline", true)).not.toThrow();
    expect([...parseOpenSections(readOpenSectionsRaw("u3"))]).toEqual(["timeline"]);
  });

  it("reads a damaged value as nothing opened", () => {
    expect(parseOpenSections("{not json").size).toBe(0);
    expect(parseOpenSections('{"a":1}').size).toBe(0);
    expect([...parseOpenSections('["a", 2]')]).toEqual(["a"]);
  });
});
