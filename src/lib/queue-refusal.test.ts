import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import { PHOTO_LOST, refusalReason } from "@/lib/queue-refusal";

/**
 * A refused queued record says why in the worker's words (JB98, 客户 11-05
 * 事项 1, 图 2: the phone showed the server's 「Validation failed.」).
 */
const catalogue = (messages: unknown) => (key: string) => {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string";
};
const has = catalogue(zh);

describe("refusalReason", () => {
  it("uses the server's code when the catalogue words it", () => {
    expect(refusalReason({ status: 400, code: "gate_photo_unreadable" }, has)).toEqual({
      key: "errors.api.gate_photo_unreadable",
    });
  });

  // JB192 做法 二.3: a queued rain record refused for a full half hour, or for
  // a second photo not later than the first, says so plainly - and that it
  // can only be discarded. The fields the 409 carries (limit, minutes) are
  // not read as fields a worker could fix.
  it("words a refused rain record in the queue's own sentences", () => {
    expect(
      refusalReason({ status: 409, code: "rain_record_quota_full", fields: ["limit", "minutes"] }, has),
    ).toEqual({ key: "offline.refused.rainQuotaFull" });
    expect(refusalReason({ status: 400, code: "rain_end_not_after_start" }, has)).toEqual({
      key: "offline.refused.rainEndNotAfterStart",
    });
    for (const messages of [zh, zhTW, en, ms]) {
      const inThis = catalogue(messages);
      for (const key of [
        "offline.refused.rainQuotaFull",
        "offline.refused.rainEndNotAfterStart",
        "offline.kind.RAIN_RECORD",
      ]) {
        expect(inThis(key), key).toBe(true);
      }
    }
    // The queue's own button is 「删除这一条」: the sentence names it.
    expect(zh.offline.refused.rainQuotaFull).toContain("删除这一条");
  });

  it("reads the fields of a generic or codeless refusal", () => {
    expect(
      refusalReason({ status: 400, code: "validation_failed", fields: ["latitude"] }, has),
    ).toEqual({ key: "offline.refused.field.location" });
    expect(refusalReason({ status: 400, code: "", fields: ["members"] }, has)).toEqual({
      key: "offline.refused.field.members",
    });
  });

  it("names a field it has no sentence for in the generic one", () => {
    expect(refusalReason({ status: 400, fields: ["upload_batch"] }, has)).toEqual({
      key: "offline.refused.incomplete",
      values: { field: "upload_batch" },
    });
  });

  it("says what kind of no it was otherwise", () => {
    expect(refusalReason({ status: 403 }, has).key).toBe("offline.conflict.forbidden");
    expect(refusalReason({ status: 404 }, has).key).toBe("offline.conflict.gone");
    expect(refusalReason({ status: 400 }, has).key).toBe("offline.refused.incompleteNoField");
    expect(refusalReason({ code: PHOTO_LOST }, has).key).toBe("offline.refused.photoLost");
    expect(refusalReason({}, has).key).toBe("offline.refused.generic");
  });

  it("has every sentence it can name in all four languages", () => {
    const keys = [
      "offline.refused.photoLost",
      "offline.refused.incomplete",
      "offline.refused.incompleteNoField",
      "offline.refused.generic",
      "offline.refused.retry",
      "offline.refused.delete",
      "offline.refused.deleteTitle",
      "offline.refused.deleteHelp",
      "offline.status.uploadFailed",
      "offline.status.refusedToast",
      ...["photos", "photoDetails", "location", "members", "project", "time"].map(
        (name) => `offline.refused.field.${name}`,
      ),
      ...["required", "unreadable", "too_large", "one_per_record"].map(
        (name) => `errors.api.gate_photo_${name}`,
      ),
    ];
    for (const messages of [zh, zhTW, en, ms]) {
      const inThis = catalogue(messages);
      for (const key of keys) expect(inThis(key), key).toBe(true);
    }
  });
});
