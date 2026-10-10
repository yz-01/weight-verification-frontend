/**
 * 「分享」 (2026-10 C11): a record handed to WhatsApp, email or whatever the
 * phone offers. The file itself goes through `shareFile` (lib/file-actions,
 * PDF 统一操作规则 2026-10-10); this is the record's own address, offered
 * beside the file for colleagues who sign in.
 *
 * The link opens the record in the system: the download itself needs the
 * reader's session, so a copied download address would only fail for the
 * person it was sent to.
 */

/** An address inside the app, made absolute for someone else to open. */
export function absoluteUrl(href: string): string {
  if (typeof window === "undefined") return href;
  return new URL(href, window.location.origin).toString();
}
