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

import { startOriginal } from "@/lib/original-capture";
import { ORIGINAL_QUALITY, originalIdOf } from "@/lib/original-photos";

const calls: string[] = [];
let quality: number | undefined;

function fakeCanvas() {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      translate: () => calls.push("translate"),
      scale: () => calls.push("scale"),
      drawImage: (_source: unknown, _x: number, _y: number, width: number, height: number) =>
        calls.push(`draw ${width}x${height}`),
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
  quality = undefined;
  const payload = btoa(JSON.stringify({ user_id: "worker-1" })).replace(/=+$/, "");
  token = `h.${payload}.s`;
  vi.stubGlobal("document", { createElement: () => fakeCanvas() });
});

afterEach(() => vi.unstubAllGlobals());

describe("startOriginal", () => {
  it("keeps the full frame at high quality and names the photo after it", async () => {
    const pending = startOriginal(video, false);
    expect(pending).not.toBeNull();
    expect(calls).toEqual(["draw 1920x1080"]);

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
      width: 1920,
      height: 1080,
      state: "captured",
      photoName: named.name,
    });
  });

  it("mirrors the front camera like the photo itself", () => {
    startOriginal(video, true);
    expect(calls).toEqual(["translate", "scale", "draw 1920x1080"]);
  });

  it("keeps nothing when nobody is signed in", () => {
    token = null;
    expect(startOriginal(video, false)).toBeNull();
  });
});
