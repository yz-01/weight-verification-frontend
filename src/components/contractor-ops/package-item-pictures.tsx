"use client";

import { Images } from "lucide-react";

import { PhotoStrip, toShellPhotos } from "@/components/shared/photo-thumb";
import type { MySubmissionPhoto } from "@/interfaces/contractor";
import type { PackageDocument } from "@/interfaces/contractor-ops";

/**
 * A package item's photographs and slips as pictures (J34-11, Lucas 10-20).
 *
 * 「整个系统的照片一律显示照片本身」: the item still says how many fields,
 * photos, slips and files it carries, and under that its pictures are the
 * photo strip - each opens the viewer. Nothing when it has none.
 */
export function PackageItemPictures({
  reference,
  photos,
  documents,
}: {
  reference: string;
  photos: readonly MySubmissionPhoto[];
  documents: readonly PackageDocument[];
}) {
  const pictures = [
    ...photos.map((photo, index) => ({
      id: photo.id ?? `p${index}`,
      url: photo.url,
      thumbnail_url: photo.thumbnail_url ?? null,
      caption: photo.caption,
      captured_at: photo.captured_at,
      latitude: photo.latitude,
      longitude: photo.longitude,
    })),
    ...documents.map((document) => ({
      id: document.id,
      url: document.url,
      thumbnail_url: null,
      caption: document.caption,
      captured_at: null,
      latitude: null,
      longitude: null,
    })),
  ];
  if (pictures.length === 0) return null;
  return (
    <PhotoStrip
      className="mt-2"
      thumbs={pictures.map((picture) => picture.thumbnail_url ?? picture.url)}
      count={pictures.length}
      icon={Images}
      reference={reference}
      photos={toShellPhotos(pictures, reference)}
    />
  );
}
