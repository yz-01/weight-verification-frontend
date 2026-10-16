/**
 * The files an application attachment takes: the server's one list
 * (`utils/attachment_files.py`), so the chooser and the server agree.
 */
export const ATTACHMENT_ACCEPT =
  ".jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.bmp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.dwg,.zip";

/** An `accept` string said to a person: "PDF, DOC, JPG ...". */
export function allowedLabel(accept: string): string {
  return accept
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => (token === "image/*" ? "JPG, PNG" : token.replace(/^\./, "").toUpperCase()))
    .join(", ");
}
