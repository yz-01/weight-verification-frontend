import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The phone's rules for photo originals (H5 三, WP1).
 *
 * The ones that carry the client's words: 「原图尚未上传时，不得显示『原图已备份』」
 * (三.6) - the phone never produces that state itself; 「尚未备份的原图不得被系统
 * 主动清理」 (三.8) - `protectedLocalItems`, which the history cleanup reuses;
 * and the upload's declaration, which is what lets the server verify (三.7).
 */

const originals = new Map<string, Record<string, unknown>>();

vi.mock("@/lib/offline-db", () => ({
  getLocalOriginal: async (id: string) => originals.get(id) ?? null,
  getLocalOriginals: async (ownerId: string) =>
    [...originals.values()].filter((row) => row.ownerId === ownerId),
  putLocalOriginal: async (row: Record<string, unknown>) => {
    originals.set(String(row.id), row);
  },
  updateLocalOriginal: async (id: string, change: Record<string, unknown>) => {
    const row = originals.get(id);
    if (!row) return null;
    const next = { ...row, ...change };
    originals.set(id, next);
    return next;
  },
}));

import {
  ABANDONED_AFTER_MS,
  attachOriginalManifest,
  fileNamesIn,
  keepOriginal,
  MANIFEST_FIELD,
  markOriginalsDeclared,
  megabytes,
  nameWithOriginal,
  newOriginalId,
  originalIdOf,
  protectedLocalItems,
  sessionUserId,
  sha256Hex,
  shownStatus,
  storageWarning,
  summariseLocal,
  trackOriginal,
  WAITING_WARN_BYTES,
  type LocalOriginalInfo,
} from "@/lib/original-photos";
import type { OriginalBackupSummary } from "@/interfaces/evidence";

const ID = "0123456789abcdef0123456789abcdef";

function local(overrides: Partial<LocalOriginalInfo> = {}): LocalOriginalInfo {
  return {
    id: ID,
    ownerId: "worker",
    sha256: "a".repeat(64),
    size: 1_500_000,
    width: 1920,
    height: 1080,
    capturedAt: new Date().toISOString(),
    photoName: nameWithOriginal("mse-site.jpg", ID),
    photoSha256: "b".repeat(64),
    state: "pending",
    attempts: 0,
    ...overrides,
  };
}

function summary(overrides: Partial<OriginalBackupSummary> = {}): OriginalBackupSummary {
  return {
    status: "ORIGINAL_PENDING",
    expected: 1,
    backed_up: 0,
    failed: 0,
    pending: 1,
    waiting_sha256: ["a".repeat(64)],
    waiting_bytes: 1_500_000,
    ...overrides,
  };
}

beforeEach(() => originals.clear());

describe("the photo names its original", () => {
  it("carries a 32-hex id the upload can find again", () => {
    const id = newOriginalId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    const name = nameWithOriginal("mse-site-2026-10-09T08-00-00.000Z.jpg", id);
    expect(name).toBe(`mse-site-2026-10-09T08-00-00.000Z-o${id}.jpg`);
    expect(originalIdOf(name)).toBe(id);
    // The compression step keeps the base name and may change the extension.
    expect(originalIdOf(name.replace(/\.jpg$/, ".webp"))).toBe(id);
    expect(originalIdOf("IMG_0042.jpg")).toBeNull();
    expect(originalIdOf(`original-${id}.jpg`)).toBeNull();
  });

  it("reads the signed-in person from the session token", () => {
    const payload = btoa(JSON.stringify({ user_id: "u-1" })).replace(/=+$/, "");
    expect(sessionUserId(`h.${payload}.s`)).toBe("u-1");
    expect(sessionUserId(null)).toBeNull();
    expect(sessionUserId("not-a-token")).toBeNull();
  });
});

describe("the upload declares its originals (三.7)", () => {
  it("adds the photo's own hash and the original's hash and size", async () => {
    const photo = new File([new Uint8Array([1, 2, 3])], nameWithOriginal("mse-site.jpg", ID), {
      type: "image/jpeg",
    });
    originals.set(ID, { ...local({ state: "captured" }), blob: new Blob([new Uint8Array(9)]) });
    const body = new FormData();
    body.append("photos", photo);
    body.append("signature", new File([new Uint8Array([7])], "signature-1.png"));

    const declared = await attachOriginalManifest(body);

    const manifest = JSON.parse(String(body.get(MANIFEST_FIELD)));
    expect(manifest).toEqual([
      {
        photo_sha256: await sha256Hex(photo),
        photo_name: photo.name,
        sha256: "a".repeat(64),
        size: 1_500_000,
        captured_at: expect.any(String),
      },
    ]);
    expect(declared).toEqual([{ id: ID, photoSha256: await sha256Hex(photo) }]);
    // A resend of the same body (the 401 retry) does not declare twice.
    expect(await attachOriginalManifest(body)).toEqual([]);
  });

  it("sends nothing extra for photos without a kept original", async () => {
    const body = new FormData();
    body.append("photos", new File([new Uint8Array([1])], "IMG_0001.jpg"));
    body.append("other", new File([new Uint8Array([1])], nameWithOriginal("x.jpg", ID)));
    expect(await attachOriginalManifest(body)).toEqual([]);
    expect(body.has(MANIFEST_FIELD)).toBe(false);
  });

  it("waits for an original still being written", async () => {
    let finish: (value: boolean) => void = () => undefined;
    trackOriginal(ID, new Promise<boolean>((resolve) => (finish = resolve)));
    const body = new FormData();
    body.append("photos", new File([new Uint8Array([4])], nameWithOriginal("mse-site.jpg", ID)));
    const pending = attachOriginalManifest(body);
    originals.set(ID, { ...local({ state: "captured" }), blob: new Blob([new Uint8Array(2)]) });
    finish(true);
    expect(await pending).toHaveLength(1);
  });

  it("moves a captured original to waiting once the upload landed, and keeps a failure", async () => {
    originals.set(ID, { ...local({ state: "captured" }) });
    originals.set("f".repeat(32), { ...local({ id: "f".repeat(32), state: "failed" }) });
    await markOriginalsDeclared([
      { id: ID, photoSha256: "c".repeat(64) },
      { id: "f".repeat(32), photoSha256: "d".repeat(64) },
    ]);
    expect(originals.get(ID)).toMatchObject({ state: "pending", photoSha256: "c".repeat(64) });
    expect(originals.get("f".repeat(32))).toMatchObject({ state: "failed" });
  });

  it("keeps an original with its hash, as captured", async () => {
    const kept = await keepOriginal({
      id: ID,
      ownerId: "worker",
      blob: new Blob([new Uint8Array([9, 9])], { type: "image/jpeg" }),
      width: 1920,
      height: 1080,
      photo: new Blob([new Uint8Array([1])]),
      photoName: "p.jpg",
    });
    expect(kept).toBe(true);
    expect(originals.get(ID)).toMatchObject({
      state: "captured",
      size: 2,
      sha256: await sha256Hex(new Blob([new Uint8Array([9, 9])])),
    });
  });
});

describe("never 「原图已备份」 before the server says so (三.6)", () => {
  it("takes the server's word and can only make it worse", () => {
    expect(shownStatus(summary(), [local()]).status).toBe("ORIGINAL_PENDING");
    expect(shownStatus(summary(), [local({ state: "failed" })]).status).toBe("ORIGINAL_FAILED");
    expect(shownStatus(summary({ status: "ORIGINAL_BACKED_UP", waiting_sha256: [] }), []).status).toBe(
      "ORIGINAL_BACKED_UP",
    );
    expect(shownStatus(undefined, [local()]).status).toBe("APPLICATION_UPLOADED");
  });

  it("says when the phone no longer holds a waiting original", () => {
    const shown = shownStatus(summary({ waiting_sha256: ["a".repeat(64), "e".repeat(64)] }), [local()]);
    expect(shown.heldHere).toHaveLength(1);
    expect(shown.missingHere).toBe(1);
  });
});

describe("protectedLocalItems (三.8, 四.6, 五.7)", () => {
  const now = Date.parse("2026-10-20T00:00:00Z");
  const old = new Date(now - ABANDONED_AFTER_MS - 1000).toISOString();

  it("protects every queued job and every original not backed up", () => {
    const inQueue = "1".repeat(32);
    const inDraft = "2".repeat(32);
    const result = protectedLocalItems(
      {
        jobs: [
          {
            id: "job-1",
            payload: { photos: [{ name: nameWithOriginal("a.jpg", inQueue), blob: {} }] },
          },
        ],
        originals: [
          { id: "3".repeat(32), state: "pending", capturedAt: old },
          { id: "4".repeat(32), state: "failed", capturedAt: old },
          { id: inQueue, state: "captured", capturedAt: old },
          { id: inDraft, state: "captured", capturedAt: old },
          { id: "5".repeat(32), state: "captured", capturedAt: new Date(now - 1000).toISOString() },
          { id: "6".repeat(32), state: "captured", capturedAt: old },
        ],
        draftFileNames: [nameWithOriginal("b.jpg", inDraft)],
      },
      now,
    );
    expect([...result.jobIds]).toEqual(["job-1"]);
    expect([...result.originalIds].sort()).toEqual(
      ["3".repeat(32), "4".repeat(32), inQueue, inDraft, "5".repeat(32)].sort(),
    );
    // Only the week-old shot nobody holds - retaken, or its form abandoned.
    expect(result.originalIds.has("6".repeat(32))).toBe(false);
  });

  it("finds photo names at any depth of a queued payload", () => {
    const names = fileNamesIn({
      receipt: { notes: "x" },
      sitePhotos: [{ name: "a.jpg", blob: {} }],
      deliveryNotePhoto: { name: "b.jpg", blob: {} },
    });
    expect([...names].sort()).toEqual(["a.jpg", "b.jpg"]);
  });
});

describe("traffic and storage, told plainly (三.重要)", () => {
  it("counts what waits and what the phone holds", () => {
    const rows = [
      local({ state: "pending", size: 1_000_000 }),
      local({ state: "failed", size: 2_000_000 }),
      local({ state: "captured", size: 500_000 }),
    ];
    expect(summariseLocal(rows)).toEqual({
      waiting: 2,
      waitingBytes: 3_000_000,
      failed: 1,
      captured: 1,
      heldBytes: 3_500_000,
    });
    expect(megabytes(3_000_000)).toBe("2.9");
    expect(megabytes(0)).toBe("0");
    expect(megabytes(50 * 1024 * 1024)).toBe("50");
  });

  it("warns when the browser is nearly full or a lot waits", () => {
    expect(storageWarning({ persisted: true, usage: 95, quota: 100 }, 0)).toBe("full");
    expect(storageWarning({ persisted: true, usage: 75, quota: 100 }, 0)).toBe("high");
    expect(storageWarning({ persisted: null, usage: null, quota: null }, WAITING_WARN_BYTES)).toBe("high");
    expect(storageWarning({ persisted: true, usage: 10, quota: 100 }, 1000)).toBe("none");
  });
});
