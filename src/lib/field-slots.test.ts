import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  activateSlot,
  canDisableSlots,
  countDraftFiles,
  dropEmptySlots,
  emptyRegistry,
  formatSlotNumber,
  hasDraftContent,
  heldCount,
  isDraftEmpty,
  loadRegistry,
  openSlot,
  releaseUploaded,
  saveRegistry,
  setSlotsEnabled,
  settleSlot,
  slotDraftScope,
  type SlotRegistry,
} from "@/lib/field-slots";

/**
 * 挂号 as a queue ticket (D-259, T-376; reworked by D-279, T-400): the
 * customer's rules, one test each where the logic lives, and one guard that
 * every phone capture uses the same thing.
 *
 * Whether a draft is empty lives in the draft store; here a plain set of the
 * 挂号 numbers that hold something stands in for it.
 */
const at = new Date("2026-09-24T08:00:00Z");

function drafts(...holding: number[]) {
  const set = new Set(holding);
  return {
    isEmpty: (n: number) => !set.has(n),
    fill: (n: number) => void set.add(n),
    empty: (n: number) => void set.delete(n),
  };
}

function numbers(registry: SlotRegistry) {
  return registry.slots.map((slot) => slot.n);
}

/** Lorry 1 arrives → 【挂号】, photo; lorry 2 → 【挂号】, photo. */
function twoLorries() {
  const d = drafts();
  let registry = openSlot(emptyRegistry(), d.isEmpty, at);
  d.fill(registry.active);
  registry = openSlot(registry, d.isEmpty, at);
  d.fill(registry.active);
  return { registry, d };
}

describe("挂号 as a queue ticket (D-279)", () => {
  it("1. none held shows 0, and nothing is opened by itself", () => {
    const registry = emptyRegistry();
    expect(heldCount(registry)).toBe(0);
    expect(registry.active).toBe(0);
    expect(registry.slots).toEqual([]);
    // Letting go of an empty 挂号 goes back to 0 - nothing takes its place.
    const d = drafts();
    const opened = openSlot(registry, d.isEmpty, at);
    expect(heldCount(opened)).toBe(1);
    const swept = dropEmptySlots(opened, d.isEmpty);
    expect(heldCount(swept)).toBe(0);
    expect(swept.active).toBe(0);
  });

  it("2. 【挂号】 hands out 01, then 02, shown two digits", () => {
    const { registry } = twoLorries();
    expect(numbers(registry)).toEqual([1, 2]);
    expect(registry.active).toBe(2);
    expect(registry.slots.map((slot) => formatSlotNumber(slot.n))).toEqual(["01", "02"]);
    expect(formatSlotNumber(10)).toBe("10");
  });

  it("2. 01 gone and 02 still held → the next lorry is 03", () => {
    const { registry, d } = twoLorries();
    const after = openSlot(settleSlot(registry, 1, null, at), d.isEmpty, at);
    expect(numbers(after)).toEqual([2, 3]);
    expect(after.active).toBe(3);
  });

  it("2. once every 挂号 is gone the next one starts again at 01", () => {
    const { registry, d } = twoLorries();
    const cleared = settleSlot(settleSlot(registry, 1, null, at), 2, null, at);
    expect(heldCount(cleared)).toBe(0);
    d.empty(1);
    d.empty(2);
    const next = openSlot(cleared, d.isEmpty, at);
    expect(numbers(next)).toEqual([1]);
    expect(next.active).toBe(1);
  });

  it("2. a number handed out again never opens the old 挂号's draft", () => {
    const { registry, d } = twoLorries();
    const old = registry.slots[0];
    const cleared = settleSlot(settleSlot(registry, 1, null, at), 2, null, at);
    const reused = openSlot(cleared, d.isEmpty, new Date("2026-09-24T09:00:00Z")).slots[0];
    expect(reused.n).toBe(old.n);
    expect(slotDraftScope("material:new", reused)).not.toBe(slotDraftScope("material:new", old));
  });

  it("2. pressing 【挂号】 on an empty 挂号 stays on it, no second empty one", () => {
    const d = drafts();
    const once = openSlot(emptyRegistry(), d.isEmpty, at);
    const twice = openSlot(once, d.isEmpty, new Date("2026-09-24T08:05:00Z"));
    expect(numbers(twice)).toEqual([1]);
    expect(twice.active).toBe(1);
    // The same 挂号 and draft - not a fresh one swapped in under the same number.
    expect(twice).toEqual(once);
  });

  it("3. switch away from an empty 挂号 and it goes; back and forth is free", () => {
    const { registry, d } = twoLorries();
    // Worker opens 03 for a third lorry, takes nothing, taps 01.
    const three = openSlot(registry, d.isEmpty, at);
    expect(numbers(three)).toEqual([1, 2, 3]);
    const back = activateSlot(three, 1, d.isEmpty);
    expect(back.active).toBe(1);
    expect(numbers(back)).toEqual([1, 2]);
    expect(activateSlot(back, 2, d.isEmpty).active).toBe(2);
  });

  it("3. a 挂号 holding photos or anything typed is never dropped", () => {
    const { registry, d } = twoLorries();
    expect(dropEmptySlots(registry, d.isEmpty)).toBe(registry);
    expect(numbers(activateSlot(registry, 1, d.isEmpty))).toEqual([1, 2]);
    expect(numbers(openSlot(registry, d.isEmpty, at))).toEqual([1, 2, 3]);
  });

  it("3. a queued 挂号 stays, marked waiting, until the queue reports it uploaded", () => {
    const { registry, d } = twoLorries();
    let next = settleSlot(registry, 2, "material-receipt-job-abc", at);
    expect(next.slots.find((slot) => slot.n === 2)?.jobId).toBe("material-receipt-job-abc");
    expect(heldCount(next)).toBe(2);
    // Its draft was cleared on submission, yet switching and opening leave it.
    d.empty(2);
    next = openSlot(activateSlot(next, 1, d.isEmpty), d.isEmpty, at);
    expect(numbers(next)).toEqual([1, 2, 3]);
    // Waiting ones cannot be reopened for editing - the record is in the queue.
    expect(activateSlot(next, 2, d.isEmpty).active).not.toBe(2);
    next = releaseUploaded(next, "material-receipt-job-abc");
    expect(numbers(next)).toEqual([1, 3]);
  });

  it("3. uploaded → gone, and the worker is left on no 挂号 rather than another lorry's", () => {
    const { registry } = twoLorries();
    const after = settleSlot(registry, 2, null, at);
    expect(numbers(after)).toEqual([1]);
    expect(after.active).toBe(0);
  });

  it("4. 「使用挂号」 is on by default and will not go off while anything is held", () => {
    expect(emptyRegistry().enabled).toBe(true);
    const { registry, d } = twoLorries();
    expect(canDisableSlots(registry, d.isEmpty)).toBe(false);
    expect(setSlotsEnabled(registry, false, d.isEmpty)).toBe(registry);
    // Queued with an emptied draft still counts as held.
    d.empty(1);
    d.empty(2);
    const queued = settleSlot(registry, 2, "job-2", at);
    expect(canDisableSlots(queued, d.isEmpty)).toBe(false);
    expect(setSlotsEnabled(queued, false, d.isEmpty).enabled).toBe(true);
  });

  it("4. off when nothing is held; back on starts with 0 held", () => {
    const d = drafts();
    const opened = openSlot(emptyRegistry(), d.isEmpty, at);
    const off = setSlotsEnabled(opened, false, d.isEmpty);
    expect(off).toEqual({ enabled: false, active: 0, slots: [] });
    expect(openSlot(off, d.isEmpty, at)).toBe(off);
    const on = setSlotsEnabled(off, true, d.isEmpty);
    expect(on.enabled).toBe(true);
    expect(heldCount(on)).toBe(0);
  });

  it("empty means known empty: nothing typed, no photo, and the draft really read back", () => {
    const photo = new File(["x"], "a.jpg");
    expect(hasDraftContent({})).toBe(false);
    expect(hasDraftContent({ a: "", b: undefined, c: [null], d: {} })).toBe(false);
    expect(hasDraftContent({ a: [photo] })).toBe(true);
    expect(hasDraftContent({ a: "BKA 1234" })).toBe(true);
    expect(hasDraftContent({ a: 0 })).toBe(true);
    expect(hasDraftContent({ a: false })).toBe(true);
    expect(isDraftEmpty({ ready: true, status: "empty", values: {} })).toBe(true);
    expect(isDraftEmpty({ ready: false, status: "loading", values: {} })).toBe(false);
    // A failed read may be hiding a draft still on disk.
    expect(isDraftEmpty({ ready: true, status: "error", values: {} })).toBe(false);
  });

  it("counts photographs wherever the draft keeps them", () => {
    const photo = new File(["x"], "a.jpg");
    expect(countDraftFiles({ a: photo, b: [photo, undefined, photo], c: { d: photo }, e: "text" })).toBe(4);
  });
});

describe("the stored list", () => {
  function withStorage(run: () => void) {
    const data = new Map<string, string>();
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => void data.set(key, value),
      },
    });
    try {
      run();
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  }

  it("a list saved before T-400, with its `next` counter, still loads and numbers from what is held", () => {
    withStorage(() => {
      const old = { n: 3, createdAt: at.toISOString() };
      localStorage.setItem("mse-field-slots:v1:k", JSON.stringify({ next: 4, active: 3, slots: [old] }));
      const loaded = loadRegistry("k");
      expect(loaded).toEqual({ active: 3, enabled: true, slots: [old] });
      // An old 挂号 keeps the draft it already has.
      expect(slotDraftScope("material:new", loaded.slots[0])).toBe("material:new#挂号-3");
      expect(openSlot(loaded, drafts(3).isEmpty, at).active).toBe(4);
      // The old strip's self-opened, never-used 挂号 3 goes: 0 held, next is 01.
      const swept = dropEmptySlots(loaded, drafts().isEmpty);
      expect(heldCount(swept)).toBe(0);
      expect(openSlot(swept, drafts().isEmpty, at).active).toBe(1);
    });
  });

  it("the switch is kept per screen, and junk falls back to an empty list", () => {
    withStorage(() => {
      expect(saveRegistry("k", { active: 0, slots: [], enabled: false })).toBe(true);
      expect(loadRegistry("k").enabled).toBe(false);
      localStorage.setItem("mse-field-slots:v1:j", "null");
      expect(loadRegistry("j")).toEqual(emptyRegistry());
      expect(loadRegistry("missing")).toEqual(emptyRegistry());
    });
  });
});

function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("the four capture screens share the one 挂号 mechanism (D-260, 「不要分别做不同逻辑」)", () => {
  const panel = read("src/components/field-staff/field-records-panel.tsx");
  // 材料进场、设备进出场、建筑垃圾清运（工地清运）、废料出场（环保材料出场申请）.
  const held = ["material", "equipment", "disposal", "waste"];
  // Everything else keeps its single draft - still saved, just no 挂号 strip.
  // No "category": the phone's 「现场资料」 is gone (D-285).
  const single = ["progress", "outgoing", "safety", "consultant", "sundry"];

  for (const mode of held) {
    it(`${mode} is held in 挂号`, () => {
      expect(panel).toMatch(new RegExp("<FieldSlots scope=\\{`" + mode + ":"));
    });
  }

  for (const mode of single) {
    it(`${mode} keeps one draft and no 挂号`, () => {
      expect(panel).toMatch(new RegExp("<FieldDraft scope=\\{`" + mode + ":"));
      expect(panel).not.toMatch(new RegExp("<FieldSlots scope=\\{`" + mode + ":"));
    });
  }

  it("exactly those four, so a fifth cannot slip in unnoticed", () => {
    expect(panel.match(/<FieldSlots scope=/g)).toHaveLength(held.length);
  });

  it("a submission settles its 挂号 through the same clear every form already calls", () => {
    const draft = read("src/components/field-staff/field-draft.tsx");
    expect(draft).toMatch(/const settle = useContext\(SlotSettleContext\)/);
    expect(draft).toMatch(/clear\?\.\(\);\s*settle\?\.\(\);/);
  });

  it("nothing opens by itself and there is no delete button (D-279)", () => {
    const slots = read("src/components/field-staff/field-slots.tsx");
    const lib = read("src/lib/field-slots.ts");
    expect(lib).not.toMatch(/export function ensureActive/);
    expect(lib).not.toMatch(/removeEmptySlot/);
    expect(slots).not.toMatch(/Trash2|ensureActive|removeEmptySlot/);
    // No 挂号 active → no form, only the hint and 【挂号】.
    expect(slots).toMatch(/\) : activeSlot \? \([\s\S]*?\{children\}[\s\S]*?\) : \([\s\S]*?t\("none"\)[\s\S]*?onClick=\{open\}/);
  });

  it("「使用挂号」 off is one plain draft with no settle context", () => {
    const slots = read("src/components/field-staff/field-slots.tsx");
    expect(slots).toMatch(/\{!registry\.enabled \? \(\s*<FieldDraft scope=\{scope\}>\{children\}<\/FieldDraft>\s*\) : activeSlot/);
  });

  it("a queued record's 挂号 goes only when the queue no longer holds its job", () => {
    const slots = read("src/components/field-staff/field-slots.tsx");
    expect(slots).toMatch(/claimQueuedJob\(jobKinds\)/);
    expect(slots).toMatch(/if \(state\.waiting\)[\s\S]{0,120}else next = releaseUploaded/);
  });
});
