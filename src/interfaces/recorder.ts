/**
 * 记录人 on every record a phone submits (E8, Q31): the server's
 * `core/recorder.py` fields, the material receipt's since 2026-09-05.
 * Whoever can open the record sees the recorder's number.
 */
export interface RecordedBy {
  created_by_name?: string | null;
  /** "" when the account has none. */
  created_by_phone?: string | null;
  /** An absolute URL, or null. */
  created_by_avatar?: string | null;
}
