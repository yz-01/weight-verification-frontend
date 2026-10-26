/**
 * 日常拍照记录's 照片墙 (I33, ID74): the order the photos are seen in.
 *
 * The client: 「放大后可直接左右切换上一张、下一张照片，详细记录同步切换，不需要
 * 反复关闭」「支持按日期筛选后连续查看照片」. The wall is the list's pages, newest
 * record first; a record with several photos shows them all, in the order
 * they were taken, before the next record - and the last photo of a page
 * leads on to the first of the next page, fetched when it is reached.
 *
 * Pure, so the order is tested without a screen (`gate-photo-wall.test.ts`).
 */

import type { GateIncident } from "@/interfaces/site-access";

/** One photo of a row, as `?with_photos=1` sends it. */
export interface WallPhoto {
  id: string;
  /** The small stamped copy for the wall's tile. */
  thumbnail: string;
  /** The stamped photo, full size, for the viewer. */
  watermarked_image: string;
  captured_at: string;
  latitude: string | null;
  longitude: string | null;
  accuracy_m: string | null;
  guard_name: string;
  gate_name: string;
}

export interface WallRecord extends GateIncident {
  wall_photos: WallPhoto[];
}

/**
 * 日常拍照记录 as one row per 「发送」 (JB35, `?group=upload`): the guard's
 * press, opened and numbered by its first record, with every record of it
 * as the wall reads them.
 */
export interface GateUpload {
  /** The first record's id: a one-photo upload opens as that record. */
  id: string;
  upload_batch: string;
  incident_no: string;
  last_incident_no: string;
  project: string;
  project_name: string;
  project_code: string;
  guard_name: string;
  occurred_at: string;
  record_count: number;
  photo_count: number;
  records: WallRecord[];
}

/** One tile: a photo, the record it belongs to, and its place in that record. */
export interface WallItem {
  key: string;
  record: WallRecord;
  photo: WallPhoto;
  /** 0-based, within its record. */
  photoIndex: number;
  photoCount: number;
}

/**
 * Every photo of every loaded page, in viewing order. A record that slid
 * onto the next page while the guard kept sending (the pages are newest
 * first) appears once, where it was first seen.
 */
export function wallItems(pages: readonly { results: readonly WallRecord[] }[]): WallItem[] {
  const seen = new Set<string>();
  const items: WallItem[] = [];
  for (const page of pages) {
    for (const record of page.results) {
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      record.wall_photos.forEach((photo, photoIndex) => {
        items.push({
          key: `${record.id}:${photo.id}`,
          record,
          photo,
          photoIndex,
          photoCount: record.wall_photos.length,
        });
      });
    }
  }
  return items;
}

export type WallStep =
  | { kind: "show"; index: number }
  /** Past the last loaded photo, with more pages to come: fetch, then show. */
  | { kind: "load"; index: number }
  | { kind: "none" };

/** Where 上一张 / 下一张 goes from `index`, given what is loaded. */
export function wallStep(index: number, by: 1 | -1, loaded: number, hasMore: boolean): WallStep {
  const next = index + by;
  if (next < 0) return { kind: "none" };
  if (next < loaded) return { kind: "show", index: next };
  return hasMore ? { kind: "load", index: next } : { kind: "none" };
}
