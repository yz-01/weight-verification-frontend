/**
 * Splitting a driver's track where the phone stopped reporting.
 *
 * Browser geolocation only runs while the page is open and the screen is on.
 * A driver who pockets the phone for twenty minutes produces two clusters of
 * points with nothing between them — and a polyline drawn straight through
 * that hole is a lie: it claims the lorry travelled a road nobody recorded,
 * and it is the shortest line rather than the one actually driven.
 *
 * The product accepted that limit deliberately (D-020). What it cannot accept
 * is showing it as a normal route, because then a customer reads it as "the
 * GPS is wrong" rather than "nothing was recorded here" (R-019).
 *
 * So the track is cut into segments: the recorded ones, and the holes. The
 * caller draws the holes dashed and labels them. Nothing here touches Leaflet
 * or React, which is the point — this is the part worth testing.
 */

export interface TrackPoint {
  latitude: string | number;
  longitude: string | number;
  /** When the phone recorded it, not when it was uploaded. */
  occurredAt: string;
}

export interface TrackSegment {
  points: Array<[number, number]>;
  /** True when this segment bridges a hole rather than tracing a recorded path. */
  isGap: boolean;
  /** Milliseconds the hole spans. Zero for a recorded segment. */
  gapMs: number;
}

/**
 * Longer than this between two points and the stretch counts as unrecorded.
 *
 * The driver app samples far more often than this; the value is chosen so a
 * lift ride or a tunnel does not get flagged, while a pocketed phone does.
 */
export const DEFAULT_GAP_MS = 3 * 60 * 1000;

function coordinate(point: TrackPoint): [number, number] | null {
  const lat = Number(point.latitude);
  const lng = Number(point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
}

/**
 * Cut a track into recorded runs and the holes between them.
 *
 * Points are sorted by time first: they arrive from an offline queue that
 * replays out of order, and a track sorted by upload time draws loops that
 * never happened.
 */
export function splitTrackIntoSegments(
  points: TrackPoint[],
  gapMs: number = DEFAULT_GAP_MS,
): TrackSegment[] {
  const usable = points
    .map((point) => ({ point, at: Date.parse(point.occurredAt) }))
    .filter((row) => Number.isFinite(row.at) && coordinate(row.point) !== null)
    .sort((a, b) => a.at - b.at);

  if (usable.length < 2) return [];

  const segments: TrackSegment[] = [];
  let run: Array<[number, number]> = [coordinate(usable[0].point)!];

  for (let index = 1; index < usable.length; index += 1) {
    const previous = usable[index - 1];
    const current = usable[index];
    const apart = current.at - previous.at;
    const here = coordinate(current.point)!;

    if (apart > gapMs) {
      // Close the run behind the hole. A single point is not a line, but it
      // still anchors the hole's start, so it is kept for the gap segment
      // rather than drawn on its own.
      if (run.length > 1) segments.push({ points: run, isGap: false, gapMs: 0 });
      segments.push({
        points: [coordinate(previous.point)!, here],
        isGap: true,
        gapMs: apart,
      });
      run = [here];
      continue;
    }
    run.push(here);
  }

  if (run.length > 1) segments.push({ points: run, isGap: false, gapMs: 0 });
  return segments;
}

/** How long the hole lasted, worded for a person rather than in milliseconds. */
export function gapMinutes(gapMs: number): number {
  return Math.max(1, Math.round(gapMs / 60_000));
}
