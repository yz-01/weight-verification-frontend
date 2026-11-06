/**
 * A kept photo whose read never answers (客户 11-06).
 *
 * 「我手上手机断断网缓存到现在还上传不了」: a gate photo queued on 11-04 showed
 * 「正在上传…」 for good on the client's iPhone, while a photo queued today on
 * another phone went. When iOS has cleared a kept photo's bytes, reading it
 * may hang rather than fail; the 4-minute stall (JB106) then set it aside and
 * the next pass hung on it again, every pass, never reaching 「上传失败」 where
 * the phone says why and offers to delete it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { PHOTO_LOST } from "@/lib/queue-refusal";
import { keptBlob } from "@/lib/offline-db";
import { READ_STALL_MS, withFilesInMemory } from "@/services/offline-sync.service";

function kept(blob: Blob) {
  return { blob, name: "gate.jpg", type: "image/jpeg", lastModified: 0 };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("a photo kept as its bytes (since 11-06)", () => {
  it("needs nothing read from disk", async () => {
    const bytes = new TextEncoder().encode("jpeg-bytes").buffer as ArrayBuffer;
    const ready = await withFilesInMemory({ photos: [{ bytes, name: "gate.jpg", type: "image/jpeg", lastModified: 0 }] });
    expect(await keptBlob(ready.photos[0]).text()).toBe("jpeg-bytes");
  });

  it("is said as gone when it holds nothing", async () => {
    const empty = { bytes: new ArrayBuffer(0), name: "gate.jpg", type: "image/jpeg", lastModified: 0 };
    await expect(withFilesInMemory({ photos: [empty] })).rejects.toMatchObject({ code: PHOTO_LOST });
  });
});

describe("reading a kept photo (records kept before 11-06)", () => {
  it("says the photo is gone only when no way of reading it answers", async () => {
    vi.useFakeTimers();
    const hung = new Blob(["x"], { type: "image/jpeg" });
    hung.arrayBuffer = () => new Promise<ArrayBuffer>(() => {});
    // A FileReader that never answers either; no screen to redraw on here.
    vi.stubGlobal("FileReader", class {
      readAsArrayBuffer() {}
    });
    const result = withFilesInMemory({ photos: [kept(hung)] }).catch((error: { code?: string }) => error.code);
    await vi.advanceTimersByTimeAsync(READ_STALL_MS * 3);
    await expect(result).resolves.toBe(PHOTO_LOST);
    vi.unstubAllGlobals();
  });

  it("still sends the old one when another way of reading answers (「让旧的也可以上传」)", async () => {
    vi.useFakeTimers();
    const hung = new Blob(["jpeg-bytes"], { type: "image/jpeg" });
    hung.arrayBuffer = () => new Promise<ArrayBuffer>(() => {});
    vi.stubGlobal("FileReader", class {
      result: ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      readAsArrayBuffer() {
        this.result = new TextEncoder().encode("jpeg-bytes").buffer as ArrayBuffer;
        queueMicrotask(() => this.onload?.());
      }
    });
    const result = withFilesInMemory({ photos: [kept(hung)] });
    await vi.advanceTimersByTimeAsync(READ_STALL_MS);
    const ready = await result;
    vi.useRealTimers();
    expect(await keptBlob(ready.photos[0]).text()).toBe("jpeg-bytes");
    vi.unstubAllGlobals();
  });

  it("gives each way far longer than a real read takes", () => {
    expect(READ_STALL_MS).toBeGreaterThanOrEqual(10_000);
  });

  it("still sends a photo that is there", async () => {
    const photo = new Blob(["jpeg-bytes"], { type: "image/jpeg" });
    const ready = await withFilesInMemory({ photos: [kept(photo)] });
    expect(keptBlob(ready.photos[0]).size).toBe(photo.size);
    expect(await keptBlob(ready.photos[0]).text()).toBe("jpeg-bytes");
  });
});
