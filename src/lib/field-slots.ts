/**
 * 挂号保留 - several captures held open at once on the phone (D-259, T-376).
 *
 * The customer's own example: a lorry arrives, one photo is taken → 挂号 1; a
 * second lorry → 挂号 2; a third → 挂号 3; and so on, as many as turn up. When
 * any of them finishes unloading the worker taps that 挂号 again and carries
 * on with the second, third, fourth photo. Six rules, all of them here or in
 * `FieldSlots`:
 *
 *  1. one 挂号 per vehicle, each its own draft - photos never overwrite;
 *  2. as many at once as needed;
 *  3. switch away and back at any time;
 *  4. survives switching module, closing the page, locking the phone,
 *     coming back later (the draft is in IndexedDB, this list in localStorage);
 *  5. survives no signal and failed uploads - a 挂号 whose record went into the
 *     offline queue stays on the list, marked waiting, holding the queue job's id;
 *  6. is cleared only when that record has really been uploaded.
 *
 * Pure functions over a plain object, so the rules can be tested without a
 * browser; the component only renders and persists.
 */

export interface FieldSlot {
  /** 挂号 number, shown to the worker. Never reused within one list. */
  n: number;
  createdAt: string;
  /** Set once the record went into the offline queue instead of uploading. */
  jobId?: string;
  queuedAt?: string;
}

export interface SlotRegistry {
  /** The next 挂号 number to hand out. Only ever goes up. */
  next: number;
  /** The 挂号 being worked on, or 0 for none. */
  active: number;
  slots: FieldSlot[];
}

export function emptyRegistry(): SlotRegistry {
  return { next: 1, active: 0, slots: [] };
}

export function isQueued(slot: FieldSlot): boolean {
  return Boolean(slot.jobId);
}

/** A new 挂号 at the end, made the active one. */
export function addSlot(registry: SlotRegistry, now = new Date()): SlotRegistry {
  const n = registry.next;
  return {
    next: n + 1,
    active: n,
    slots: [...registry.slots, { n, createdAt: now.toISOString() }],
  };
}

/** Switch to another 挂号. A queued one cannot be edited, so it is not activated. */
export function activateSlot(registry: SlotRegistry, n: number): SlotRegistry {
  const slot = registry.slots.find((entry) => entry.n === n);
  if (!slot || isQueued(slot)) return registry;
  return { ...registry, active: n };
}

/** Always leave the worker on an editable 挂号, opening 挂号 1 on first use. */
export function ensureActive(registry: SlotRegistry, now = new Date()): SlotRegistry {
  const current = registry.slots.find((slot) => slot.n === registry.active && !isQueued(slot));
  if (current) return registry;
  const open = registry.slots.find((slot) => !isQueued(slot));
  return open ? { ...registry, active: open.n } : addSlot(registry, now);
}

/**
 * The record from one 挂号 was accepted.
 *
 * `jobId` null: uploaded - the 挂号 is done and goes (rule 6). A job id: it
 * went into the offline queue - the 挂号 stays, marked waiting (rule 5).
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
  const next = { ...registry, slots, active: registry.active === n ? 0 : registry.active };
  const open = next.slots.find((slot) => !isQueued(slot));
  return { ...next, active: next.active || open?.n || 0 };
}

/** The queue reports this job gone: it was uploaded, so its 挂号 goes too. */
export function releaseUploaded(registry: SlotRegistry, jobId: string): SlotRegistry {
  return { ...registry, slots: registry.slots.filter((slot) => slot.jobId !== jobId) };
}

/**
 * Remove a 挂号 the worker opened and never used.
 *
 * Only an empty one: a 挂号 holding photographs is cleared by uploading it and
 * by nothing else (rule 6). The caller says whether it is empty, because that
 * lives in the draft store.
 */
export function removeEmptySlot(registry: SlotRegistry, n: number, isEmpty: boolean): SlotRegistry {
  const slot = registry.slots.find((entry) => entry.n === n);
  if (!slot || isQueued(slot) || !isEmpty) return registry;
  const slots = registry.slots.filter((entry) => entry.n !== n);
  return { ...registry, slots, active: registry.active === n ? 0 : registry.active };
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

export function slotDraftScope(scope: string, n: number): string {
  return `${scope}#挂号-${n}`;
}

const PREFIX = "mse-field-slots:v1:";

export function loadRegistry(key: string): SlotRegistry {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return emptyRegistry();
    const parsed = JSON.parse(raw) as SlotRegistry;
    if (!Array.isArray(parsed.slots) || typeof parsed.next !== "number") return emptyRegistry();
    return parsed;
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
