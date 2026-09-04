import { describe, expect, it } from "vitest";

import {
  DEFAULT_GAP_MS,
  gapMinutes,
  splitTrackIntoSegments,
  type TrackPoint,
} from "./track-gaps";

/**
 * The rule this file protects: a hole in a driver's track must never be drawn
 * as a road.
 *
 * Browser geolocation stops when the screen locks, so holes are normal and
 * expected. Drawing a straight line through one claims a route nobody
 * recorded; the product accepted the limit (D-020) on condition that it is
 * visible rather than disguised (R-019).
 */

const START = Date.parse("2026-08-29T08:00:00.000Z");

function point(minutesFromStart: number, lat: number, lng: number): TrackPoint {
  return {
    latitude: String(lat),
    longitude: String(lng),
    occurredAt: new Date(START + minutesFromStart * 60_000).toISOString(),
  };
}

describe("splitting a driver's track", () => {
  it("keeps a steady run as one solid segment", () => {
    const segments = splitTrackIntoSegments([
      point(0, 3.1, 101.6),
      point(1, 3.11, 101.61),
      point(2, 3.12, 101.62),
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0].isGap).toBe(false);
    expect(segments[0].points).toHaveLength(3);
  });

  it("cuts a hole out and marks it, rather than drawing through it", () => {
    const segments = splitTrackIntoSegments([
      point(0, 3.1, 101.6),
      point(1, 3.11, 101.61),
      // twenty minutes in a pocket
      point(21, 3.3, 101.8),
      point(22, 3.31, 101.81),
    ]);

    expect(segments.map((segment) => segment.isGap)).toEqual([
      false,
      true,
      false,
    ]);
    const hole = segments[1];
    expect(hole.points).toEqual([
      [3.11, 101.61],
      [3.3, 101.8],
    ]);
    expect(gapMinutes(hole.gapMs)).toBe(20);
  });

  it("does not flag a short interruption as a hole", () => {
    const segments = splitTrackIntoSegments([
      point(0, 3.1, 101.6),
      point(2, 3.11, 101.61),
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0].isGap).toBe(false);
  });

  it("sorts by when the phone recorded it, not by arrival order", () => {
    // The offline queue replays out of order. Sorting by arrival draws loops
    // the lorry never made.
    const segments = splitTrackIntoSegments([
      point(2, 3.12, 101.62),
      point(0, 3.1, 101.6),
      point(1, 3.11, 101.61),
    ]);

    expect(segments[0].points).toEqual([
      [3.1, 101.6],
      [3.11, 101.61],
      [3.12, 101.62],
    ]);
  });

  it("handles a hole at the very start of the day", () => {
    const segments = splitTrackIntoSegments([
      point(0, 3.1, 101.6),
      point(60, 3.5, 102.0),
      point(61, 3.51, 102.01),
    ]);

    // The lone first point is not a line of its own, but it still anchors
    // where the hole began.
    expect(segments.map((segment) => segment.isGap)).toEqual([true, false]);
    expect(segments[0].points[0]).toEqual([3.1, 101.6]);
  });

  it("drops points with no usable coordinate or time", () => {
    const segments = splitTrackIntoSegments([
      point(0, 3.1, 101.6),
      { latitude: "not-a-number", longitude: "101.61", occurredAt: point(1, 0, 0).occurredAt },
      { latitude: "3.12", longitude: "101.62", occurredAt: "not-a-date" },
      point(2, 3.13, 101.63),
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0].points).toEqual([
      [3.1, 101.6],
      [3.13, 101.63],
    ]);
  });

  it("draws nothing from a single point", () => {
    expect(splitTrackIntoSegments([point(0, 3.1, 101.6)])).toEqual([]);
    expect(splitTrackIntoSegments([])).toEqual([]);
  });

  it("honours a caller-supplied threshold", () => {
    // Two points five minutes apart: a hole under the default threshold and
    // an ordinary run under a looser one. Both produce one segment — what
    // changes is whether it is drawn as a road or as a hole.
    const track = [point(0, 3.1, 101.6), point(5, 3.2, 101.7)];

    const strict = splitTrackIntoSegments(track, DEFAULT_GAP_MS);
    expect(strict).toHaveLength(1);
    expect(strict[0].isGap).toBe(true);

    const loose = splitTrackIntoSegments(track, 10 * 60_000);
    expect(loose).toHaveLength(1);
    expect(loose[0].isGap).toBe(false);
  });

  it("rounds a sub-minute hole up rather than reporting zero minutes", () => {
    expect(gapMinutes(20_000)).toBe(1);
  });
});
