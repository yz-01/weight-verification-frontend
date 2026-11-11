/**
 * English words the app itself writes into records, worded where they are
 * shown (JB159 F, JB164). The stored text stays as it is - old and new rows
 * hold the same words - and only the screen says it in the reader's language.
 * The server words its own PDFs and spreadsheets the same way.
 *
 * Kept in this small file, away from the big record workspaces, so a page
 * that only shows one of these words does not load them.
 */

/**
 * What the phone files as a disposal's 工地位置: it takes the GPS fix, not a
 * typed place. 「GPS captured site location」 stood on Chinese screens and in
 * both PDFs (JB159; the server words its own PDFs,
 * ``contractor_ops/pdf_words.site_location``), and on the office's field-task
 * sheet that copies it as 工作位置 (JB164).
 */
export const GPS_SITE_LOCATION = "GPS captured site location";

/** A disposal's 工地位置 as the reader reads it. */
export function siteLocationText(value: string, gpsWords: string): string {
  return value === GPS_SITE_LOCATION ? gpsWords : value;
}

/**
 * The captions `submitMaterialReceipt` gives a receipt's photos (JB164,
 * screens 11-10: 「Arriving vehicle」「Unloading process」「Empty vehicle after
 * unloading」 printed under a Chinese 材料进场). Each maps to its key in
 * `recordedWords`.
 */
export const RECEIPT_PHOTO_CAPTIONS = {
  "Arriving vehicle": "arrivingVehicle",
  "Unloading process": "unloadingProcess",
  "Empty vehicle after unloading": "emptyVehicle",
  "Other site photo": "otherSitePhoto",
  "Delivery Order": "deliveryOrder",
} as const;

export type RecordedCaptionKey = (typeof RECEIPT_PHOTO_CAPTIONS)[keyof typeof RECEIPT_PHOTO_CAPTIONS];

/**
 * A photo's caption as the reader reads it: one of the receipt's own English
 * captions in the reader's words (`words` is `useTranslations("recordedWords")`),
 * anything a person typed as typed.
 */
export function photoCaptionText(caption: string, words: (key: RecordedCaptionKey) => string): string;
export function photoCaptionText(caption: string | null | undefined, words: (key: RecordedCaptionKey) => string): string | null | undefined;
export function photoCaptionText(caption: string | null | undefined, words: (key: RecordedCaptionKey) => string) {
  if (!caption) return caption;
  const key = RECEIPT_PHOTO_CAPTIONS[caption.trim() as keyof typeof RECEIPT_PHOTO_CAPTIONS];
  return key ? words(key) : caption;
}
