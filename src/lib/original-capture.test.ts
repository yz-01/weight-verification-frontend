import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The camera keeps the frame as the original (H5 三, WP1; Lucas 2026-10-09):
 * at the camera's full resolution and high quality, apart from the
 * application photo, which is handed over unchanged except for its name.
 */

const stored: Array<Record<string, unknown>> = [];
let token: string | null = null;

vi.mock("@/lib/auth-token", () => ({ getAccessToken: () => token }));
vi.mock("@/lib/offline-db", () => ({
  putLocalOriginal: async (row: Record<string, unknown>) => {
    stored.push(row);
  },
  getLocalOriginal: async () => null,
  getLocalOriginals: async () => [],
  updateLocalOriginal: async () => null,
}));

import { applicationPhotoCanvas, centreSquare, startOriginal } from "@/lib/original-capture";
import { ORIGINAL_QUALITY, originalIdOf } from "@/lib/original-photos";

const calls: string[] = [];
/** What each drawImage drew from, in order. */
const sources: unknown[] = [];
let quality: number | undefined;

function fakeCanvas() {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      translate: () => calls.push("translate"),
      scale: () => calls.push("scale"),
      drawImage: (source: unknown, ...args: number[]) => {
        sources.push(source);
        if (args.length === 8) {
          // drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh): a crop.
          const [sx, sy, sw, sh, , , dw, dh] = args;
          calls.push(`draw ${sx},${sy} ${sw}x${sh} -> ${dw}x${dh}`);
        } else {
          calls.push(`draw ${args[2]}x${args[3]}`);
        }
      },
    }),
    toBlob: (done: (blob: Blob | null) => void, _type: string, q?: number) => {
      quality = q;
      done(new Blob([new Uint8Array(2048)], { type: "image/jpeg" }));
    },
  };
  return canvas;
}

const video = { videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement;

beforeEach(() => {
  stored.length = 0;
  calls.length = 0;
  sources.length = 0;
  quality = undefined;
  const payload = btoa(JSON.stringify({ user_id: "worker-1" })).replace(/=+$/, "");
  token = `h.${payload}.s`;
  vi.stubGlobal("document", { createElement: () => fakeCanvas() });
});

afterEach(() => vi.unstubAllGlobals());

describe("startOriginal", () => {
  it("keeps the frame's centre square at high quality and names the photo after it", async () => {
    const pending = startOriginal(video, false);
    expect(pending).not.toBeNull();
    expect(calls).toEqual(["draw 420,0 1080x1080 -> 1080x1080"]);
    expect([pending!.frame.width, pending!.frame.height]).toEqual([1080, 1080]);

    const photo = new File([new Uint8Array([1, 2, 3])], "mse-site-1.jpg", { type: "image/jpeg" });
    const named = pending!.attach(photo);
    // The same photo, under a name that carries the original's id.
    expect(named.size).toBe(photo.size);
    expect(named.type).toBe("image/jpeg");
    const id = originalIdOf(named.name);
    expect(id).toMatch(/^[0-9a-f]{32}$/);

    await vi.waitFor(() => expect(stored).toHaveLength(1));
    expect(quality).toBe(ORIGINAL_QUALITY);
    expect(stored[0]).toMatchObject({
      id,
      ownerId: "worker-1",
      size: 2048,
      width: 1080,
      height: 1080,
      state: "captured",
      photoName: named.name,
    });
  });

  it("mirrors the front camera like the photo itself", () => {
    startOriginal(video, true);
    expect(calls).toEqual(["translate", "scale", "draw 420,0 1080x1080 -> 1080x1080"]);
  });

  it("keeps the centre square of a portrait (phone held upright) frame", () => {
    const upright = { videoWidth: 1080, videoHeight: 1920 } as HTMLVideoElement;
    const pending = startOriginal(upright, false);
    expect(calls).toEqual(["draw 0,420 1080x1080 -> 1080x1080"]);
    expect([pending!.frame.width, pending!.frame.height]).toEqual([1080, 1080]);
  });

  it("keeps nothing when nobody is signed in", () => {
    token = null;
    expect(startOriginal(video, false)).toBeNull();
  });
});

describe("one frame for the original and the application photo (audit S4)", () => {
  const big = { videoWidth: 4000, videoHeight: 3000 } as HTMLVideoElement;

  it("reads the video once and draws the photo from the original's frame", () => {
    const pending = startOriginal(big, false);
    const photo = applicationPhotoCanvas(big, false, pending);
    expect(photo).not.toBeNull();
    // The video is drawn once, at full size; the photo comes from that frame.
    expect(sources.filter((source) => source === big)).toHaveLength(1);
    expect(sources).toEqual([big, pending!.frame]);
    expect(calls).toEqual(["draw 500,0 3000x3000 -> 3000x3000", "draw 1920x1920"]);
    expect([photo!.width, photo!.height]).toEqual([1920, 1920]);
  });

  it("mirrors the front camera once, not twice", () => {
    const pending = startOriginal(video, true);
    applicationPhotoCanvas(video, true, pending);
    expect(calls).toEqual(["translate", "scale", "draw 420,0 1080x1080 -> 1080x1080", "draw 1080x1080"]);
    expect(sources).toEqual([video, pending!.frame]);
  });

  it("without an original the photo is drawn from the video as before", () => {
    token = null;
    const pending = startOriginal(video, true);
    expect(pending).toBeNull();
    const photo = applicationPhotoCanvas(video, true, pending);
    expect(calls).toEqual(["translate", "scale", "draw 420,0 1080x1080 -> 1080x1080"]);
    expect(sources).toEqual([video]);
    expect([photo!.width, photo!.height]).toEqual([1080, 1080]);
  });

  it("without an original a big portrait frame is cut square and capped", () => {
    token = null;
    const tall = { videoWidth: 3000, videoHeight: 4000 } as HTMLVideoElement;
    const photo = applicationPhotoCanvas(tall, false, null);
    expect(calls).toEqual(["draw 0,500 3000x3000 -> 1920x1920"]);
    expect([photo!.width, photo!.height]).toEqual([1920, 1920]);
  });
});

describe("centreSquare (J45: what the square viewfinder shows)", () => {
  it("cuts a landscape frame at its middle", () => {
    expect(centreSquare(1920, 1080)).toEqual({ sx: 420, sy: 0, side: 1080 });
    expect(centreSquare(1920, 1440)).toEqual({ sx: 240, sy: 0, side: 1440 });
  });

  it("cuts a portrait frame at its middle", () => {
    expect(centreSquare(1080, 1920)).toEqual({ sx: 0, sy: 420, side: 1080 });
    expect(centreSquare(1440, 1920)).toEqual({ sx: 0, sy: 240, side: 1440 });
  });

  it("leaves a square frame whole", () => {
    expect(centreSquare(1200, 1200)).toEqual({ sx: 0, sy: 0, side: 1200 });
  });

  it("keeps whole pixels on an odd difference", () => {
    expect(centreSquare(641, 480)).toEqual({ sx: 80, sy: 0, side: 480 });
  });

  it("is symmetric, so mirroring the front camera keeps the same square", () => {
    for (const [width, height] of [[1920, 1080], [1080, 1920], [1280, 720]]) {
      const { sx, side } = centreSquare(width, height);
      // The square mirrored about the frame's middle starts where it began.
      expect(width - (sx + side)).toBe(sx);
    }
  });

  it("is empty for a frame with no size yet", () => {
    expect(centreSquare(0, 1080).side).toBe(0);
    expect(centreSquare(Number.NaN, 1080).side).toBe(0);
  });
});
