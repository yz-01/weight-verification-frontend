/**
 * One place decides which tile server every map on this platform draws from.
 *
 * Before this module the URL was typed out at each `L.tileLayer(...)` call, and
 * the two copies had already drifted apart — one used the deprecated
 * `{s}.tile.openstreetmap.org` subdomain form, the other the plain host. More
 * importantly both pointed at OpenStreetMap's own servers, whose Tile Usage
 * Policy does not cover a commercial product serving tiles to every contractor,
 * recycler and driver on the platform. Enforcement is a block at their end, and
 * it would blank every map for every role at the same moment: the driver's
 * position, the geofence editor, the site dashboards.
 *
 * The tile server is therefore configuration, not code. Switching providers is
 * an environment variable, and no component needs to be touched to do it.
 *
 * `process.env.NEXT_PUBLIC_*` is read through a literal member expression on
 * purpose: that is the only form Next.js substitutes at build time. A dynamic
 * lookup such as `process.env[name]` is left as-is and reads `undefined` in the
 * browser.
 */

import type { TileLayerOptions } from "leaflet";

/**
 * OSM's public tiles, kept only so `npm run dev` draws a map with no setup.
 * This is not a production answer — see the note above.
 */
const DEV_FALLBACK_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEV_FALLBACK_ATTRIBUTION = "&copy; OpenStreetMap contributors";

/** Raster tile template, `{z}/{x}/{y}`. Include the provider's key if it needs one. */
export const MAP_TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL || DEV_FALLBACK_URL;

/**
 * Shown in the map corner. Every provider requires its own credit line, so this
 * travels with the URL rather than being hardcoded next to it.
 */
export const MAP_TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || DEV_FALLBACK_ATTRIBUTION;

/** OSM stops at 19; most commercial providers serve 20-22. */
export const MAP_TILE_MAX_ZOOM =
  Number(process.env.NEXT_PUBLIC_MAP_TILE_MAX_ZOOM) || 19;

/**
 * True when no provider is configured and the OSM fallback is in use. Exported
 * so the condition is testable and greppable rather than implied.
 */
export const IS_USING_FALLBACK_TILES = MAP_TILE_URL === DEV_FALLBACK_URL;

/** Spread into `L.tileLayer(MAP_TILE_URL, { ...MAP_TILE_OPTIONS, ...ownTuning })`. */
export const MAP_TILE_OPTIONS: TileLayerOptions = {
  maxZoom: MAP_TILE_MAX_ZOOM,
  attribution: MAP_TILE_ATTRIBUTION,
};

let warned = false;

/**
 * Say so, once, when a production build is drawing from the fallback.
 *
 * The failure this guards against is silence: an unset variable looks exactly
 * like a working map until the day the tiles stop arriving. The same silence
 * kept sixteen backend variables out of the deployment for months.
 */
export function warnIfFallbackTiles(): void {
  if (warned) return;
  warned = true;
  if (!IS_USING_FALLBACK_TILES) return;
  if (process.env.NODE_ENV !== "production") return;
  console.warn(
    "[map] NEXT_PUBLIC_MAP_TILE_URL is not set, so maps are drawing from " +
      "OpenStreetMap's public tiles. That is outside their usage policy for " +
      "this product and can be blocked without notice. Configure a commercial " +
      "tile provider before serving real customers.",
  );
}
