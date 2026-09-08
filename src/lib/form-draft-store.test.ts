import { describe, expect, it, vi } from "vitest";

import { FormDraftStore, type DraftPersistence } from "./form-draft-store";

function persistence(
  load: DraftPersistence["load"],
){
  const journal = vi.fn<DraftPersistence["journal"]>();
  const save = vi.fn<DraftPersistence["save"]>().mockResolvedValue(undefined);
  return {
    load,
    journal,
    save,
  };
}

describe("FormDraftStore", () => {
  it("restores saved text", async () => {
    const storage = persistence(async () => ({
      values: { material: { name: "Timber", quantity: 12 } },
      files: [],
    }));
    const store = new FormDraftStore("text", storage);

    await store.load();

    expect(store.getSnapshot()).toMatchObject({
      ready: true,
      status: "saved",
      values: { material: { name: "Timber", quantity: 12 } },
    });
  });

  it("restores a saved attachment", async () => {
    const photo = new File(["photo"], "arrival.jpg", { type: "image/jpeg" });
    const storage = persistence(async () => ({
      values: { evidence: { $draft: "file", id: "photo-1" } },
      files: [{ id: "photo-1", owner: "photo", file: photo }],
    }));
    const store = new FormDraftStore("photo", storage);

    await store.load();

    expect(store.getSnapshot().values.evidence).toBe(photo);
    expect(store.getSnapshot().missingAttachments).toEqual([]);
  });

  it("keeps text and reports an attachment that storage dropped", async () => {
    const storage = persistence(async () => ({
      values: {
        material: { name: "Timber" },
        evidence: { $draft: "file", id: "missing-photo" },
      },
      files: [],
    }));
    const store = new FormDraftStore("missing", storage);

    await store.load();

    expect(store.getSnapshot().values.material).toEqual({ name: "Timber" });
    expect(store.getSnapshot().values.evidence).toBeUndefined();
    expect(store.getSnapshot()).toMatchObject({
      ready: true,
      status: "saved",
      missingAttachments: ["evidence"],
    });
  });

  it("renders the form in an error state when browser storage is unavailable", async () => {
    const storage = persistence(async () => {
      throw new Error("storage unavailable");
    });
    const store = new FormDraftStore("private-mode", storage);

    await store.load();

    expect(store.getSnapshot()).toEqual({
      values: {},
      ready: true,
      status: "error",
      missingAttachments: [],
    });
  });

  it("retries the read after a failed load without overwriting the stored draft", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("temporarily blocked"))
      .mockResolvedValueOnce({ values: { note: "Recovered" }, files: [] });
    const storage = persistence(load);
    const store = new FormDraftStore("retry", storage);

    await store.load();
    store.retry();
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("saved"));

    expect(load).toHaveBeenCalledTimes(2);
    expect(storage.save).not.toHaveBeenCalled();
    expect(store.getSnapshot().values.note).toBe("Recovered");
  });

  it("journals immediately and clears persisted values after success", async () => {
    const storage = persistence(async () => null);
    const store = new FormDraftStore("clear", storage);
    await store.load();

    store.set("note", "Do not lose this");
    expect(storage.journal).toHaveBeenCalledTimes(1);
    expect(storage.journal.mock.calls[0]?.[1]).toEqual({ note: "Do not lose this" });
    await store.flush();
    store.clear();
    await store.flush();

    expect(storage.save).toHaveBeenLastCalledWith("clear", {}, [], true);
    expect(store.getSnapshot()).toMatchObject({ values: {}, status: "empty" });
  });
});
