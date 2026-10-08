import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compressPhoto,
  fitWithin,
  jpegName,
  PHOTO_MAX_EDGE,
  PHOTO_QUALITY,
} from "@/lib/photo-compression";

/**
 * The size every phone photo is uploaded at (A5, A9).
 *
 * Only the arithmetic and the pass-through rules run here: the repository's
 * tests have no canvas, so whether a real phone's JPEG comes out upright and
 * smaller is checked on a phone (PENDING in the A9 report).
 */

describe("the size limits", () => {
  it("sits inside the 1600-2000 px long edge and JPEG 0.8 the spec asks for", () => {
    expect(PHOTO_MAX_EDGE).toBeGreaterThanOrEqual(1600);
    expect(PHOTO_MAX_EDGE).toBeLessThanOrEqual(2000);
    expect(PHOTO_QUALITY).toBe(0.8);
  });
});

describe("fitWithin", () => {
  it("brings a landscape phone photo down to the long-edge cap, keeping its shape", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1920, height: 1440, scaled: true });
  });

  it("caps the height of a portrait photo, not its width", () => {
    expect(fitWithin(3000, 4000)).toEqual({ width: 1440, height: 1920, scaled: true });
  });

  it("never enlarges a photo already inside the limit", () => {
    expect(fitWithin(1280, 720)).toEqual({ width: 1280, height: 720, scaled: false });
    expect(fitWithin(PHOTO_MAX_EDGE, 1000)).toEqual({
      width: PHOTO_MAX_EDGE,
      height: 1000,
      scaled: false,
    });
  });

  it("keeps a very long thin image at least one pixel high", () => {
    expect(fitWithin(40000, 10)).toEqual({ width: 1920, height: 1, scaled: true });
  });

  it("rounds to whole pixels and keeps the aspect ratio within a pixel", () => {
    const { width, height } = fitWithin(4032, 3024);
    expect(Number.isInteger(width) && Number.isInteger(height)).toBe(true);
    expect(Math.abs(width / height - 4032 / 3024)).toBeLessThan(0.002);
  });

  it("takes another cap when asked", () => {
    expect(fitWithin(3200, 2400, 1600)).toEqual({ width: 1600, height: 1200, scaled: true });
  });

  it("answers zero for an image with no size", () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0, scaled: false });
    expect(fitWithin(Number.NaN, 100)).toEqual({ width: 0, height: 0, scaled: false });
  });
});

describe("jpegName", () => {
  it("names the output as the JPEG it now is", () => {
    expect(jpegName("IMG_0042.HEIC")).toBe("IMG_0042.jpg");
    expect(jpegName("screenshot.png")).toBe("screenshot.jpg");
    expect(jpegName("delivery.note.jpeg")).toBe("delivery.note.jpg");
    expect(jpegName("no-extension")).toBe("no-extension.jpg");
  });
});

describe("compressPhoto passes through what it cannot compress", () => {
  it("leaves a PDF untouched", async () => {
    const pdf = new File(["%PDF"], "invoice.pdf", { type: "application/pdf" });
    expect(await compressPhoto(pdf)).toBe(pdf);
  });

  it("leaves a photo untouched where there is no canvas to draw it on", async () => {
    const photo = new File(["jpeg"], "do.jpg", { type: "image/jpeg" });
    expect(await compressPhoto(photo)).toBe(photo);
  });
});

describe("compressPhoto always ends", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps the original when the browser never finishes decoding it", async () => {
    // A camera file the browser chokes on: the decode promise never settles.
    vi.useFakeTimers();
    vi.stubGlobal("createImageBitmap", () => new Promise(() => {}));
    const photo = new File(["jpeg"], "black-do.jpg", { type: "image/jpeg" });
    const result = compressPhoto(photo, 1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toBe(photo);
  });

  it("keeps the original when decoding throws", async () => {
    vi.stubGlobal("createImageBitmap", () => Promise.reject(new Error("decode")));
    const photo = new File(["jpeg"], "do.jpg", { type: "image/jpeg" });
    expect(await compressPhoto(photo, 1_000)).toBe(photo);
  });
});

describe("compressPhoto keeps a photo the right way up", () => {
  // Lucas, 2026-10-09: 「OCR如果打横拍的话好像也读取不到」. A phone's camera
  // stores the sensor's pixels sideways and says "turn me" in EXIF. Those
  // words must survive or be acted on before the DO photo reaches OCR.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function bitmap(width: number, height: number) {
    return { width, height, close: vi.fn() };
  }

  it("decodes with the EXIF orientation applied", async () => {
    const options: unknown[] = [];
    vi.stubGlobal("createImageBitmap", (_file: Blob, opts: unknown) => {
      options.push(opts);
      return Promise.resolve(bitmap(1080, 1440));
    });
    await compressPhoto(new File(["jpeg"], "do.jpg", { type: "image/jpeg" }));
    expect(options).toEqual([{ imageOrientation: "from-image" }]);
  });

  it("sends a JPEG already inside the limit as it is, EXIF and all", async () => {
    vi.stubGlobal("createImageBitmap", () => Promise.resolve(bitmap(1080, 1440)));
    const photo = new File(["jpeg-with-exif"], "do.jpg", { type: "image/jpeg" });
    expect(await compressPhoto(photo)).toBe(photo);
  });

  it("draws a big sideways-stored photo at its turned (upright) shape", async () => {
    // EXIF 6: stored 4032 x 3024, shown 3024 x 4032. The decoder hands back
    // the turned bitmap; the new JPEG (which carries no EXIF) is drawn at
    // that portrait shape, so its pixels are upright.
    const drawn: Array<{ width: number; height: number }> = [];
    class FakeCanvas {
      constructor(
        public width: number,
        public height: number,
      ) {
        drawn.push({ width, height });
      }
      getContext() {
        return { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
      }
      convertToBlob() {
        return Promise.resolve(new Blob(["small"], { type: "image/jpeg" }));
      }
    }
    vi.stubGlobal("OffscreenCanvas", FakeCanvas);
    vi.stubGlobal("createImageBitmap", () => Promise.resolve(bitmap(3024, 4032)));
    const photo = new File(["x".repeat(64)], "IMG_0042.jpg", { type: "image/jpeg" });
    const out = await compressPhoto(photo);
    expect(drawn).toEqual([{ width: 1440, height: 1920 }]);
    expect(out.name).toBe("IMG_0042.jpg");
    expect(out.type).toBe("image/jpeg");
  });
});
