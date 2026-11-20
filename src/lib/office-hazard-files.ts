/**
 * 「照片和整改文件」 on the office's 建立整改事项 (JB223, 客户 11-19 事项 3).
 *
 * 「顾问在办公室使用电脑后台要求整改，怎么可能到现场拍照？」 - so at a desk the
 * form takes what is already on the computer: photos, WhatsApp pictures and
 * screenshots, PDF / Word / Excel. One box (an older user puts everything in
 * one place); sorted behind the scenes when it is sent:
 *
 * - a picture the browser can shrink (JPEG, PNG, WebP) is one of the item's
 *   own photos - its list thumbnail, 整改前, the stamped photos of the PDF;
 * - everything else - PDF, Word, Excel, and a HEIC / GIF / BMP the browser
 *   cannot redraw - is a file said in the item's 整改沟通 (I37).
 *
 * None is required: 「照片改为选填，不应强制拍照」.
 */

import type { AttachmentRule, Refusal } from "@/lib/attachment-picker";

/** Photos on one item from the office: a sane upload, our number (the server keeps it too). */
export const OFFICE_HAZARD_MAX_PHOTOS = 10;
/** The server's own ceiling for files with one report (MAX_RECORD_ATTACHMENTS). */
export const OFFICE_HAZARD_MAX_DOCUMENTS = 10;
export const OFFICE_HAZARD_FILE_BYTES = 50 * 1024 * 1024;

/**
 * What the box offers: exactly what the server takes from it (11-19 audit F4),
 * by ending, as the server judges. PDF, Word, Excel; pictures sent as photos
 * (JPEG - `.jfif` is how Chrome on Windows saves one -, PNG, WebP); pictures
 * sent as files (GIF, BMP, HEIC). Not `image/*`: a scanner's TIFF, an SVG or
 * an AVIF passed the box and was refused by the server afterwards.
 */
export const OFFICE_HAZARD_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.jfif,.png,.webp,.gif,.bmp,.heic,.heif";

/** The box as a whole; the two ceilings above are kept by `capOfficeHazardFiles`. */
export const OFFICE_HAZARD_FILE_RULE: AttachmentRule = {
  accept: OFFICE_HAZARD_ACCEPT,
  maxFiles: OFFICE_HAZARD_MAX_PHOTOS + OFFICE_HAZARD_MAX_DOCUMENTS,
  maxBytes: OFFICE_HAZARD_FILE_BYTES,
  multiple: true,
};

const PHOTO_TYPE = /^image\/(jpe?g|png|webp)$/i;
const PHOTO_NAME = /\.(jpe?g|jfif|png|webp)$/i;

/** A refusal from the office box: `photo` says which ceiling a `count` one met (F8). */
export type OfficeRefusal = Refusal & { photo?: boolean };

/** One of the item's own photos, rather than a file in its room. */
export function isItemPhoto(file: Pick<File, "name" | "type">): boolean {
  if (file.type) return PHOTO_TYPE.test(file.type);
  return PHOTO_NAME.test(file.name);
}

/** The box, sorted for the server: the item's photos, and the files that follow it. */
export function splitOfficeHazardFiles(files: readonly File[]): { photos: File[]; attachments: File[] } {
  return {
    photos: files.filter(isItemPhoto),
    attachments: files.filter((file) => !isItemPhoto(file)),
  };
}

/**
 * The box within its two ceilings (the picker's `fit`): what it keeps, in
 * order, and each file that did not fit - always the newest, since what was
 * already in the box was within them. An empty file (0 bytes) is turned
 * away at once (11-19 audit F4): the server refuses it, by name, anyway.
 */
export function capOfficeHazardFiles(files: readonly File[]): { files: File[]; refused: OfficeRefusal[] } {
  let photos = 0;
  let documents = 0;
  const kept: File[] = [];
  const refused: OfficeRefusal[] = [];
  for (const file of files) {
    if (file.size === 0) {
      refused.push({ kind: "empty", name: file.name });
      continue;
    }
    const photo = isItemPhoto(file);
    const room = photo ? photos < OFFICE_HAZARD_MAX_PHOTOS : documents < OFFICE_HAZARD_MAX_DOCUMENTS;
    if (!room) {
      // The same decision that sorted it, carried to the sentence (F8).
      refused.push({ kind: "count", name: file.name, photo });
      continue;
    }
    if (photo) photos += 1;
    else documents += 1;
    kept.push(file);
  }
  return { files: kept, refused };
}

/** Which ceiling a file met: the sentence that says so. */
export function officeCeilingKey(item: OfficeRefusal): "tooManyPhotos" | "tooManyDocuments" {
  const photo = item.photo ?? isItemPhoto({ name: item.name, type: "" });
  return photo ? "tooManyPhotos" : "tooManyDocuments";
}
