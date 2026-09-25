/**
 * 挂号 on the phone - several captures held open at once, numbered like a
 * queue ticket (D-259, T-376; reworked by D-279, T-400).
 *
 * The customer's own example: a lorry arrives, the worker presses 【挂号】 →
 * 挂号 01; a second lorry → 挂号 02. When one of them finishes unloading the
 * worker taps it again and carries on with the next photos. The rules, all of
 * them here or in `FieldSlots`:
 *
 *  1. the strip shows how many are held right now - 0 when there are none.
 *     Nothing opens by itself: a 挂号 exists only because 【挂号】 was pressed;
 *  2. 【挂号】 hands out max(held) + 1, so 01 gone and 02 still held → 03; only
 *     when none is held does the next one start again at 01. Pressing it while
 *     the current 挂号 is still empty keeps the worker on that one;
 *  3. there is no delete. A 挂号 goes when its record is uploaded - directly,
 *     or once the offline queue reports its job sent (queued ones stay, marked
 *     waiting). The one exception, so unused tickets do not pile up: a 挂号
 *     whose draft is completely empty goes when the worker switches away from
 *     it or opens another. One holding anything at all is never dropped;
 *  4. a per-screen switch 「使用挂号」, on by default. It will not turn off while
 *     any 挂号 holds something or is waiting to upload;
 *  5. one draft per 挂号, so photos never overwrite each other; survives
 *     closing the page, locking the phone and no signal (the drafts are in
 *     IndexedDB, this list in localStorage).
 *
 * Pure functions over a plain object, so the rules can be tested without a
 * browser; the component only renders and persists. Whether a draft is empty
 * lives in the draft store, so callers pass it in as `isEmpty(n)`.
 */

export interface FieldSlot {
  /** 挂号 number, shown to the worker padded to two digits. */
  n: number;
  createdAt: string;
  /**
   * Names this 挂号's draft. Numbers are reused once every 挂号 is gone, a
   * draft must never be: a new 挂号 01 must not open the photos of an old one
   * if the list was ever lost while its drafts were not. Absent on 挂号
   * created before T-400, which keep the draft they already have.
   */
  draft?: string;
  /** Set once the record went into the offline queue instead of uploading. */
  jobId?: string;
  queuedAt?: string;
}

export interface SlotRegistry {
  /** The 挂号 being worked on, or 0 for none. */
  active: number;
  slots: FieldSlot[];
  /** 「使用挂号」. Off: the screen is one plain form. */
  enabled: boolean;
}

export type SlotIsEmpty = (n: number) => boolean;

export function emptyRegistry(): SlotRegistry {
  return { active: 0, slots: [], enabled: true };
}

export function isQueued(slot: FieldSlot): boolean {
  return Boolean(slot.jobId);
}

/** How many 挂号 are held right now, the waiting-to-upload ones included. */
export function heldCount(registry: SlotRegistry): number {
  return registry.slots.length;
}

/** The number 【挂号】 hands out next: 1 when none is held, else one above the highest. */
export function nextSlotNumber(registry: SlotRegistry): number {
  return registry.slots.reduce((highest, slot) => Math.max(highest, slot.n), 0) + 1;
}

/** 「挂号 01」, 「挂号 02」 … 「挂号 10」. */
export function formatSlotNumber(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Drop every 挂号 whose draft is completely empty, except `keep`.
 *
 * Never a queued one - its record is in the offline queue, and the 挂号 is
 * how the worker sees it is still waiting.
 */
export function dropEmptySlots(registry: SlotRegistry, isEmpty: SlotIsEmpty, keep = 0): SlotRegistry {
  const slots = registry.slots.filter((slot) => slot.n === keep || isQueued(slot) || !isEmpty(slot.n));
  if (slots.length === registry.slots.length) return registry;
  const active = slots.some((slot) => slot.n === registry.active) ? registry.active : 0;
  return { ...registry, slots, active };
}

/**
 * 【挂号】: open the next number and work on it.
 *
 * The 挂号 being worked on is still empty → stay on it, do not hand out
 * another. Otherwise any empty ones left over are dropped first, so the new
 * number counts only the 挂号 really held.
 */
export function openSlot(registry: SlotRegistry, isEmpty: SlotIsEmpty, now = new Date()): SlotRegistry {
  if (!registry.enabled) return registry;
  const current = registry.slots.find((slot) => slot.n === registry.active && !isQueued(slot));
  if (current && isEmpty(current.n)) return dropEmptySlots(registry, isEmpty, current.n);
  const held = dropEmptySlots(registry, isEmpty);
  const n = nextSlotNumber(held);
  const createdAt = now.toISOString();
  return {
    ...held,
    active: n,
    slots: [...held.slots, { n, createdAt, draft: `${n}-${now.getTime()}` }],
  };
}

/**
 * Switch to another 挂号. A queued one cannot be edited, so it is not
 * activated. The one left behind goes if nothing was put in it.
 */
export function activateSlot(registry: SlotRegistry, n: number, isEmpty: SlotIsEmpty): SlotRegistry {
  const slot = registry.slots.find((entry) => entry.n === n);
  if (!slot || isQueued(slot)) return registry;
  return dropEmptySlots({ ...registry, active: n }, isEmpty, n);
}

/**
 * The record from one 挂号 was accepted.
 *
 * `jobId` null: uploaded - the 挂号 is done and goes. A job id: it went into
 * the offline queue - the 挂号 stays, marked waiting. Either way the worker is
 * left on no 挂号: the next lorry starts with 【挂号】 or by tapping a held one,
 * never by landing in some other lorry's draft unasked.
 */
export function settleSlot(
  registry: SlotRegistry,
  n: number,
  jobId: string | null,
  now = new Date(),
): SlotRegistry {
  const slots = jobId
    ? registry.slots.map((slot) =>
        slot.n === n ? { ...slot, jobId, queuedAt: now.toISOString() } : slot,
      )
    : registry.slots.filter((slot) => slot.n !== n);
  return { ...registry, slots, active: registry.active === n ? 0 : registry.active };
}

/** The queue reports this job gone: it was uploaded, so its 挂号 goes too. */
export function releaseUploaded(registry: SlotRegistry, jobId: string): SlotRegistry {
  const slots = registry.slots.filter((slot) => slot.jobId !== jobId);
  if (slots.length === registry.slots.length) return registry;
  return { ...registry, slots };
}

/**
 * Whether 「使用挂号」 may be turned off: only when no 挂号 holds anything
 * and none is waiting to upload, because off means one plain form and the
 * 挂号 strip - the only way back to those drafts - is gone.
 */
export function canDisableSlots(registry: SlotRegistry, isEmpty: SlotIsEmpty): boolean {
  return registry.slots.every((slot) => !isQueued(slot) && isEmpty(slot.n));
}

/**
 * Turn 「使用挂号」 on or off. Refused (unchanged) when turning off is not
 * allowed. Either way the list starts from nothing: off leaves only empty
 * drafts behind, and on starts with 0 held.
 */
export function setSlotsEnabled(registry: SlotRegistry, enabled: boolean, isEmpty: SlotIsEmpty): SlotRegistry {
  if (registry.enabled === enabled) return registry;
  if (!enabled && !canDisableSlots(registry, isEmpty)) return registry;
  return { active: 0, slots: [], enabled };
}

/** How many photographs a draft holds, wherever in its values they sit. */
export function countDraftFiles(value: unknown): number {
  if (typeof File !== "undefined" && value instanceof File) return 1;
  if (Array.isArray(value)) return value.reduce((sum: number, entry) => sum + countDraftFiles(entry), 0);
  if (value && typeof value === "object") {
    return Object.values(value).reduce((sum: number, entry) => sum + countDraftFiles(entry), 0);
  }
  return 0;
}

/**
 * Whether a draft value holds anything the worker put there.
 *
 * Only nothing counts as nothing: `undefined`, `null`, `""` and containers of
 * those. A number, a boolean, any other text or any photo is content, so a
 * draft holding one is never dropped.
 */
export function hasDraftContent(value: unknown): boolean {
  if (typeof File !== "undefined" && value instanceof File) return true;
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.some(hasDraftContent);
  if (typeof value === "object") return Object.values(value).some(hasDraftContent);
  return true;
}

/**
 * Whether a draft is known to be completely empty.
 *
 * Not loaded yet, or failed to load, is not "empty": the draft may be sitting
 * on disk unread, and dropping its 挂号 would lose it.
 */
export function isDraftEmpty(snapshot: { ready: boolean; status: string; values: Record<string, unknown> }): boolean {
  return snapshot.ready && snapshot.status !== "loading" && snapshot.status !== "error" && !hasDraftContent(snapshot.values);
}

export function slotDraftScope(scope: string, slot: Pick<FieldSlot, "n" | "draft">): string {
  return `${scope}#挂号-${slot.draft ?? slot.n}`;
}

const PREFIX = "mse-field-slots:v1:";

/**
 * Read the list back. Also reads lists written before T-400, which carried a
 * `next` counter: it is ignored, numbering now comes from what is held.
 */
export function loadRegistry(key: string): SlotRegistry {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return emptyRegistry();
    const parsed = JSON.parse(raw) as Partial<SlotRegistry> | null;
    if (!parsed || !Array.isArray(parsed.slots)) return emptyRegistry();
    const slots = parsed.slots.filter(
      (slot): slot is FieldSlot => Boolean(slot) && Number.isInteger(slot.n) && slot.n > 0,
    );
    const active = typeof parsed.active === "number" && slots.some((slot) => slot.n === parsed.active) ? parsed.active : 0;
    return { active, slots, enabled: parsed.enabled !== false };
  } catch {
    return emptyRegistry();
  }
}

/** False when this browser will not store it (private window, blocked storage). */
export function saveRegistry(key: string, registry: SlotRegistry): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(registry));
    return true;
  } catch {
    return false;
  }
}
