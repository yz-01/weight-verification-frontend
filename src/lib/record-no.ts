/**
 * The short number a list shows for a record (2026-10 D4, Q12).
 *
 * Numbers are stored whole - `MR-builder-001-261005-002`: the prefix, the
 * project code, the day (YYMMDD) and that day's sequence. Lists show the part
 * a person reads out and types back - `MR-002` - big, with the project code
 * small underneath; details, exports, PDFs and notifications keep the whole
 * number. Only the display changes, never what is stored.
 *
 * The sequence restarts every day, so a short number is told apart from
 * another day's by the list's date column, as the spec says.
 *
 * Three shapes are read:
 * - `PREFIX-<project>-YYMMDD-NNN`, every daily document number
 *   (`utils.reference.next_reference` on the backend);
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

export function parseRecordNo(
  full: string | null | undefined,
  projectCode?: string | null,
): ParsedRecordNo | null {
  const value = (full ?? "").trim();
  if (!value) return null;
  const match = DAILY.exec(value) ?? MONTHLY.exec(value);
  if (match) {
    const [, prefix, project, , sequence] = match;
    return { short: `${prefix}-${sequence}`, projectCode: projectCode || project };
  }
  if (projectCode && value.startsWith(`${projectCode}-`) && value.length > projectCode.length + 1) {
    return { short: value.slice(projectCode.length + 1), projectCode };
  }
  return null;
}
