/**
 * One submission, one ``client_event_id`` (P-phonefix): the id kept with the
 * draft when there is one, else a fresh one. A second tap after a 502 / 504 /
 * 413 - the server may have taken the first - is then the same submission,
 * and the server answers it with the record it already has.
 */
export function keptEventId(kept: string | undefined | null, mint: () => string): string {
  return kept || mint();
}
