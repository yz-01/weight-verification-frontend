import type { LocationMapPath } from "@/components/shared/location-map";
import {
  gapMinutes,
  splitTrackIntoSegments,
  type TrackPoint,
} from "@/lib/track-gaps";

/**
 * One driver's track as map paths, with the unrecorded stretches broken out.
 *
 * Shared by all three views that draw a route — the driver's own screen, the
 * yard's live tracker, and the producer's order tracking — because a hole that
 * is honest on one screen and invisible on another is worse than no marking at
 * all: the two parties would be looking at the same trip and disagreeing about
 * where the lorry went.
 */
export function trackPaths({
  id,
  points,
  color,
  label,
  gapLabel,
}: {
  id: string;
  points: TrackPoint[];
  color?: string;
  label?: string;
  /** Worded by the caller, which holds the translator. Receives the minutes. */
  gapLabel: (minutes: number) => string;
}): LocationMapPath[] {
  return splitTrackIntoSegments(points).map((segment, index) => ({
    id: `${id}-${index}`,
    points: segment.points,
    color,
    dashed: segment.isGap,
    label: segment.isGap ? gapLabel(gapMinutes(segment.gapMs)) : label,
  }));
}
