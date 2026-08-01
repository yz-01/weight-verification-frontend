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
export interface EvidenceAsset {
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
