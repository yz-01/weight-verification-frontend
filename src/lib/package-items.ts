/**
 * Small rules about the records in a Multi Engine package (JB193), kept in
 * one place so the package sheet, the consultant's page, the conversation and
 * the owner's link page cannot drift apart.
 */

/**
 * The `multiEngine.kind.*` key of one package record (JB193 五 2: 「资料包里每一
 * 笔写它是哪一种（「日报告」「文件档案」「出入场（按日）」「材料领用」）」): its kind's,
 * except a material outgoing that is a MIN (`outgoing_kind` `ISSUE`), which is
 * 「材料领用」 - on the server both are `MATERIAL_OUTGOING` (JB193 一 4).
 */
export function packageKindKey(item: {
  record_kind: string;
  outgoing_kind?: string | null;
}): string {
  if (item.record_kind === "MATERIAL_OUTGOING" && item.outgoing_kind === "ISSUE") {
    return "MATERIAL_ISSUE";
  }
  return item.record_kind;
}

/** A `multiEngine` translator: the words, and whether there are any. */
export interface KindTranslator {
  (key: string): string;
  has: (key: string) => boolean;
}

/**
 * One package record's kind in words, from a `useTranslations("multiEngine")`.
 * A kind this screen has no words for shows its code rather than breaking the
 * page (a newer server, an older browser tab).
 */
export function packageKindName(
  t: KindTranslator,
  item: { record_kind: string; outgoing_kind?: string | null },
): string {
  const key = `kind.${packageKindKey(item)}`;
  if (t.has(key)) return t(key);
  const plain = `kind.${item.record_kind}`;
  return t.has(plain) ? t(plain) : item.record_kind;
}

/**
 * The files of a record that always go into the package (JB193 二 3, 三 4: 「这份
 * PDF / 这些文件是这一笔的本体，一定会放进去，不能取消勾选」) - `fixed: true` -
 * are never sent as unticked: whatever was ticked, they are in. A selection
 * that does not name its files at all already means every file.
 */
export function withFixedFiles<S extends { files?: string[] }>(
  selection: S,
  files: ReadonlyArray<{ id: string; fixed?: boolean }> | undefined,
): S {
  const fixed = (files ?? []).filter((file) => file.fixed).map((file) => file.id);
  const chosen = selection.files;
  if (!fixed.length || chosen === undefined) return selection;
  const missing = fixed.filter((id) => !chosen.includes(id));
  return missing.length ? { ...selection, files: [...chosen, ...missing] } : selection;
}
