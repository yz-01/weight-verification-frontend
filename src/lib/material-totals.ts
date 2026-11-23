/**
 * Material quantities on screen, per material + specification + unit
 * (JB232, 客户 2026-11-20 事项 4, 图 4):
 *
 * 「即使单位相同，只要材料名称或规格不同，也不能直接相加。请按照『材料名称＋规格
 * ＋单位』分别统计累计数量。只有材料名称、规格及单位一致的记录才允许累计。」
 *
 * The server already groups on those three; these helpers only word a group,
 * so G15 and G25 concrete never read as one material on a card or a bar.
 */

export interface MaterialQuantity {
  material_name: string;
  material_specification: string;
  unit: string;
  quantity: string | number;
}

/** 「钢筋 Y12」, or the name alone when the specification is empty. */
export function materialLineLabel(row: {
  material_name: string;
  material_specification?: string | null;
}): string {
  const name = (row.material_name ?? "").trim();
  const spec = (row.material_specification ?? "").trim();
  return spec ? `${name} ${spec}` : name;
}

/**
 * One card's quantities: 「钢筋 Y12 5 吨, 钢筋 Y16 3 吨」 - every material line
 * its own figure, nothing added across them. "0" when there is none.
 */
export function cardQuantityText(
  rows: MaterialQuantity[],
  unitName: (unit: string) => string,
  separator = ", ",
): string {
  if (rows.length === 0) return "0";
  return rows
    .map((row) => `${materialLineLabel(row)} ${row.quantity} ${unitName(row.unit)}`.trim())
    .join(separator);
}

/** The separator between card lines in the reader's language: 「，」 in Chinese, ", " otherwise. */
export function listSeparator(locale: string): string {
  return locale.startsWith("zh") ? "，" : ", ";
}

/** The distinct units of `rows`, in the order they first appear. */
export function unitsOf(rows: Array<{ unit: string }>): string[] {
  return [...new Set(rows.map((row) => row.unit))];
}
