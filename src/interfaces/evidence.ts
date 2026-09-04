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
  created_at: string;
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
