import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The identity a field phone is linked by, and what happens when the browser
 * throws it away.
 *
 * A worker reported being told "this device is not linked to a field account"
 * after coming back to the app (2026-09-05). That message is true whenever the
 * device id in this browser has no binding on the server - and one of the ways
 * to reach it has nothing to do with the worker at all: a browser that does
 * not keep site data mints a fresh id on every visit, so the PIN can never
 * work and the screen gives no hint why.
 *
 * The module keeps state between calls, so every test loads it fresh.
 */

const KEY = "mse_field_device_id";

async function loadModule() {
  vi.resetModules();
  return import("./field-access.service");
}

function storage(overrides: Partial<Storage> = {}) {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
    ...overrides,
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal("crypto", {
    randomUUID: () => `id-${Math.random().toString(16).slice(2)}`,
    getRandomValues: (array: Uint8Array) => array,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the field device id", () => {
  it("is the same on the next visit", async () => {
    const store = storage();
    vi.stubGlobal("window", { localStorage: store });
    const { getOrCreateFieldDeviceId, fieldDeviceIdIsPersistent } =
      await loadModule();

    const first = getOrCreateFieldDeviceId();
    const second = getOrCreateFieldDeviceId();

    expect(second).toBe(first);
    expect(store.getItem(KEY)).toBe(first);
    expect(fieldDeviceIdIsPersistent()).toBe(true);
  });

  it("still returns an id when site data is blocked outright", async () => {
    // iOS Safari with Block All Cookies throws on access. Letting that
    // propagate took the whole sign-in down with a generic failure.
    vi.stubGlobal("window", {
      localStorage: storage({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    });
    const { getOrCreateFieldDeviceId, fieldDeviceIdIsPersistent } =
      await loadModule();

    expect(getOrCreateFieldDeviceId()).toMatch(/^id-/);
    expect(fieldDeviceIdIsPersistent()).toBe(false);
  });

  it("holds one id for the rest of the page when storage throws", async () => {
    vi.stubGlobal("window", {
      localStorage: storage({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    });
    const { getOrCreateFieldDeviceId } = await loadModule();

    expect(getOrCreateFieldDeviceId()).toBe(getOrCreateFieldDeviceId());
  });

  it("notices a browser that accepts the write and discards it", async () => {
    // The nastiest of the three: the write looks like it worked and the
    // failure only shows up on the next visit, as a device that will not link.
    vi.stubGlobal("window", {
      localStorage: storage({
        getItem: () => null,
        setItem: () => undefined,
      }),
    });
    const { getOrCreateFieldDeviceId, fieldDeviceIdIsPersistent } =
      await loadModule();

    getOrCreateFieldDeviceId();

    expect(fieldDeviceIdIsPersistent()).toBe(false);
  });
});
