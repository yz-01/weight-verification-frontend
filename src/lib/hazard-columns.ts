/**
 * Which columns the 上报隐患 form offers, and the title it writes (2026-10-10).
 *
 * 施工准证申请 left the hazard form: it is its own module (施工准证), with one
 * slot for the company's own form and its own approver. Offered here it put
 * the hazard form's four site prompts (事故区域全景…) and its 「上报隐患」
 * button in front of somebody filing a permit.
 */

/** The 施工准证申请 column every project starts with (C20). */
export const PERMIT_COLUMN_CODE = "HZD-PERMIT";
/**
 * 「VO 不在手机 EHS，也不叫『整改 VO』」 (E07). The seeded column was switched
 * off on the server; the phone never offers it even if a site turns it back on.
 */
export const RETIRED_VO_COLUMN_CODE = "HZD-VO";

/** The columns a hazard may be raised under, on the phone or in the office. */
export function hazardColumns<T extends { code: string; is_visible_in_pwa?: boolean }>(
  columns: readonly T[],
  fieldMode: boolean,
): T[] {
  return columns.filter(
    (column) =>
      column.code !== RETIRED_VO_COLUMN_CODE &&
      column.code !== PERMIT_COLUMN_CODE &&
      // A column hidden from the phone stays hidden on it.
      !(fieldMode && column.is_visible_in_pwa === false),
  );
}

/**
 * The title after the column changes.
 *
 * The form used to fill the title from the first column picked and never
 * again: switch to another column and the old name stayed - and the phone,
 * which has no title field, sent it anyway. That is how permits came to be
 * called 「安全部整改」 and 「顾问要求整改」. A title that is empty or is
 * some column's name was written by the form, so it follows the column; one
 * somebody typed is kept.
 */
export function titleForColumn(
  current: string,
  columnNames: readonly string[],
  nextColumnName: string,
): string {
  const typed = current.trim();
  if (!typed || columnNames.some((name) => name.trim() === typed)) return nextColumnName;
  return current;
}
