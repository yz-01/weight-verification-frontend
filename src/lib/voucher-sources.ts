/**
 * Where a payment voucher can come from (T-399, D-282).
 *
 * Finance's voucher is usually already on the screen somewhere else: a bank
 * app screenshot on the clipboard, a file in the downloads folder, or the
 * photo the applicant already sent in the claim's own conversation. Making
 * them save it and browse for it again is the step this removes.
 *
 * Pure so the two decisions that are easy to get wrong - which files out of a
 * paste or drop count, and which chat messages can be picked - are tested
 * without a browser.
 */

/** The part of a `DataTransfer` (paste or drop) these helpers read. */
export interface TransferLike {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{
    kind: string;
    type: string;
    getAsFile(): File | null;
  }> | null;
}

const isImage = (file: File | null | undefined): file is File =>
  Boolean(file && file.type.startsWith("image/"));

/**
 * The image files carried by a paste or a drop, in order.
 *
 * `files` first: a drop from the file manager and a pasted screenshot both
 * fill it in current browsers. `items` is the fallback for a browser that
 * only exposes a pasted image there - reading both would count the same
 * screenshot twice. Anything that is not an image (a PDF, text copied from a
 * chat) is left out, because the voucher field takes images only.
 */
export function imageFilesFrom(transfer: TransferLike | null | undefined): File[] {
  if (!transfer) return [];
  const files = Array.from(transfer.files ?? []);
  if (files.length > 0) return files.filter(isImage);
  return Array.from(transfer.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(isImage);
}

/** Whether a paste or drop carried files at all, images or not. */
export function carriesFiles(transfer: TransferLike | null | undefined): boolean {
  if (!transfer) return false;
  if (Array.from(transfer.files ?? []).length > 0) return true;
  return Array.from(transfer.items ?? []).some((item) => item.kind === "file");
}

/** One conversation message as far as picking a voucher from it is concerned. */
export interface PickableMessage {
  id: string;
  author_name: string;
  sent_at: string;
  photo: string | null;
  watermarked_photo?: string | null;
}

/**
 * The conversation photos that can be picked as the voucher.
 *
 * Only messages that carry a photograph: the server copies `photo` from the
 * message it is given and refuses a message without one. The thumbnail shows
 * the watermarked copy when there is one, as the conversation itself does.
 * Newest first, because the voucher is usually the last thing sent.
 */
export function pickablePhotos(messages: readonly PickableMessage[] | null | undefined) {
  return (messages ?? [])
    .filter((message) => Boolean(message.photo))
    .map((message) => ({
      id: message.id,
      url: (message.watermarked_photo || message.photo) as string,
      author: message.author_name,
      sentAt: message.sent_at,
    }))
    .reverse();
}

export type PickablePhoto = ReturnType<typeof pickablePhotos>[number];

/** What the voucher area holds before it is uploaded. */
export type VoucherChoice =
  | { source: "file"; file: File }
  | { source: "chat"; photo: PickablePhoto };

/** What `add_payment_proof` is sent for a choice: a file, or the message id. */
export function voucherPayload(choice: VoucherChoice): { file: File } | { message: string } {
  return choice.source === "file" ? { file: choice.file } : { message: choice.photo.id };
}
