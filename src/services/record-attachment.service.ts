import type { AttachableKind, RecordAttachment, RecordAttachments } from "@/interfaces/record-attachment";
import { api, download, fetchObjectUrl, toastSuccess } from "@/services/api-client";

/**
 * The general attachment slot on a record (B28, E10): whoever can open the
 * record can add files to it; each is locked as it lands.
 */
export function getRecordAttachments(kind: AttachableKind, recordId: string): Promise<RecordAttachments> {
  return api.get<RecordAttachments>("/api/record-attachments/get_attachments/", {
    kind,
    record: recordId,
  });
}

export async function uploadRecordAttachments(
  kind: AttachableKind,
  recordId: string,
  files: File[],
  note: string,
): Promise<{ attachments: RecordAttachment[] }> {
  const body = new FormData();
  body.append("kind", kind);
  body.append("record", recordId);
  for (const file of files) body.append("files", file);
  if (note) body.append("note", note);
  const result = await api.post<{ attachments: RecordAttachment[] }>(
    "/api/record-attachments/upload_attachments/",
    body,
  );
  toastSuccess("recordAttachments.toast.added", { count: files.length });
  return result;
}

function query(kind: AttachableKind, recordId: string, row: RecordAttachment, inline: boolean) {
  return { kind, record: recordId, attachment: row.id, ...(inline ? { inline: "1" } : {}) };
}

export function recordAttachmentObjectUrl(kind: AttachableKind, recordId: string, row: RecordAttachment) {
  return fetchObjectUrl("/api/record-attachments/download/", { query: query(kind, recordId, row, true) });
}

export function downloadRecordAttachment(kind: AttachableKind, recordId: string, row: RecordAttachment) {
  return download("/api/record-attachments/download/", {
    query: query(kind, recordId, row, false),
    fallbackFilename: row.original_name,
  });
}

/** JB25: take a file off a record not yet confirmed - PIN, total. */
export async function deleteRecordAttachment(kind: AttachableKind, recordId: string, row: RecordAttachment) {
  const result = await api.delete<{ attachments: RecordAttachment[] }>(
    "/api/record-attachments/delete_attachment/",
    { query: { kind, record: recordId, attachment: row.id } },
  );
  toastSuccess("draftRecords.deleted");
  return result;
}
