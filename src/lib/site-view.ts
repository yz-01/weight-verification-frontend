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

/**
 * The padding that makes a fence fill `fill` of the map (JB222-2, 客户 11-19:
 * 「让整个工地占据地图约80%的空间」): a tenth of the map's width on the left
 * and right and of its height above and below, for 0.8. Leaflet applies it to
 * both sides of each axis.
 */
export function sitePadding(width: number, height: number, fill: number): [number, number] {
  const share = (1 - Math.min(1, Math.max(0, fill))) / 2;
  return [Math.round(width * share), Math.round(height * share)];
}

/** Metres between two points - near enough for a few hundred metres of site. */
export function metresApart(a: LatLng, b: LatLng): number {
  const middle = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  const dLat = (a[0] - b[0]) * METRES_PER_DEGREE;
  const dLng = (a[1] - b[1]) * METRES_PER_DEGREE * Math.cos(middle);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * Points of one layer that stand within `metres` of each other, as one group
 * (JB222, D8): thirty deliveries recorded at the gate are one icon with 30 on
 * it, not thirty icons hiding each other. Each group stands at its first
 * point; the order of `items` is kept inside each group and between groups.
 */
export function groupNearby<T>(
  items: T[],
  place: (item: T) => LatLng,
  metres = 8,
): Array<{ at: LatLng; items: T[] }> {
  const groups: Array<{ at: LatLng; items: T[] }> = [];
  for (const item of items) {
    const point = place(item);
    if (!valid(point)) continue;
    const near = groups.find((group) => metresApart(group.at, point) <= metres);
    if (near) near.items.push(item);
    else groups.push({ at: point, items: [item] });
  }
  return groups;
}

/** A point on the screen, in pixels (a map's `project` at its zoom). */
export interface ScreenPoint {
  x: number;
  y: number;
}

/** Icons whose centres are closer than this (px) sit on each other (JB240): an icon is 30 px, its time under it. */
export const ICON_CLASH_PX = 36;
/** How far apart (px) the icons of one pile stand once spread (JB240). */
export const ICON_SPREAD_PX = 46;

/**
 * Icons that would sit on each other at this zoom, set apart (JB240, 客户 11-23
 * 事项 12: 「请检查地图上的人员、材料卸货、机械设备及现场记录图标，避免全部挤在
 * 一起，影响查看。」).
 *
 * - A pile is every icon reached through neighbours closer than `clash`, of
 *   any layer: a worker, a delivery and a machine at the gate are one pile.
 * - Up to eight icons stand on a ring round the pile's middle, `gap` apart
 *   (two: left and right, so the times under them do not meet); more stand
 *   on a spiral whose turns are `gap` apart.
 * - An icon on its own keeps its place. The order of `points` is kept, so a
 *   pile spreads the same way on every refresh.
 *
 * Pixels, not metres: zooming in spreads the icons by itself, so the piles
 * are worked out again at every zoom and fewer icons are moved the closer
 * one looks.
 */
export function spreadPiles(
  points: readonly ScreenPoint[],
  clash: number = ICON_CLASH_PX,
  gap: number = ICON_SPREAD_PX,
): ScreenPoint[] {
  const parent = points.map((_, index) => index);
  const root = (index: number): number => {
    let at = index;
    while (parent[at] !== at) {
      parent[at] = parent[parent[at]];
      at = parent[at];
    }
    return at;
  };
  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) {
      if (Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y) < clash) {
        const ra = root(a);
        const rb = root(b);
        if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
      }
    }
  }
  const piles = new Map<number, number[]>();
  points.forEach((_, index) => {
    const key = root(index);
    piles.set(key, [...(piles.get(key) ?? []), index]);
  });

  const placed = points.map((point) => ({ x: point.x, y: point.y }));
  for (const members of piles.values()) {
    const count = members.length;
    if (count < 2) continue;
    const middle = {
      x: members.reduce((sum, index) => sum + points[index].x, 0) / count,
      y: members.reduce((sum, index) => sum + points[index].y, 0) / count,
    };
    if (count <= 8) {
      // Neighbours on the ring stand `gap` apart (chord = 2r·sin(π/k)).
      const radius = gap / (2 * Math.sin(Math.PI / count));
      members.forEach((index, order) => {
        const angle = Math.PI + (2 * Math.PI * order) / count;
        placed[index] = { x: middle.x + radius * Math.cos(angle), y: middle.y + radius * Math.sin(angle) };
      });
    } else {
      // An Archimedean spiral: r = gap + gap·θ/2π, one icon every `gap` along it.
      let theta = 0;
      members.forEach((index) => {
        const radius = gap + (gap * theta) / (2 * Math.PI);
        placed[index] = { x: middle.x + radius * Math.cos(theta), y: middle.y + radius * Math.sin(theta) };
        theta += gap / radius;
      });
    }
  }
  return placed;
}
