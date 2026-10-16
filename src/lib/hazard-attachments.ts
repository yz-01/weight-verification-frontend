import { matchesAccept, type AttachmentRule } from "@/lib/attachment-picker";

/**
 * What a hazard report or a rectification takes beside its photos (I37):
 * PDF, Word, Excel and pictures. The server's list is wider (it is the one
 * material requests use); this is what the screen offers, and the limits are
 * the server's (10 files, 50 MB each).
 */
export const HAZARD_ATTACHMENT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,image/*";

export const HAZARD_ATTACHMENT_RULE: AttachmentRule = {
  accept: HAZARD_ATTACHMENT_ACCEPT,
  maxFiles: 10,
  maxBytes: 50 * 1024 * 1024,
  multiple: true,
};

/** Whether a file is something the screen offers as a hazard attachment. */
export function isHazardAttachment(file: Pick<File, "name" | "type">): boolean {
  return matchesAccept(file, HAZARD_ATTACHMENT_ACCEPT);
}
