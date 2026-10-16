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

/**
 * The same on a site worker's phone (P-phonefix): at most 20 MB a file and
 * 50 MB in all. A 50 MB drawing over a weak site signal does not arrive; it
 * goes up from the office computer instead (「文件太大，请在电脑后台上传」).
 */
export const HAZARD_PHONE_FILE_BYTES = 20 * 1024 * 1024;
export const HAZARD_PHONE_TOTAL_BYTES = 50 * 1024 * 1024;

export const HAZARD_PHONE_ATTACHMENT_RULE: AttachmentRule = {
  ...HAZARD_ATTACHMENT_RULE,
  maxBytes: HAZARD_PHONE_FILE_BYTES,
  maxTotalBytes: HAZARD_PHONE_TOTAL_BYTES,
};

/** The rule for whoever is picking: a field worker's phone, or the office. */
export function hazardAttachmentRule(fieldMode: boolean): AttachmentRule {
  return fieldMode ? HAZARD_PHONE_ATTACHMENT_RULE : HAZARD_ATTACHMENT_RULE;
}

/** Whether a file is something the screen offers as a hazard attachment. */
export function isHazardAttachment(file: Pick<File, "name" | "type">): boolean {
  return matchesAccept(file, HAZARD_ATTACHMENT_ACCEPT);
}
