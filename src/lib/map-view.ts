/**
 * What a map may do by itself, and what a click on the geofence map does
 * (I7, ID23). The client: 「设定好电子围栏地图就不要被动了，这时候还可以把这个
 * 地图框架放大到整个页面」.
 *
 * - A saved geofence is only looked at until 「编辑围栏」 is switched on; a
 *   click on the map then edits it, and saving switches it off again.
 * - The map never moves or re-fits by itself: only when it first opens and
 *   when the reader presses 「回到围栏」. Dragging and zooming stay the
 *   reader's.
 * - Any map can fill the screen: the browser's own full screen where the page
 *   may have it, else an overlay over the whole window.
 *
 * Kept free of Leaflet and the DOM so the rules are tested on their own
 * (`map-view.test.ts`).
 */

export type GeofenceShape = "CIRCLE" | "POLYGON";

/**
 * What a click on the geofence map does: moves the circle's centre, adds a
 * polygon point (while drawing), or nothing - always nothing while the
 * 「编辑围栏」 switch is off.
 */
export function geofenceClick(
  shape: GeofenceShape,
  editing: boolean,
  drawing: boolean,
): "center" | "point" | "none" {
  if (!editing) return "none";
  if (shape === "CIRCLE") return "center";
  return drawing ? "point" : "none";
}

/** Whether a polygon's numbered points can be dragged: only while editing. */
export function pointsDraggable(editing: boolean, drawing: boolean): boolean {
  return editing && drawing;
}

/**
 * How long after opening the map still fits itself to the fence when its box
 * changes size - the dialog it sits in animates open and settles its width.
 * After that, or once the reader has touched the map, a resize keeps the view.
 */
export const SETTLE_MS = 600;

export function fitsOnResize(touched: boolean, sinceOpenMs: number, settleMs = SETTLE_MS): boolean {
  return !touched && sinceOpenMs < settleMs;
}

/** How a map fills the screen. */
export type FullscreenMode = "native" | "overlay";

/**
 * The browser's own full screen when this element can have it (Fullscreen
 * API, or Safari's prefixed one); otherwise - an iPhone gives it only to
 * video - an overlay over the whole window.
 */
export function fullscreenMode(
  element: { requestFullscreen?: unknown; webkitRequestFullscreen?: unknown } | null | undefined,
  doc: { fullscreenEnabled?: boolean; webkitFullscreenEnabled?: boolean } | null | undefined,
): FullscreenMode {
  if (!element || !doc) return "overlay";
  const native =
    (typeof element.requestFullscreen === "function" && doc.fullscreenEnabled === true) ||
    (typeof element.webkitRequestFullscreen === "function" && doc.webkitFullscreenEnabled === true);
  return native ? "native" : "overlay";
}
