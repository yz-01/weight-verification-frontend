/**
 * One photo size for everything a phone uploads (A5, A9).
 *
 * A phone camera hands over 4000 x 3000 at 3-6 MB. On a weak site signal
 * that upload did not finish, so the record sat on 「等待上传」 for good; and
 * the server's OCR spent its time on pixels it does not need. A delivery
 * note is readable well below that, so every photo that goes into the
 * offline queue - or is read by OCR straight from the camera - is brought
 * down to this size first.
 *
 * - Long edge at most `PHOTO_MAX_EDGE` (inside the 1600-2000 px the spec
 *   allows: enough for OCR to read a DO's small print).
 * - JPEG at `PHOTO_QUALITY`.
 * - Never made bigger: a photo already inside the limit keeps its size.
 * - Upright: the photo is decoded with its EXIF orientation applied and the
 *   pixels are written out turned, so a portrait shot stays portrait even
 *   though the new file carries no EXIF.
 *
 * Anything that cannot be compressed here (a PDF, a browser without canvas,
 * an image the browser cannot decode) is passed through untouched: a big
 * photo that uploads slowly is better than a photo that is lost.
 */

export const PHOTO_MAX_EDGE = 1920;
export const PHOTO_QUALITY = 0.8;

const COMPRESSIBLE = /^image\/(jpe?g|png|webp|heic|heif)$/i;

/** The size a photo is drawn at: the long edge capped, the shape kept, never enlarged. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = PHOTO_MAX_EDGE,
): { width: number; height: number; scaled: boolean } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0, scaled: false };
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width, height, scaled: false };
  const ratio = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    scaled: true,
  };
}

/** `IMG_0042.HEIC` -> `IMG_0042.jpg`: the file is a JPEG now and says so. */
export function jpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "photo"}.jpg`;
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/**
 * Decode with the EXIF orientation applied.
 *
 * `createImageBitmap(..., { imageOrientation: "from-image" })` first; where
 * that is missing or refuses the option, an `<img>` - which every current
 * browser also draws upright (CSS `image-orientation: from-image` is the
 * default) and whose natural size is the turned size.
 */
async function decode(file: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to the <img> route.
    }
  }
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    return null;
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("decode_failed"));
      image.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

/** Draw onto a white page (a PNG's transparency would turn black) and encode. */
export async function drawJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number = PHOTO_QUALITY,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);
    try {
      return await canvas.convertToBlob({ type: "image/jpeg", quality });
    } catch {
      return null;
    }
  }
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** The photo at upload size, or the original when it cannot or need not change. */
export async function compressPhoto(file: File): Promise<File> {
  if (!COMPRESSIBLE.test(file.type)) return file;
  const decoded = await decode(file);
  if (!decoded) return file;
  try {
    const target = fitWithin(decoded.width, decoded.height);
    if (target.width === 0) return file;
    // Already a JPEG inside the limit: re-encoding would only lose detail.
    if (!target.scaled && /^image\/jpe?g$/i.test(file.type)) return file;
    const blob = await drawJpeg(decoded.source, target.width, target.height);
    if (!blob) return file;
    // Never hand back something bigger than what came in.
    if (!target.scaled && blob.size >= file.size) return file;
    return new File([blob], jpegName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    decoded.release();
  }
}
