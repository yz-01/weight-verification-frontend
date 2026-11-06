/**
 * A site's map stays on the site (JB111, 客户 11-06 第二轮事项 1):
 *
 * 「地图打开时，整个图框必须完整显示已设定的工地电子围栏范围。允许放大、缩小，
 * 但只能在工地范围内查看。地图不能随意拖动到工地范围以外。不允许因为误触或缩小
 * 地图，看到其他地区、其他城市甚至整个世界地图。编辑电子围栏时可以调整边界，但
 * 地图查看范围仍须受到限制。」
 *
 * So a map about one site may only be dragged and zoomed out as far as the box
 * from `siteViewBox`: the fence plus a margin.
 *
 * - The margin is there so a fence can still be made bigger while it is being
 *   edited. It is half the fence's size, never less than `SITE_MARGIN_M`, and
 *   it is worked out again from the fence as it is drawn.
 * - A place with no fence yet (a new project with only its location) gets
 *   `SITE_ALONE_M` around it, room to draw the boundary in.
 * - A new project with no place at all has no site to keep to yet. It is
 *   kept to Malaysia (`MALAYSIA_BOX`), where the reader still has to find the
 *   site, but never the whole world.
 *
 * The box sums are kept free of Leaflet so they are tested on their own
 * (`site-view.test.ts`). `lockMapToBox` applies one to a Leaflet map.
 */

export type LatLng = [number, number];
export type Box = [LatLng, LatLng];

/** The least room around a fence, so it can still be made a little bigger. */
export const SITE_MARGIN_M = 300;
/** Room around a site's place before its boundary is drawn. */
export const SITE_ALONE_M = 1000;
/** Peninsular Malaysia, Sabah and Sarawak, with a little sea around them. */
export const MALAYSIA_BOX: Box = [
  [0.6, 99.4],
  [7.6, 119.6],
];

const METRES_PER_DEGREE = 111_320;

export interface SiteShape {
  /** A drawn boundary (or a dashed extra fence). */
  points?: LatLng[];
  /** A round fence's centre, or the site's place. */
  center?: LatLng;
  /** A round fence's radius; 0 or missing for a place with no circle. */
  radiusM?: number | null;
}

function valid(point: LatLng | undefined): point is LatLng {
  return Boolean(
    point &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]) &&
      Math.abs(point[0]) <= 90 &&
      Math.abs(point[1]) <= 180 &&
      !(point[0] === 0 && point[1] === 0),
  );
}

/**
 * The box a map about these fences may show, or `null` when there is nothing
 * to keep it to.
 */
export function siteViewBox(shapes: SiteShape[]): Box | null {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  let fenced = false;
  const take = (lat: number, lng: number) => {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  };
  for (const shape of shapes) {
    const points = (shape.points ?? []).filter(valid);
    if (points.length > 0) {
      points.forEach(([lat, lng]) => take(lat, lng));
      if (points.length >= 2) fenced = true;
    }
    if (valid(shape.center)) {
      const [lat, lng] = shape.center;
      const radius = shape.radiusM && shape.radiusM > 0 ? shape.radiusM : 0;
      if (radius > 0) {
        const dLat = radius / METRES_PER_DEGREE;
        const dLng = radius / (METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180));
        take(lat - dLat, lng - dLng);
        take(lat + dLat, lng + dLng);
        fenced = true;
      } else {
        take(lat, lng);
      }
    }
  }
  if (!Number.isFinite(south)) return null;

  const middle = (south + north) / 2;
  const metresPerLng = METRES_PER_DEGREE * Math.cos((middle * Math.PI) / 180);
  const heightM = (north - south) * METRES_PER_DEGREE;
  const widthM = (east - west) * metresPerLng;
  const margin = fenced ? Math.max(SITE_MARGIN_M, Math.max(heightM, widthM) / 2) : SITE_ALONE_M;
  const dLat = margin / METRES_PER_DEGREE;
  const dLng = margin / metresPerLng;
  return [
    [south - dLat, west - dLng],
    [north + dLat, east + dLng],
  ];
}

/** Whether a point lies in a box - what the map may show. */
export function boxHolds(box: Box, point: LatLng): boolean {
  return (
    point[0] >= box[0][0] && point[0] <= box[1][0] && point[1] >= box[0][1] && point[1] <= box[1][1]
  );
}

type LeafletMap = import("leaflet").Map;
type Leaflet = typeof import("leaflet");

/**
 * Keeps a Leaflet map inside a box: it cannot be dragged out of it, and cannot
 * be zoomed out further than the whole box. `null` lets it go again. Called
 * again whenever the box or the map's size changes, since how far out "the
 * whole box" is depends on both.
 */
export function lockMapToBox(map: LeafletMap, L: Leaflet, box: Box | null): void {
  if (!box) {
    map.setMaxBounds(L.latLngBounds([]));
    map.setMinZoom(0);
    return;
  }
  const bounds = L.latLngBounds(box);
  map.options.maxBoundsViscosity = 1;
  map.setMaxBounds(bounds);
  // A map in a dialog still opening has no size yet; its resize calls again.
  const size = map.getSize();
  if (size.x === 0 || size.y === 0) return;
  map.setMinZoom(Math.min(map.getBoundsZoom(bounds, false), map.getMaxZoom()));
}
