import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  activateSlot,
  addSlot,
  countDraftFiles,
  emptyRegistry,
  ensureActive,
  releaseUploaded,
  removeEmptySlot,
  settleSlot,
  slotDraftScope,
} from "@/lib/field-slots";

/**
 * 挂号保留 (D-259, T-376): the customer's six rules, one test each where the
 * logic lives, and one guard that every phone capture uses the same thing.
 */
const at = new Date("2026-09-24T08:00:00Z");

function threeLorries() {
  // Lorry 1 arrives → 挂号 1; lorry 2 → 挂号 2; lorry 3 → 挂号 3.
  return addSlot(addSlot(ensureActive(emptyRegistry(), at), at), at);
}

describe("挂号保留 rules", () => {
  it("1. each 挂号 is its own draft - photos cannot overwrite each other", () => {
    const registry = threeLorries();
    const scopes = registry.slots.map((slot) => slotDraftScope("material:new", slot.n));
    expect(new Set(scopes).size).toBe(3);
    expect(registry.slots.map((slot) => slot.n)).toEqual([1, 2, 3]);
  });

  it("2. as many at once as turn up, numbers only go up", () => {
    let registry = ensureActive(emptyRegistry(), at);
    for (let i = 0; i < 9; i += 1) registry = addSlot(registry, at);
    expect(registry.slots).toHaveLength(10);
    // Uploading 挂号 2 does not hand its number to the next lorry.
    registry = addSlot(settleSlot(registry, 2, null, at), at);
    expect(registry.slots.map((slot) => slot.n)).not.toContain(2);
    expect(registry.slots.at(-1)?.n).toBe(11);
  });

  it("3. switch to another 挂号 and back at any time", () => {
    let registry = threeLorries();
    expect(registry.active).toBe(3);
    registry = activateSlot(registry, 1);
    expect(registry.active).toBe(1);
    registry = activateSlot(registry, 3);
    expect(registry.active).toBe(3);
  });

  it("5. a record that went into the offline queue keeps its 挂号, marked waiting", () => {
    const registry = settleSlot(threeLorries(), 2, "material-receipt-job-abc", at);
    const two = registry.slots.find((slot) => slot.n === 2);
    expect(two?.jobId).toBe("material-receipt-job-abc");
    // Waiting ones cannot be reopened for editing - the record is in the queue.
    expect(activateSlot(registry, 2).active).not.toBe(2);
  });

  it("6. cleared only when uploaded - directly, or when the queue reports its job gone", () => {
    let registry = settleSlot(threeLorries(), 1, null, at);
    expect(registry.slots.map((slot) => slot.n)).toEqual([2, 3]);
    registry = settleSlot(registry, 2, "job-2", at);
    expect(registry.slots.map((slot) => slot.n)).toEqual([2, 3]);
    registry = releaseUploaded(registry, "job-2");
    expect(registry.slots.map((slot) => slot.n)).toEqual([3]);
  });

  it("6. a 挂号 holding photos cannot be removed by hand, an empty one can", () => {
    const registry = threeLorries();
    expect(removeEmptySlot(registry, 2, false).slots).toHaveLength(3);
    expect(removeEmptySlot(registry, 2, true).slots).toHaveLength(2);
  });

  it("the worker is always left on an editable 挂号", () => {
    const registry = settleSlot(ensureActive(emptyRegistry(), at), 1, "job-1", at);
    const opened = ensureActive(registry, at);
    expect(opened.active).toBe(2);
    expect(opened.slots.find((slot) => slot.n === 1)?.jobId).toBe("job-1");
  });

  it("counts photographs wherever the draft keeps them", () => {
    const photo = new File(["x"], "a.jpg");
    expect(countDraftFiles({ a: photo, b: [photo, undefined, photo], c: { d: photo }, e: "text" })).toBe(4);
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
  const single = ["progress", "outgoing", "safety", "consultant", "category", "sundry"];

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

  it("a queued record's 挂号 goes only when the queue no longer holds its job", () => {
    const slots = read("src/components/field-staff/field-slots.tsx");
    expect(slots).toMatch(/claimQueuedJob\(jobKinds\)/);
    expect(slots).toMatch(/if \(state\.waiting\)[\s\S]{0,120}else next = releaseUploaded/);
  });
});
