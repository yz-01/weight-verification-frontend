import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every photo upload declares the originals this phone keeps (H5 三.7, WP1),
 * whichever of the capture screens sent it - which is why it lives in the API
 * client and not in each screen. The original is marked 「原图待同步」 only
 * once the upload has landed: a refused upload declared nothing.
 */

const originals = new Map<string, Record<string, unknown>>();

vi.mock("@/lib/offline-db", () => ({
  getLocalOriginal: async (id: string) => originals.get(id) ?? null,
  getLocalOriginals: async () => [...originals.values()],
  putLocalOriginal: async () => undefined,
  updateLocalOriginal: async (id: string, change: Record<string, unknown>) => {
    const row = originals.get(id);
    if (!row) return null;
    originals.set(id, { ...row, ...change });
    return originals.get(id);
  },
}));

const { api } = await import("./api-client");
const { MANIFEST_FIELD, nameWithOriginal } = await import("@/lib/original-photos");

const ID = "0123456789abcdef0123456789abcdef";

function respond(status: number, body: unknown) {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  ) as unknown as typeof fetch;
}

function sentBody(): FormData {
  const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  return (mock.mock.calls.at(-1)?.[1] as RequestInit).body as FormData;
}

function upload() {
  const form = new FormData();
  form.append("image", new File([new Uint8Array([1, 2, 3])], nameWithOriginal("mse-site.jpg", ID)));
  return form;
}

describe("a photo upload declares its originals", () => {
  beforeEach(() => {
    originals.clear();
    originals.set(ID, {
      id: ID,
      ownerId: "u-1",
      sha256: "a".repeat(64),
      size: 1_200_000,
      capturedAt: "2026-10-09T08:00:00Z",
      state: "captured",
      photoSha256: "",
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("sends the manifest and marks the original waiting once the upload landed", async () => {
    respond(201, { success: true, data: {} });
    await api.post("/api/field-tasks/t-1/add_photo/", upload(), { silent: true });
    const manifest = JSON.parse(String(sentBody().get(MANIFEST_FIELD)));
    expect(manifest[0]).toMatchObject({ sha256: "a".repeat(64), size: 1_200_000 });
    expect(manifest[0].photo_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(originals.get(ID)).toMatchObject({ state: "pending", photoSha256: manifest[0].photo_sha256 });
  });

  it("leaves the original as it was when the upload was refused", async () => {
    respond(400, { success: false, message: "no", code: "validation_failed", errors: {} });
    await expect(api.post("/api/field-tasks/t-1/add_photo/", upload(), { silent: true })).rejects.toThrow();
    expect(originals.get(ID)).toMatchObject({ state: "captured" });
  });
});
