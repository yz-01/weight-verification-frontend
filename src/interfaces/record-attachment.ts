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
  max_files: number;
  max_bytes: number;
}
