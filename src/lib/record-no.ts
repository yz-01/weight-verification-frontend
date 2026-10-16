/**
 * The short number a list shows for a record (2026-10 D4, Q12).
 *
 * Numbers are stored whole - `MR-builder-001-261005-002`: the prefix, the
 * project code, the day (YYMMDD) and that day's sequence. Lists show the part
 * a person reads out and types back - `MR-002` - big, with the project code
 * small underneath; details, exports, PDFs and notifications keep the whole
 * number. Only the display changes, never what is stored.
 *
 * Since I6 (ID21) a record number runs on per project and module -
 * `MI-TRX-P1-004` - so `MI-004` names one record of a project. A list passes
 * the row's project code, so a project code that itself ends in digits is
 * never mistaken for the sequence (ID35).
 *
 * Four shapes are read:
 * - `PREFIX-<project>-NNN`, a running record number (I6; three digits or
 *   more);
 * - `PREFIX-<project>-YYMMDD-NNN`, a daily number from before I6 - kept as
 *   a record's 「旧编号」 - and the documents still numbered by the day;
 * - `PREFIX-<project>-YYMM-NN`, a claim's monthly one (`next_claim_no`);
 * - `<project>-<rest>`, a consultant application numbered from a template
 *   that starts with the project code: the rest is shown big.
 * Anything else - an old or hand-typed number - is shown as it is.
 */

export interface ParsedRecordNo {
  /** What the list shows big, e.g. `MR-002`. */
  short: string;
  /** The project code the number carries, shown small under it. */
  projectCode: string;
}

const DAILY = /^([A-Za-z]+)-(.+)-(\d{6})-(\d{2,})$/;
const MONTHLY = /^([A-Za-z]+)-(.+)-(\d{4})-(\d{2,})$/;
const RUNNING = /^([A-Za-z]+)-(.+)-(\d{3,})$/;
/** What follows `PREFIX-<project>-` when the project code is known. */
const TAIL = /^(?:\d{6}-|\d{4}-)?(\d{2,})$/;

export function parseRecordNo(
  full: string | null | undefined,
  projectCode?: string | null,
): ParsedRecordNo | null {
  const value = (full ?? "").trim();
  if (!value) return null;
  const prefix = /^([A-Za-z]+)-/.exec(value)?.[1];
  if (prefix && projectCode) {
    const stem = `${prefix}-${projectCode}-`;
    const tail = value.startsWith(stem) ? TAIL.exec(value.slice(stem.length)) : null;
    if (tail) return { short: `${prefix}-${tail[1]}`, projectCode };
  }
  if (projectCode && value.startsWith(`${projectCode}-`) && value.length > projectCode.length + 1) {
    return { short: value.slice(projectCode.length + 1), projectCode };
  }
  const match = DAILY.exec(value) ?? MONTHLY.exec(value) ?? RUNNING.exec(value);
  if (match) {
    const sequence = match[match.length - 1];
    return { short: `${match[1]}-${sequence}`, projectCode: projectCode || match[2] };
  }
  return null;
}
