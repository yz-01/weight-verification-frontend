import type { ChatRecordKind } from "@/lib/record-chat";

/**
 * Records that take the general attachment slot: every chat kind, plus an
 * approval and a gate pass (I3), a draft package's uploads and a Progress
 * Claim's letter (JB30).
 */
export type AttachableKind = ChatRecordKind | "APPROVAL" | "GATE_PASS" | "EVIDENCE_PACKAGE" | "CLAIM_LETTER" | "PACKAGE_LETTER";

/** One file in a record's general attachment slot (B28, E10). */
export interface RecordAttachment {
  id: string;
  record_kind: string;
  record_id: string;
  original_name: string;
  content_type: string;
  /** How the browser may show it, or null when it can only be downloaded. */
  preview_type: string | null;
  byte_size: number;
  note: string;
  uploaded_by_name: string | null;
  uploaded_at: string;
  url: string;
}

export interface RecordAttachments {
  kind: string;
  record: string;
  attachments: RecordAttachment[];
  /** Why nothing more can be attached, or "" while the record is open. */
  closed: string;
  /**
   * Whether this reader may add files here: false on a gate pass read with
   * 门禁 view only, and on a company-wide approval (no project to file under).
   * Absent from an older server: then they may.
   */
  can_add?: boolean;
  /** JB25: files here can still be deleted (the record is not confirmed yet). */
  can_delete?: boolean;
  /** JB25: viewed only until the record is confirmed - no download. */
  preview_only?: boolean;
  max_files: number;
  max_bytes: number;
}
