/**
 * MR / Other Request types (I16, ID36, ID37): pure helpers the screens share.
 *
 * Types are per project, and every project starts with the same five names,
 * so across projects 「设备申请」 is several rows with one name. The list's
 * filter on 「全部项目」 offers each name once and filters by name.
 */

export interface NamedType {
  name: string;
  /** The name in the reader's language (JB293 QA: 「Material Request」 in English). */
  display_name?: string;
  sort_order: number;
}

/** Each type name once, in the order the projects keep them. */
export function requestTypeNameOptions(rows: readonly NamedType[]): { value: string; label: string }[] {
  const seen = new Map<string, number>();
  const shown = new Map<string, string>();
  for (const row of rows) {
    const order = seen.get(row.name);
    if (order === undefined || row.sort_order < order) seen.set(row.name, row.sort_order);
    if (!shown.has(row.name)) shown.set(row.name, row.display_name || row.name);
  }
  // Filtered by the stored name; shown in the reader's language (JB293 QA).
  return [...seen.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([name]) => ({ value: name, label: shown.get(name) ?? name }));
}

/** A new type's name, trimmed, and whether it is already on this project's list. */
export function newTypeName(name: string, existing: readonly { name: string }[]): { name: string; taken: boolean } {
  const trimmed = name.trim();
  const key = trimmed.toLocaleLowerCase();
  return { name: trimmed, taken: Boolean(trimmed) && existing.some((row) => row.name.trim().toLocaleLowerCase() === key) };
}
