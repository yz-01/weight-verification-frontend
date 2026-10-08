/**
 * The camera's half of the photo original (H5 三, WP1).
 *
 * Lucas, 2026-10-09: the way photos are taken does not change, so the
 * original is the frame the in-app camera captured, drawn at the camera's
 * full resolution and kept as a high-quality JPEG (about 1-2 MB at 1080p) -
 * not the phone camera's own file. The application photo the camera hands
 * over is exactly what it was; only its file name gains the original's id,
 * which is how the upload finds and declares it (`attachOriginalManifest`).
 *
 * Kept out of `field-camera.tsx` so the camera's own code barely changes.
 */

import { getAccessToken } from "@/lib/auth-token";
import { fitWithin } from "@/lib/photo-compression";
import {
  canHash,
  keepOriginal,
  nameWithOriginal,
  newOriginalId,
  ORIGINAL_QUALITY,
  sessionUserId,
  trackOriginal,
} from "@/lib/original-photos";

export interface PendingOriginal {
  /**
   * The frame itself, drawn once from the video (already mirrored for the
   * front camera). The application photo is drawn from this same canvas, so
   * the kept original is exactly the original *of* the photo the server holds
   * - not a neighbouring video frame on a moving truck.
   */
  frame: HTMLCanvasElement;
  /**
   * Hand over the application photo: returns it under a name that carries the
   * original's id, and starts keeping the original. Called once.
   */
  attach(photo: File): File;
}

/**
 * Freeze the frame on screen as this shot's original.
 *
 * `null` - and the photo goes exactly as before - when nobody is signed in
 * (an external collector's link has no account to back an original up to),
 * when this browser cannot hash files, or when the frame cannot be drawn.
 */
export function startOriginal(video: HTMLVideoElement, mirrored: boolean): PendingOriginal | null {
  const ownerId = sessionUserId(getAccessToken());
  if (!ownerId || !canHash() || typeof document === "undefined") return null;
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!(width > 0) || !(height > 0)) return null;
  const frame = document.createElement("canvas");
  frame.width = width;
  frame.height = height;
  const context = frame.getContext("2d");
  if (!context) return null;
  if (mirrored) {
    context.translate(width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(video, 0, 0, width, height);
  const id = newOriginalId();

  return {
    frame,
    attach(photo) {
      const named = new File([photo], nameWithOriginal(photo.name, id), {
        type: photo.type,
        lastModified: photo.lastModified,
      });
      // Tracked before the photo is handed over, so an upload sent at once
      // still waits for its original to be kept and declares it.
      trackOriginal(
        id,
        new Promise<boolean>((resolve) => {
          frame.toBlob(
            (original) => {
              if (!original) {
                resolve(false);
                return;
              }
              void keepOriginal({
                id,
                ownerId,
                blob: original,
                width,
                height,
                photo,
                photoName: named.name,
              }).then(resolve);
            },
            "image/jpeg",
            ORIGINAL_QUALITY,
          );
        }),
      );
      return named;
    },
  };
}

/**
 * The application photo's canvas, at upload size (A5, A9: the same long-edge
 * cap as every other photo the queue holds).
 *
 * With an original it is drawn from the original's frame - one frame for
 * both, and the frame is already mirrored. Without one (nobody signed in, no
 * hashing) it is drawn from the video as it always was. `null` when the
 * browser gives no 2D context.
 */
export function applicationPhotoCanvas(
  video: HTMLVideoElement,
  mirrored: boolean,
  original: PendingOriginal | null,
): HTMLCanvasElement | null {
  const source = original?.frame ?? null;
  const size = fitWithin(source?.width ?? video.videoWidth, source?.height ?? video.videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  if (source) {
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  if (mirrored) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}
