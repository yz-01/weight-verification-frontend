/**
 * The aiming frame on the phone's passport camera (JB61-1), and the photo cut
 * from it.
 *
 * A passport data page is 125 x 88 mm. The frame is drawn that shape over the
 * live picture, as large as fits, and the photo sent is what is inside it
 * with a little room around - so the two MRZ lines at the foot are big and
 * nothing else on the table is read.
 */

export const PAGE_RATIO = 125 / 88;
/** Room kept around the frame in the photo, as a share of its size. */
const MARGIN = 0.06;
/** The photo's longest side, in pixels. */
const MAX_SIDE = 2000;

export interface FrameBox {
  x: number;
  y: number;
  width: number;
  height: number;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

/** Where the frame sits on a `videoWidth` x `videoHeight` picture. */
export function frameBox(videoWidth: number, videoHeight: number): FrameBox {
  let width = videoWidth * 0.9;
  let height = width / PAGE_RATIO;
  if (height > videoHeight * 0.8) {
    height = videoHeight * 0.8;
    width = height * PAGE_RATIO;
  }
  const x = (videoWidth - width) / 2;
  const y = (videoHeight - height) / 2;
  return {
    x,
    y,
    width,
    height,
    leftPct: (x / videoWidth) * 100,
    topPct: (y / videoHeight) * 100,
    widthPct: (width / videoWidth) * 100,
    heightPct: (height / videoHeight) * 100,
  };
}

/** The part of the picture the photo keeps: the frame and a margin, inside the picture. */
export function cropBox(videoWidth: number, videoHeight: number) {
  const box = frameBox(videoWidth, videoHeight);
  const padX = box.width * MARGIN;
  const padY = box.height * MARGIN;
  const x = Math.max(0, box.x - padX);
  const y = Math.max(0, box.y - padY);
  const width = Math.min(videoWidth, box.x + box.width + padX) - x;
  const height = Math.min(videoHeight, box.y + box.height + padY) - y;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    outWidth: Math.round(width * scale),
    outHeight: Math.round(height * scale),
  };
}

/** The frame's part of the live picture now, as a JPEG file. */
export async function captureFrame(
  video: HTMLVideoElement,
  videoWidth: number,
  videoHeight: number,
): Promise<File | null> {
  const crop = cropBox(videoWidth, videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = crop.outWidth;
  canvas.height = crop.outHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.outWidth, crop.outHeight);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) return null;
  return new File([blob], `passport-${Date.now()}.jpg`, { type: "image/jpeg" });
}
