/**
 * The catalogue key a record row is named by (B10).
 *
 * A material receipt filed as a return (退场) is one kind on the server - it
 * is still a `MaterialReceipt` - but every screen used to name it 材料进场,
 * which is how 「分类显示退场，打开却为进场记录」 happened. The row now says
 * which way it went, and this turns that into `archiveQueue.kind.MATERIAL_RETURN`
 * (the same words the PDF prints).
 */
export function recordKindKey(row: { kind: string; movement_type?: string | null }): string {
  return row.kind === "MATERIAL_RECEIPT" && row.movement_type === "RETURN"
    ? "MATERIAL_RETURN"
    : row.kind;
}
