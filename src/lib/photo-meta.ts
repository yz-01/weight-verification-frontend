/**
 * When and where one photograph was taken, as the shared photo viewer shows
 * it (「时间 · GPS」 under the picture).
 *
 * Every photograph the app's own camera takes is sent with its time and GPS,
 * and the server hands both back - but each screen used to copy them into the
 * viewer by hand, and the ones that forgot showed 「未记录时间 · 未记录位置」 on a
 * photo that has both (client 2026-10-09: 「不是用系统里面的相机拍就有了吗」).
 * Every list now reads them through here.
 *
 * - Time: the photo's `captured_at`, else its `taken_at` (the driver, receipt
 *   and dispatch photos call it that).
 * - Position: the photo's own `latitude`/`longitude`, else the record's
 *   (`fallback`) - several modules take one GPS fix for the whole submission
 *   and keep it on the record. A position is never half known: both or none.
 *
 * Empty values stay empty, so a file uploaded from a computer still reads
 * 「未记录位置」 - the only case where that is true.
 */

export interface PhotoMetaSource {
  captured_at?: string | null;
  taken_at?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
}

export interface PhotoMeta {
  takenAt: string | null;
  latitude: string | null;
  longitude: string | null;
}

function coordinate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function position(source: PhotoMetaSource | null | undefined): [string, string] | null {
  if (!source) return null;
  const latitude = coordinate(source.latitude);
  const longitude = coordinate(source.longitude);
  return latitude && longitude ? [latitude, longitude] : null;
}

export function photoMeta(
  photo: PhotoMetaSource | null | undefined,
  fallback?: PhotoMetaSource | null,
): PhotoMeta {
  const where = position(photo) ?? position(fallback);
  return {
    takenAt: photo?.captured_at || photo?.taken_at || null,
    latitude: where ? where[0] : null,
    longitude: where ? where[1] : null,
  };
}

/**
 * The moment a photo was taken, from the file itself.
 *
 * The in-app camera stamps each shot with the moment the shutter closed
 * (`FieldCamera` sets `lastModified` when it draws the frame), and the
 * offline queue keeps that stamp (`storeFile` / `restoreFile`). So a photo
 * queued on site and sent an hour later still says when it was taken - not
 * when it reached the server. Never later than now: a phone clock running
 * fast does not date a photo in the future. A file with no usable time gives
 * nothing, and the server then uses the moment it arrived.
 */
export function photoTakenAt(file: File | undefined, now: number = Date.now()): string | undefined {
  if (!file || !Number.isFinite(file.lastModified) || file.lastModified <= 0) return undefined;
  return new Date(Math.min(file.lastModified, now)).toISOString();
}

/** The earliest of these photos' capture moments: when the record was made. */
export function earliestTakenAt(files: readonly File[], now: number = Date.now()): string | undefined {
  const times = files
    .map((file) => photoTakenAt(file, now))
    .filter((value): value is string => Boolean(value))
    .sort();
  return times[0];
}

/**
 * Each photo's own capture moment on an upload (`photo_captured_at_<n>`), and
 * the record's (`captured_at`, the earliest) when the caller did not set one.
 * The server reads them in that order and falls back to its own clock only
 * for a file that carried no time (2026-10-09 audit: offline-queued material
 * outgoing, waste and sundry photos used to be dated at sync).
 */
export function appendPhotoTimes(data: FormData, files: readonly File[], now: number = Date.now()) {
  files.forEach((file, index) => {
    const taken = photoTakenAt(file, now);
    if (taken) data.append(`photo_captured_at_${index}`, taken);
  });
  const earliest = earliestTakenAt(files, now);
  if (earliest && !data.has("captured_at")) data.append("captured_at", earliest);
}
