/**
 * 总部大屏's rotation and its number words (JB291, 客户 11-27e).
 *
 * 一: 「自动轮流展示公司总览及各个项目，每个项目停留约15秒，持续循环播放，无须
 * 人工操作」. The slides are 公司总览 then each project the server sent (the
 * active ones head office left on the wall), 15 s each, round and round. A
 * data refresh never restarts the loop: the slide on screen stays by its id,
 * and only if its project left the wall does the loop go on from where it
 * stood.
 */

import type { WallScreenData } from "@/interfaces/wall-screen";

/** How long each slide stays (「每个项目停留约15秒」). */
export const SLIDE_MS = 15_000;
/** The background refresh (spec 四: every 1-2 minutes). */
export const REFRESH_MS = 90_000;
/** How long a photo stays in a carousel before the next one. */
export const PHOTO_MS = 5_000;
/** The cursor and the buttons hide after this long without a move. */
export const IDLE_MS = 3_000;

export interface WallSlide {
  kind: "overview" | "project";
  /** "overview", or the project's id. */
  id: string;
}

export const OVERVIEW_SLIDE: WallSlide = { kind: "overview", id: "overview" };

export function wallSlides(data: WallScreenData | undefined): WallSlide[] {
  return [
    OVERVIEW_SLIDE,
    ...(data?.projects ?? []).map((project) => ({ kind: "project" as const, id: project.id })),
  ];
}

/** The slide after `index`, back to 公司总览 after the last project. */
export function nextSlideIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return (index + 1) % count;
}

/**
 * Where the loop stands after the slides changed (a refresh, a project
 * switched off): the same slide if it is still there; otherwise the slide
 * now at the old position (the one that followed), or 公司总览.
 */
export function keepSlide(currentId: string, previousIndex: number, slides: WallSlide[]): number {
  const same = slides.findIndex((slide) => slide.id === currentId);
  if (same >= 0) return same;
  return previousIndex < slides.length ? previousIndex : 0;
}

/** A percentage as text ("40.00") as a number between 0 and 100. */
export function percent(value: string | number | null | undefined): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

/**
 * Kilograms for a wall reading: tonnes from 1 000 kg (one decimal), else
 * whole kilograms - a room reads 「12.4 吨」 faster than 「12,400.50 kg」.
 */
export function weightReading(kg: string | number | null | undefined): { value: number; unit: "t" | "kg"; decimals: number } {
  const number = Number(kg);
  const safe = Number.isFinite(number) ? Math.max(0, number) : 0;
  if (safe >= 1000) return { value: Math.round(safe / 100) / 10, unit: "t", decimals: 1 };
  return { value: Math.round(safe), unit: "kg", decimals: 0 };
}

/** The share of `part` in `whole` as a whole percentage; 0 for nothing. */
export function share(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.round((Math.max(0, part) / whole) * 100);
}

/**
 * The points of a curve on a 0-100 % chart between `start` and `end`, as SVG
 * coordinates in a `width` × `height` box (y grows downwards).
 */
export function curvePath(
  points: Array<{ date: string; value: string }>,
  start: string,
  end: string,
  width: number,
  height: number,
): string {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  const span = Math.max(1, to - from);
  return points
    .map((point, index) => {
      const at = Date.parse(`${point.date}T00:00:00Z`);
      const x = Math.min(width, Math.max(0, ((at - from) / span) * width));
      const y = height - (percent(point.value) / 100) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
