/**
 * 照片墙 (JB134 事项 9 / JB135 事项 10): the rules both photo walls share.
 *
 * The client, 事项 9: 「『今日现场照片』参考现有门岗照片墙功能。单击照片：放大
 * 照片，可以左右连续翻看。双击照片：进入该照片对应的完整业务记录。支持日期及
 * 时间筛选。」 事项 10 (MSE Timeline 工程照片墙): 「每个项目独立照片墙：自动汇集
 * 该项目所有业务照片，按照拍摄时间排列，从开工第一天一直保留到竣工……照片筛选：
 * 支持按项目、日期及时间范围筛选，例如上午8点至12点。」
 *
 * Nothing is uploaded for a wall: it reads the photos the records already
 * hold (`get_headquarters_photos`). Pure, so it is tested without a screen
 * (`photo-wall.test.ts`).
 */

import type { HeadquartersPhoto } from "@/interfaces/headquarters";
import { wallClock } from "@/lib/gate-time-range";

/** What a wall is narrowed by. Every field optional; "" means not set. */
export interface PhotoWallFilters {
  project?: string;
  /** `YYYY-MM-DD`. */
  date_from?: string;
  date_to?: string;
  /** `HH:mm`, the time of day on the company's clock. */
  time_from?: string;
  time_to?: string;
}

/** What `getHeadquartersPhotos` is asked for, page and size left out. */
export interface PhotoWallQuery {
  project?: string;
  date_from?: string;
  date_to?: string;
  time_from?: string;
  time_to?: string;
  timeline?: boolean;
}

/**
 * The request for a wall. `timeline` walls (MSE Timeline) with no dates read
 * every photo ever taken; 今日现场照片 without dates is today, the server's
 * default. "all" as a project is every project.
 */
export function photoWallQuery(
  filters: PhotoWallFilters,
  { timeline = false }: { timeline?: boolean } = {},
): PhotoWallQuery {
  const query: PhotoWallQuery = {};
  if (filters.project && filters.project !== "all") query.project = filters.project;
  if (filters.date_from) query.date_from = filters.date_from;
  if (filters.date_to) query.date_to = filters.date_to;
  if (filters.time_from) query.time_from = filters.time_from;
  if (filters.time_to) query.time_to = filters.time_to;
  if (timeline && !query.date_from && !query.date_to) query.timeline = true;
  return query;
}

/**
 * Every photo of the loaded pages, newest first as sent. A photo that slid
 * onto the next page while new ones came in is kept once, where first seen.
 */
export function wallPhotos(
  pages: readonly { results: readonly HeadquartersPhoto[] }[],
): HeadquartersPhoto[] {
  const seen = new Set<string>();
  const photos: HeadquartersPhoto[] = [];
  for (const page of pages) {
    for (const photo of page.results) {
      if (seen.has(photo.id)) continue;
      seen.add(photo.id);
      photos.push(photo);
    }
  }
  return photos;
}

/** One day of a timeline: its `YYYY-MM-DD` and its photos with their place in the wall. */
export interface PhotoDay {
  day: string;
  photos: { photo: HeadquartersPhoto; index: number }[];
}

/**
 * The wall under day headings (「2026-11-07」), so it reads as a timeline.
 * The day is the company's calendar day, not the browser's. Order is kept:
 * a day appears where its first photo is.
 */
export function groupPhotosByDay(
  photos: readonly HeadquartersPhoto[],
  timeZone: string,
): PhotoDay[] {
  const days: PhotoDay[] = [];
  const byDay = new Map<string, PhotoDay>();
  photos.forEach((photo, index) => {
    const instant = new Date(photo.captured_at);
    const day = Number.isNaN(instant.getTime()) ? "" : wallClock(instant, timeZone).date;
    let group = byDay.get(day);
    if (!group) {
      group = { day, photos: [] };
      byDay.set(day, group);
      days.push(group);
    }
    group.photos.push({ photo, index });
  });
  return days;
}

/** How long a first click waits for a second before it counts as one click. */
export const DOUBLE_CLICK_MS = 250;

/**
 * Tells one click from two on the same tile: 单击 opens the large photo,
 * 双击 opens its record - never both. `count` is the click's own
 * `event.detail`: 1 waits `delay` ms for a second click, 2 (or more) cancels
 * the wait and is a double, 0 is the keyboard's Enter or Space, which has no
 * second press to wait for and opens at once. The timer functions are passed
 * in so the rule is tested without waiting.
 */
export function createClickSorter<T>({
  onSingle,
  onDouble,
  delay = DOUBLE_CLICK_MS,
  schedule = (run, ms) => setTimeout(run, ms),
  cancel = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: {
  onSingle: (target: T) => void;
  onDouble: (target: T) => void;
  delay?: number;
  schedule?: (run: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}) {
  let waiting: unknown = null;
  const clear = () => {
    if (waiting !== null) cancel(waiting);
    waiting = null;
  };
  return {
    click(target: T, count: number) {
      clear();
      if (count === 0) {
        onSingle(target);
      } else if (count >= 2) {
        onDouble(target);
      } else {
        waiting = schedule(() => {
          waiting = null;
          onSingle(target);
        }, delay);
      }
    },
    dispose: clear,
  };
}
