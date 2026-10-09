import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compressPhoto,
  fitWithin,
  jpegName,
  PHOTO_MAX_EDGE,
  PHOTO_QUALITY,
  PHOTO_QUALITY_FLOOR,
  PHOTO_QUALITY_STEPS,
  PHOTO_TARGET_BYTES,
  encodeWithinTarget,
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

/**
 * The 200-500 KB target (client 2026-10-09 一.2-一.4): stepped down from 0.8
 * while over 500 KB, never below 0.6, and over 500 KB when even 0.6 is.
 */
describe("encodeWithinTarget", () => {
  /** An encoder whose output shrinks with quality, like a real JPEG's. */
  const sized = (bytesAt: (quality: number) => number) => {
    const asked: number[] = [];
    const encode = async (quality: number) => {
      asked.push(quality);
      return new Blob([new Uint8Array(bytesAt(quality))], { type: "image/jpeg" });
    };
    return { asked, encode };
  };

  it("keeps 0.8 for a photo already inside 500 KB", async () => {
    const { asked, encode } = sized(() => 300 * 1024);
    const blob = await encodeWithinTarget(encode);
    expect(asked).toEqual([0.8]);
    expect(blob?.size).toBe(300 * 1024);
  });

  it("steps down only as far as it must", async () => {
    const { asked, encode } = sized((quality) => (quality > 0.75 ? 640 : 450) * 1024);
    const blob = await encodeWithinTarget(encode);
    expect(asked).toEqual([0.8, 0.7]);
    expect(blob?.size).toBe(450 * 1024);
  });

  it("stops at the 0.6 floor and sends the photo over 500 KB rather than lose its text", async () => {
    const { asked, encode } = sized((quality) => Math.round(quality * 1000) * 1024);
    const blob = await encodeWithinTarget(encode);
    expect(asked).toEqual([0.8, 0.7, 0.6]);
    expect(Math.min(...asked)).toBe(PHOTO_QUALITY_FLOOR);
    expect(blob?.size).toBe(600 * 1024);
    expect(blob!.size).toBeGreaterThan(PHOTO_TARGET_BYTES);
  });

  it("has steps from 0.8 down to the floor and no lower", () => {
    expect(PHOTO_QUALITY_STEPS[0]).toBe(PHOTO_QUALITY);
    expect(PHOTO_QUALITY_STEPS.at(-1)).toBe(PHOTO_QUALITY_FLOOR);
    expect(PHOTO_QUALITY_FLOOR).toBeGreaterThanOrEqual(0.6);
    expect(PHOTO_TARGET_BYTES).toBe(500 * 1024);
  });

  it("answers null when nothing could be encoded", async () => {
    expect(await encodeWithinTarget(async () => null)).toBeNull();
  });
});

/**
 * The same steps on real pictures: fixture photos encoded by a real JPEG
 * encoder (sharp, the one Next.js ships), at the phone's 1920 px.
 */
describe("the size target on fixture photos", async () => {
  const sharp = (await import("sharp").catch(() => null))?.default ?? null;

  /** A busy site photo: noise everywhere, the hardest to make small. */
  const busy = () =>
    sharp!({ create: { width: 1920, height: 1440, channels: 3, background: { r: 128, g: 128, b: 128 }, noise: { type: "gaussian", mean: 128, sigma: 60 } } });
  /** A plain one: a wall and a sign. */
  const plain = () =>
    sharp!({ create: { width: 1920, height: 1080, channels: 3, background: { r: 180, g: 170, b: 150 } } });

  const encoder = (make: () => import("sharp").Sharp) => {
    const asked: number[] = [];
    const encode = async (quality: number) => {
      asked.push(quality);
      const bytes = await make().jpeg({ quality: Math.round(quality * 100) }).toBuffer();
      return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
    };
    return { asked, encode };
  };

  it.skipIf(!sharp)("a plain photo goes at 0.8, well inside 500 KB", async () => {
    const { asked, encode } = encoder(plain);
    const blob = await encodeWithinTarget(encode);
    expect(asked).toEqual([0.8]);
    expect(blob!.size).toBeLessThanOrEqual(PHOTO_TARGET_BYTES);
  });

  it.skipIf(!sharp)("a busy photo is stepped down, and stops at the floor if it must", async () => {
    const { asked, encode } = encoder(busy);
    const blob = await encodeWithinTarget(encode);
    const atEight = (await encoder(busy).encode(0.8))!.size;
    expect(atEight).toBeGreaterThan(PHOTO_TARGET_BYTES);
    expect(asked.length).toBeGreaterThan(1);
    expect(Math.min(...asked)).toBeGreaterThanOrEqual(PHOTO_QUALITY_FLOOR);
    expect(blob!.size).toBeLessThan(atEight);
    if (blob!.size > PHOTO_TARGET_BYTES) expect(asked.at(-1)).toBe(PHOTO_QUALITY_FLOOR);
  });
});

describe("compressPhoto and the size target", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A decoder and a canvas whose JPEG is `bytesAt(quality)` long. */
  function fakeBrowser(width: number, height: number, bytesAt: (quality: number) => number) {
    const asked: number[] = [];
    vi.stubGlobal("createImageBitmap", async () => ({ width, height, close() {} }));
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return { fillRect() {}, drawImage() {}, fillStyle: "" };
        }
        async convertToBlob({ quality }: { quality: number }) {
          asked.push(quality);
          return new Blob([new Uint8Array(bytesAt(quality))], { type: "image/jpeg" });
        }
      },
    );
    return asked;
  }
  const jpegOf = (bytes: number) =>
    new File([new Uint8Array(bytes)], "do.jpg", { type: "image/jpeg" });

  it("leaves a JPEG inside 1920 px and 500 KB exactly as it is", async () => {
    const asked = fakeBrowser(1600, 1200, () => 100);
    const photo = jpegOf(400 * 1024);
    expect(await compressPhoto(photo)).toBe(photo);
    expect(asked).toEqual([]);
  });

  it("brings a JPEG inside 1920 px but over 500 KB down toward the target", async () => {
    const asked = fakeBrowser(1600, 1200, (quality) => (quality > 0.75 ? 700 : 420) * 1024);
    const result = await compressPhoto(jpegOf(900 * 1024));
    expect(asked).toEqual([0.8, 0.7]);
    expect(result.size).toBe(420 * 1024);
  });

  it("keeps a JPEG over 500 KB when re-encoding would save next to nothing", async () => {
    // A camera shot already at the floor: a second generation for 5% is not worth it.
    fakeBrowser(1600, 1200, () => 570 * 1024);
    const photo = jpegOf(600 * 1024);
    expect(await compressPhoto(photo)).toBe(photo);
  });

  it("shrinks a big phone photo to 1920 px with the stepped quality", async () => {
    const asked = fakeBrowser(4032, 3024, (quality) => (quality > 0.65 ? 800 : 520) * 1024);
    const result = await compressPhoto(jpegOf(4 * 1024 * 1024));
    expect(asked).toEqual([0.8, 0.7, 0.6]);
    // Over 500 KB at the floor: sent anyway (一.4).
    expect(result.size).toBe(520 * 1024);
    expect(result.type).toBe("image/jpeg");
  });
});
