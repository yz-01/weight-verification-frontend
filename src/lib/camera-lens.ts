/**
 * The in-app camera's 「广角」 (wide-angle) switch (J45, Lucas 2026-10-22).
 *
 * The photo is the square at the centre of the frame, so a worker who cannot
 * fit a whole truck in may want the phone's wide lens. Lucas: never forced -
 * a small switch the worker turns on, off by default (normal 1x), remembered
 * on that phone; no switch at all on a phone without a wide lens. The camera
 * is never zoomed in digitally: normal is 1x (or the lens's own minimum when
 * that is above 1), wide is the lens's minimum zoom.
 *
 * A phone offers a wide lens in one of two ways:
 *
 * * `zoom` in the track's capabilities going below 1 (many Androids: 0.5x /
 *   0.6x on the same camera) - switched with `applyConstraints`, no restart;
 * * a separate camera device labelled ultra-wide (an iPhone's "Back Ultra
 *   Wide Camera") - switched by opening that device instead.
 */

export interface ZoomRange {
  min: number;
  max: number;
}

export type WideLens =
  | { kind: "zoom"; min: number; normal: number }
  | { kind: "device"; deviceId: string };

/** The track's zoom range, or `null` when it has none (or cannot say). */
export function zoomRange(track: Pick<MediaStreamTrack, "getCapabilities"> | null | undefined): ZoomRange | null {
  try {
    const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: { min?: number; max?: number } }) | undefined;
    const zoom = caps?.zoom;
    if (!zoom || typeof zoom.min !== "number" || typeof zoom.max !== "number") return null;
    if (!(zoom.min > 0) || !(zoom.max >= zoom.min)) return null;
    return { min: zoom.min, max: zoom.max };
  } catch {
    return null;
  }
}

/** The zoom for normal: 1x, or as close as the lens goes - never above 1 unless the lens's own minimum is. */
export function normalZoom(range: ZoomRange): number {
  return Math.min(Math.max(1, range.min), range.max);
}

/** A separate ultra-wide camera device, found by its label. */
const ULTRA_WIDE_LABEL = /ultra[\s-]?wide|超广角|超廣角/i;

export function ultraWideDevice(devices: readonly Pick<MediaDeviceInfo, "kind" | "label" | "deviceId">[]): string | null {
  const found = devices.find(
    (device) => device.kind === "videoinput" && device.deviceId && ULTRA_WIDE_LABEL.test(device.label),
  );
  return found?.deviceId ?? null;
}

/**
 * The wide lens this phone offers, if any: the zoom range first (one camera,
 * switched in place), else an ultra-wide device. `null` - no switch shown.
 */
export function findWideLens(
  range: ZoomRange | null,
  devices: readonly Pick<MediaDeviceInfo, "kind" | "label" | "deviceId">[],
): WideLens | null {
  if (range && range.min < 1) return { kind: "zoom", min: range.min, normal: normalZoom(range) };
  const deviceId = ultraWideDevice(devices);
  return deviceId ? { kind: "device", deviceId } : null;
}

/** The zoom to set for the switch's position, for a zoom-type wide lens. */
export function zoomFor(lens: Extract<WideLens, { kind: "zoom" }>, wide: boolean): number {
  return wide ? lens.min : lens.normal;
}

/** Set the track's zoom; false when the phone refuses (the photo still works). */
export async function applyZoom(track: Pick<MediaStreamTrack, "applyConstraints"> | null | undefined, zoom: number): Promise<boolean> {
  if (!track?.applyConstraints) return false;
  try {
    await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] });
    return true;
  } catch {
    return false;
  }
}

/** Where the worker's choice is remembered on this phone. */
export const WIDE_PREFERENCE_KEY = "mse.fieldCamera.wide";

/** The remembered choice: off unless the worker turned it on here. */
export function readWidePreference(): boolean {
  try {
    return globalThis.localStorage?.getItem(WIDE_PREFERENCE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeWidePreference(wide: boolean): void {
  try {
    globalThis.localStorage?.setItem(WIDE_PREFERENCE_KEY, wide ? "1" : "0");
  } catch {
    // Private mode or blocked storage: the switch still works for this shot.
  }
}
