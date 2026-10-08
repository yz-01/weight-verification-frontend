/**
 * The design's data colours for the maps.
 *
 * Leaflet writes a path's colour into an SVG attribute, and an SVG attribute
 * cannot read a CSS variable, so the maps take their colours from here as
 * literal values instead of from `globals.css`. They are the light-mode
 * `--chart-1…8` values (the same order as `lib/tones`): dark enough to read
 * on the street map in light mode, and still clear on the night-coloured map
 * in dark mode. If the palette in `globals.css` changes, change it here too.
 */
export const MAP_COLORS = [
  "#0891b2", // cyan, primary
  "#2563eb", // blue, materials
  "#7c3aed", // purple, equipment
  "#059669", // green, done
  "#d97706", // amber, to do
  "#e11d48", // rose, overdue
  "#ea580c", // orange
  "#64748b", // slate
] as const;

/** The primary map colour: a project's own boundary, a geofence being drawn. */
export const MAP_PRIMARY = MAP_COLORS[0];

/** The colour for item `index` of a series, cycling through the palette. */
export function mapColor(index: number): string {
  return MAP_COLORS[index % MAP_COLORS.length];
}
