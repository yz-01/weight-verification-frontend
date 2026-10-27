"use client";

/**
 * One 「发送」 of the gate guard's photographs, for the viewers (JB35).
 *
 * 客户 10-26 事项 10 put one press on one row; since JB40 (客户 10-27: 「这个能
 * 不能做到点一次」) the row opens straight on its photographs, in the photo
 * wall's viewer, without the list of its records in between.
 */
import type { ShellPhoto } from "@/components/shared/record-detail-shell";
import type { GateUpload, WallRecord } from "@/lib/gate-photo-wall";
import { photoMeta } from "@/lib/photo-meta";

/** A record's photos for the viewer, each with its own time and GPS. */
export function wallShellPhotos(record: WallRecord): ShellPhoto[] {
  return record.wall_photos.map((photo) => ({
    id: photo.id,
    url: photo.watermarked_image,
    thumbnailUrl: photo.thumbnail,
    label: record.incident_no,
    ...photoMeta(photo, record),
  }));
}

/** Every photo of an upload, in the order taken. */
export function uploadShellPhotos(upload: GateUpload): ShellPhoto[] {
  return upload.records.flatMap(wallShellPhotos);
}
