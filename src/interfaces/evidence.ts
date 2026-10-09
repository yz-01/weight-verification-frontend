export type EvidenceKind =
  | "PHOTO"
  | "VIDEO"
  | "SIGNATURE"
  | "DOCUMENT"
  | "OTHER";

export const EVIDENCE_KINDS: EvidenceKind[] = [
  "PHOTO",
  "VIDEO",
  "SIGNATURE",
  "DOCUMENT",
  "OTHER",
];

/** An immutable snapshot of an uploaded file and its capture context. */
export type EvidenceReviewState = "SUBMITTED" | "ACCEPTED" | "RETURNED";

export interface EvidenceAsset {
  /**
   * Where a site photo stands with its reviewer, or null when the evidence is
   * not a photo submission - waste-outgoing and progress evidence carry their
   * own approvals elsewhere.
   *
   * Browsing a category shows only accepted photos; this exists so the wider
   * archive can still surface a returned one and say plainly that it was
   * returned, rather than showing it as though it had been filed.
   */
  review_state: EvidenceReviewState | null;
  id: string;
  company: string;
  company_name: string;
  project: string | null;
  project_name: string | null;
  actor: string | null;
  actor_name: string | null;
  source_model: string;
  source_id: string;
  field_name: string;
  kind: EvidenceKind;
  file: string;
  watermarked_file: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  captured_at: string;
  uploaded_at: string;
  latitude: string | null;
  longitude: string | null;
  device_id: string;
  watermark_text: string;
  watermark: Record<string, unknown>;
  metadata: Record<string, unknown>;
  archive_category_id: string | null;
  archive_category_code: string;
  archive_category_name: string;
  archive_category_path: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  supersedes: string | null;
  /** The photo's full original, when the phone kept one (H5 三, WP1). */
  original?: EvidenceOriginal | null;
  created_at: string;
}

/**
 * Where one photo's original stands (H5 三.5). Only the server says
 * `ORIGINAL_BACKED_UP`, after it stored and re-hashed the bytes.
 */
export type OriginalStatus =
  | "APPLICATION_UPLOADED"
  | "ORIGINAL_PENDING"
  | "ORIGINAL_BACKED_UP"
  | "ORIGINAL_FAILED";

/** A record's originals, as `my_submissions` sends them. */
export interface OriginalBackupSummary {
  status: OriginalStatus;
  expected: number;
  backed_up: number;
  failed: number;
  pending: number;
  /** The originals not yet backed up, so the phone can find the ones it holds. */
  waiting_sha256: string[];
  waiting_bytes: number;
}

/** One person's originals on the technical page (`get_backup_overview`). */
export interface OriginalBackupPerson {
  user_id: string | null;
  name: string;
  email: string;
  /** Declared, not arrived: only that person's phone holds the bytes. */
  pending: number;
  failed: number;
  backed_up: number;
  /** Bytes still owed (pending + failed). */
  owed_bytes: number;
  oldest_owed_at: string | null;
  last_failed_at: string | null;
  last_backed_up_at: string | null;
  last_error: string;
}

export interface OriginalBackupOverview {
  totals: { pending: number; failed: number; backed_up: number; owed_bytes: number };
  people: OriginalBackupPerson[];
}

/** The evidence ledger's view of one row's original. */
export interface EvidenceOriginal {
  status: OriginalStatus;
  expected_sha256: string;
  expected_size_bytes: number;
  sha256: string | null;
  size_bytes: number | null;
  content_type: string | null;
  declared_at: string;
  uploaded_at: string | null;
  verified_at: string | null;
  attempts: number;
  last_error: string | null;
}

/** `verify_integrity`'s part for the original; null when none is kept. */
export interface OriginalIntegrity {
  present: boolean;
  status: OriginalStatus;
  valid: boolean | null;
  unavailable?: boolean;
  hash_matches?: boolean;
  size_matches?: boolean;
  stored_sha256?: string;
  current_sha256?: string;
  stored_size_bytes?: number | null;
  current_size_bytes?: number;
}

export interface EvidenceIntegrityResult {
  id: string;
  valid: boolean;
  hash_matches: boolean;
  size_matches: boolean;
  stored_sha256: string;
  current_sha256: string;
  stored_size_bytes: number;
  current_size_bytes: number;
  /** The original, checked with its photo (WP1). */
  original?: OriginalIntegrity | null;
  verified_at: string;
}

/**
 * What can be decided about a piece of evidence.
 *
 * The asset is immutable, so none of these edit it. HIDE takes it out of the
 * archive's default view, RESTORE puts it back, REPLACE points at the asset
 * that supersedes it, and CORRECT records that the surrounding facts were
 * wrong while the file itself stands.
 */
export type EvidenceRevisionAction = "HIDE" | "RESTORE" | "REPLACE" | "CORRECT";

export interface EvidenceRevision {
  id: string;
  asset: string;
  action: EvidenceRevisionAction;
  reason: string;
  actor: string | null;
  actor_name: string | null;
  replacement: string | null;
  replacement_filename: string | null;
  created_at: string;
}

export interface EvidenceRevisionPayload {
  action: EvidenceRevisionAction;
  reason: string;
  /** Required by the API for REPLACE, and meaningless for the others. */
  replacement?: string | null;
}
