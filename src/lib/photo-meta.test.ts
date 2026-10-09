import { describe, expect, it } from "vitest";

import { appendPhotoTimes, earliestTakenAt, photoMeta, photoTakenAt } from "@/lib/photo-meta";

/**
 * The time and GPS the shared photo viewer prints under a photograph
 * (client 2026-10-09: 「不是用系统里面的相机拍就有了吗」).
 */
describe("photoMeta", () => {
  it("reads the photo's own capture time and GPS", () => {
    expect(
      photoMeta({ captured_at: "2026-10-09T08:00:00Z", latitude: "3.1", longitude: "101.6" }),
    ).toEqual({ takenAt: "2026-10-09T08:00:00Z", latitude: "3.1", longitude: "101.6" });
  });

  it("reads taken_at where the photo calls its time that (receipts, drivers, dispatches)", () => {
    expect(photoMeta({ taken_at: "2026-10-09T09:00:00Z" }).takenAt).toBe("2026-10-09T09:00:00Z");
  });

  it("falls back to the record's one GPS fix for a photo sent without its own", () => {
    expect(
      photoMeta({ captured_at: "2026-10-09T08:00:00Z" }, { latitude: 3.25, longitude: 101.5 }),
    ).toEqual({ takenAt: "2026-10-09T08:00:00Z", latitude: "3.25", longitude: "101.5" });
  });

  it("prefers the photo's own position over the record's", () => {
    expect(
      photoMeta({ latitude: "1", longitude: "2" }, { latitude: "9", longitude: "9" }),
    ).toMatchObject({ latitude: "1", longitude: "2" });
  });

  it("never reports half a position", () => {
    expect(photoMeta({ latitude: "3.1", longitude: null })).toMatchObject({
      latitude: null,
      longitude: null,
    });
    expect(photoMeta({ latitude: "", longitude: "" }, { latitude: "4", longitude: "" })).toMatchObject({
      latitude: null,
      longitude: null,
    });
  });

  it("keeps empty values empty for a photo that has none (an office upload)", () => {
    expect(photoMeta({ captured_at: "" })).toEqual({ takenAt: null, latitude: null, longitude: null });
    expect(photoMeta(undefined)).toEqual({ takenAt: null, latitude: null, longitude: null });
  });
});

/**
 * The phone's capture moment travels with each photo, so an offline-queued
 * upload is not dated when it synced (2026-10-09 audit).
 */
describe("capture times on an upload", () => {
  const NOW = Date.parse("2026-10-09T10:00:00Z");
  const shot = (iso: string) => new File(["x"], "x.jpg", { lastModified: Date.parse(iso) });

  it("reads the shutter moment the in-app camera stamps on the file", () => {
    expect(photoTakenAt(shot("2026-10-09T01:00:00Z"), NOW)).toBe("2026-10-09T01:00:00.000Z");
    expect(photoTakenAt(new File(["x"], "x.jpg", { lastModified: 0 }), NOW)).toBeUndefined();
  });

  it("never dates a photo after now", () => {
    expect(photoTakenAt(shot("2026-10-09T12:00:00Z"), NOW)).toBe("2026-10-09T10:00:00.000Z");
  });

  it("sends each photo's time and the earliest as the record's", () => {
    const data = new FormData();
    const files = [shot("2026-10-09T03:00:00Z"), shot("2026-10-09T02:00:00Z")];
    appendPhotoTimes(data, files, NOW);
    expect(data.get("photo_captured_at_0")).toBe("2026-10-09T03:00:00.000Z");
    expect(data.get("photo_captured_at_1")).toBe("2026-10-09T02:00:00.000Z");
    expect(data.get("captured_at")).toBe("2026-10-09T02:00:00.000Z");
    expect(earliestTakenAt(files, NOW)).toBe("2026-10-09T02:00:00.000Z");
  });

  it("keeps a record time the caller already set", () => {
    const data = new FormData();
    data.append("captured_at", "2026-10-09T00:30:00.000Z");
    appendPhotoTimes(data, [shot("2026-10-09T03:00:00Z")], NOW);
    expect(data.getAll("captured_at")).toEqual(["2026-10-09T00:30:00.000Z"]);
  });
});
