/**
 * Why the server refused a record this phone kept, in the worker's words (JB98).
 *
 * 客户 11-05 事项 1 (图 2): a 门岗 photo kept on the phone was refused with the
 * server's own 「Validation failed.」 - English, and naming nothing - so the
 * guard could neither read why nor do anything about it. A refusal is worded
 * from what the phone kept of it: the server's code when the catalogue has
 * wording for it, else the fields it named, else what kind of no it was. One
 * function for every kind of queued record, read by the 「已暂存」 popover and
 * stored as the job's sentence for the other screens.
 */

export interface RefusalFacts {
  status?: number;
  code?: string;
  /** The fields a 400 named (`ApiError.errors` keys). */
  fields?: string[];
}

export interface RefusalReason {
  key: string;
  values?: Record<string, string>;
  /**
   * The server's own sentence, when it said something specific (a coded
   * refusal is already worded in the worker's language by the API client):
   * shown as it is, in place of `key`.
   */
  text?: string;
}

/** What a refusal's reason reads as, given a translator. */
export function wordRefusal(
  reason: RefusalReason,
  translate: (key: string, values?: Record<string, string>) => string,
): string {
  return reason.text || translate(reason.key, reason.values);
}

/** A refusal made on the phone itself: a kept photo it can no longer read. */
export const PHOTO_LOST = "photo_lost";

/**
 * The common fields, each with a sentence saying what to do. Several server
 * names share one: a worker does not care whether the bad number was the
 * record's latitude or the photo's.
 */
const FIELD_REASONS: Record<string, string> = {
  photos: "photos",
  photo: "photos",
  image: "photos",
  evidence_photos: "photos",
  photo_meta: "photoDetails",
  latitude: "location",
  longitude: "location",
  accuracy_m: "location",
  location_accuracy_m: "location",
  members: "members",
  project: "project",
  occurred_at: "time",
  captured_at: "time",
};

/** Codes whose catalogue wording speaks of red-marked fields, not of a queue. */
const GENERIC_CODES = new Set(["validation_failed", ""]);

/**
 * Refusals a queued record can only be discarded after (JB192 做法 二.3): a
 * rain record refused because its project's half hour was full, or because
 * its second photo is not later than its first, would be refused again. The
 * queue's sentence says so, in place of the API's.
 */
export const QUEUE_CODE_REASONS: Record<string, string> = {
  rain_record_quota_full: "offline.refused.rainQuotaFull",
  rain_end_not_after_start: "offline.refused.rainEndNotAfterStart",
};

/**
 * The message key (and its values) for one refusal.
 *
 * `has` says whether the catalogue holds a key, so a code the frontend has
 * no wording for falls through to the fields instead of printing a key path.
 */
export function refusalReason(
  facts: RefusalFacts,
  has: (key: string) => boolean,
): RefusalReason {
  const code = facts.code ?? "";
  if (code === PHOTO_LOST) return { key: "offline.refused.photoLost" };
  const queueKey = QUEUE_CODE_REASONS[code];
  if (queueKey && has(queueKey)) return { key: queueKey };
  if (!GENERIC_CODES.has(code) && has(`errors.api.${code}`)) {
    return { key: `errors.api.${code}` };
  }
  const fields = facts.fields ?? [];
  if (facts.status === 400 && fields.length > 0) {
    for (const field of fields) {
      const reason = FIELD_REASONS[field];
      if (reason) return { key: `offline.refused.field.${reason}` };
    }
    return { key: "offline.refused.incomplete", values: { field: fields.join(", ") } };
  }
  if (facts.status === 403) return { key: "offline.conflict.forbidden" };
  if (facts.status === 404) return { key: "offline.conflict.gone" };
  if (facts.status === 409) return { key: "offline.conflict.changed" };
  if (facts.status === 400) return { key: "offline.refused.incompleteNoField" };
  return { key: "offline.refused.generic" };
}
