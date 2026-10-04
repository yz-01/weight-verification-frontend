import type { RecordAttachment, RecordAttachments } from "@/interfaces/record-attachment";
import type { ChatRecordKind } from "@/lib/record-chat";
import { api, download, fetchObjectUrl, toastSuccess } from "@/services/api-client";

/**
 * The general attachment slot on a record (B28, E10): whoever can open the
 * record can add files to it; each is locked as it lands.
 */
export function getRecordAttachments(kind: ChatRecordKind, recordId: string): Promise<RecordAttachments> {
  return api.get<RecordAttachments>("/api/record-attachments/get_attachments/", {
    kind,
    record: recordId,
  });
}

export async function uploadRecordAttachments(
  kind: ChatRecordKind,
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

function query(kind: ChatRecordKind, recordId: string, row: RecordAttachment, inline: boolean) {
  return { kind, record: recordId, attachment: row.id, ...(inline ? { inline: "1" } : {}) };
}

export function recordAttachmentObjectUrl(kind: ChatRecordKind, recordId: string, row: RecordAttachment) {
  return fetchObjectUrl("/api/record-attachments/download/", { query: query(kind, recordId, row, true) });
}

export function downloadRecordAttachment(kind: ChatRecordKind, recordId: string, row: RecordAttachment) {
  return download("/api/record-attachments/download/", {
    query: query(kind, recordId, row, false),
    fallbackFilename: row.original_name,
  });
}
