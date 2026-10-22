import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyZoom,
  findWideLens,
  normalZoom,
  readWidePreference,
  ultraWideDevice,
  WIDE_PREFERENCE_KEY,
  writeWidePreference,
  zoomFor,
  zoomRange,
} from "@/lib/camera-lens";

/** J45: the 「广角」 switch - offered only with a wide lens, off by default, never zoomed in. */

const track = (zoom?: { min?: number; max?: number }) =>
  ({ getCapabilities: () => (zoom ? { zoom } : {}) }) as unknown as MediaStreamTrack;

const device = (label: string, deviceId = label, kind: MediaDeviceKind = "videoinput") =>
  ({ kind, label, deviceId }) as MediaDeviceInfo;

afterEach(() => vi.unstubAllGlobals());

describe("zoomRange", () => {
  it("reads the track's zoom capability", () => {
    expect(zoomRange(track({ min: 0.5, max: 10 }))).toEqual({ min: 0.5, max: 10 });
  });

  it("is null without one, or when the browser cannot say", () => {
    expect(zoomRange(track())).toBeNull();
    expect(zoomRange(track({ min: 1 }))).toBeNull();
    expect(zoomRange({} as MediaStreamTrack)).toBeNull();
    expect(zoomRange(null)).toBeNull();
    const throwing = { getCapabilities: () => { throw new Error("nope"); } } as unknown as MediaStreamTrack;
    expect(zoomRange(throwing)).toBeNull();
  });
});

describe("findWideLens", () => {
  it("offers no switch on a phone without a wide lens", () => {
    expect(findWideLens(null, [])).toBeNull();
    // A zoom that only goes in is not a wide lens.
    expect(findWideLens({ min: 1, max: 8 }, [device("Back Camera")])).toBeNull();
    expect(findWideLens(null, [device("camera2 0, facing back"), device("camera2 1, facing front")])).toBeNull();
  });

  it("offers the zoom when it goes below 1x (Android 0.5x / 0.6x)", () => {
    expect(findWideLens({ min: 0.6, max: 10 }, [])).toEqual({ kind: "zoom", min: 0.6, normal: 1 });
  });

  it("offers a separate ultra-wide camera (iPhone)", () => {
    const devices = [device("Back Camera", "a"), device("Back Ultra Wide Camera", "uw"), device("Mic", "m", "audioinput")];
    expect(ultraWideDevice(devices)).toBe("uw");
    expect(findWideLens({ min: 1, max: 5 }, devices)).toEqual({ kind: "device", deviceId: "uw" });
  });

  it("prefers the zoom, which switches without reopening the camera", () => {
    expect(findWideLens({ min: 0.5, max: 10 }, [device("Back Ultra Wide Camera", "uw")])?.kind).toBe("zoom");
  });
});

describe("zoomFor - never zoomed in", () => {
  const lens = { kind: "zoom" as const, min: 0.5, normal: 1 };

  it("wide is the lens's minimum, normal is back to 1x", () => {
    expect(zoomFor(lens, true)).toBe(0.5);
    expect(zoomFor(lens, false)).toBe(1);
  });

  it("normal never goes above 1x unless the lens itself starts higher", () => {
    expect(normalZoom({ min: 0.5, max: 10 })).toBe(1);
    expect(normalZoom({ min: 0.5, max: 0.8 })).toBe(0.8);
    expect(normalZoom({ min: 1.2, max: 4 })).toBe(1.2);
  });
});

describe("applyZoom", () => {
  it("sets the zoom on the track", async () => {
    const applyConstraints = vi.fn(async () => undefined);
    expect(await applyZoom({ applyConstraints } as unknown as MediaStreamTrack, 0.5)).toBe(true);
    expect(applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 0.5 }] });
  });

  it("is harmless when the phone refuses", async () => {
    const applyConstraints = vi.fn(async () => {
      throw new Error("OverconstrainedError");
    });
    expect(await applyZoom({ applyConstraints } as unknown as MediaStreamTrack, 0.5)).toBe(false);
    expect(await applyZoom(null, 0.5)).toBe(false);
  });
});

describe("the remembered choice", () => {
  it("is off unless turned on, and kept on this phone", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    expect(readWidePreference()).toBe(false);
    writeWidePreference(true);
    expect(store.get(WIDE_PREFERENCE_KEY)).toBe("1");
    expect(readWidePreference()).toBe(true);
    writeWidePreference(false);
    expect(readWidePreference()).toBe(false);
  });

  it("survives blocked storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(readWidePreference()).toBe(false);
    expect(() => writeWidePreference(true)).not.toThrow();
  });
});
