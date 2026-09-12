import { describe, expect, it } from "vitest";

import { summariseQueuedPayload } from "@/services/offline-sync.service";

/**
 * What a worker sees when they open a submission still on their phone (T-210).
 *
 * AC-205 asks that 「待上传与上传失败的条目点进去能看到本地内容与失败原因」. The
 * failure reason is a string that was already stored and simply never read
 * (F-230); the *local content* is the hard half, because a queued payload is
 * shaped for the API, not for a person. It holds project and category **ids**,
 * device ids, client event ids and coordinates alongside the two or three
 * things the worker actually typed.
 *
 * So the payload is not walked and dumped. An allow-list decides what surfaces,
 * and every entry on it maps to a label the catalogue already has - checked
 * across all four languages by `core.tests.test_submission_labels`, because
 * next-intl prints the key path for a missing key and that is how
 * `PENDING_APPROVAL` reached a customer's screen (F-225).
 *
 * This is a unit test rather than a browser one, and that is a deliberate
 * boundary worth stating: producing a *queued* row in a real browser means
 * taking photographs through a fake media stream with the network off, which
 * would test the camera harness more than this logic. The rendering half is
 * the same `FieldRows` component the stored sheet uses, and that one is
 * exercised in `e2e/my-submissions-mobile.spec.ts`. What could realistically
 * be wrong here is which keys surface - so that is what is asserted.
 */

/** A `StoredFile`, the shape the queue keeps a photograph in. */
function stored(name: string) {
  return {
    blob: new Blob([name], { type: "image/jpeg" }),
    name,
    type: "image/jpeg",
    lastModified: 0,
  };
}

describe("a queued submission opened on the phone (T-210)", () => {
  it("finds the fields a receipt nests one level down", () => {
    // `MATERIAL_RECEIPT` is the only kind that nests, which is why the walk
    // goes two levels rather than one.
    const { fields } = summariseQueuedPayload({
      receipt: {
        project: "3f1c-uuid",
        material_name: "1200mm pipe",
        material_specification: "Class 2",
        quantity: "6.00",
        unit: "PIECE",
        received_by_name: "Ah Seng",
        notes: "Left at the rear gate.",
        client_event_id: "evt-1",
        latitude: "3.139",
      },
      deviceId: "device-1",
      sitePhotos: [stored("a.jpg")],
    });

    const byKey = Object.fromEntries(fields.map((row) => [row.key, row.value]));
    expect(byKey.material_name).toBe("1200mm pipe");
    expect(byKey.specification).toBe("Class 2");
    expect(byKey.received_by_name).toBe("Ah Seng");
    expect(byKey.note).toBe("Left at the rear gate.");
  });

  it("keeps a quantity with its unit", () => {
    // A number with no unit is not an answer, and the unit is a code the
    // phone translates - never an English word from the queue.
    const { fields } = summariseQueuedPayload({
      quantity: "2.500",
      unit: "TONNE",
    });

    expect(fields).toEqual([
      { key: "quantity", value: "2.500", unit: "TONNE" },
    ]);
  });

  it("shows nothing that is an id, a coordinate or a device", () => {
    // The whole reason for the allow-list: a worker reading a UUID where
    // "Mixed waste" belongs has learnt nothing, and been told something.
    const { fields } = summariseQueuedPayload({
      project: "11111111-1111-4111-8111-111111111111",
      category: "22222222-2222-4222-8222-222222222222",
      field_task: "33333333-3333-4333-8333-333333333333",
      client_event_id: "evt-9",
      device_id: "device-9",
      latitude: "3.139",
      longitude: "101.6869",
      note: "Offcuts from level three.",
    });

    expect(fields).toEqual([
      { key: "note", value: "Offcuts from level three." },
    ]);
  });

  it("does not show a severity, because it is stored as a code", () => {
    // `HIGH` on a screen is the same defect as `PENDING_APPROVAL` (F-225).
    // Until it has a translated label it stays off the sheet.
    const { fields } = summariseQueuedPayload({
      title: "Loose board",
      description: "Photographed on level three.",
      severity: "HIGH",
    });

    expect(fields.map((row) => row.key).sort()).toEqual([
      "description",
      "title",
    ]);
  });

  it("collects photographs from a single field and from a list", () => {
    // A receipt keeps its signature in its own field and its site shots in an
    // array. Both are the worker's evidence, so both have to come back.
    const { photos } = summariseQueuedPayload({
      signature: stored("sig.jpg"),
      supplierSignature: stored("supplier.jpg"),
      sitePhotos: [stored("one.jpg"), stored("two.jpg")],
      note: "text, not a photo",
    });

    expect(photos).toHaveLength(4);
    for (const blob of photos) expect(blob).toBeInstanceOf(Blob);
  });

  it("skips blank values rather than showing an empty row", () => {
    const { fields } = summariseQueuedPayload({ note: "   ", title: "" });

    expect(fields).toEqual([]);
  });

  it("answers safely for a payload that is not an object", () => {
    // A job written by an older build, or a corrupt row: an empty sheet is a
    // poor answer, but a crash on the history screen is a worse one.
    expect(summariseQueuedPayload(null)).toEqual({ fields: [], photos: [] });
    expect(summariseQueuedPayload("nonsense")).toEqual({
      fields: [],
      photos: [],
    });
  });
});
