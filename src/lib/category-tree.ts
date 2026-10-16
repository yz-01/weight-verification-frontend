/**
 * 分类组 → 分类 → 子分类 as one list (I11, ID3).
 *
 * The server sends a module's categories flat, each with its group and its
 * parent. Every picker and the management table show them the same way:
 * groups in their order, each category followed by its sub-categories. A
 * picker shows the group as a heading only when there is more than one
 * (「只有一个组时不显示组这一层」).
 *
 * Plain data, no React, so it is tested on its own.
 */

export interface TreeCategory {
  id: string;
  name: string;
  parent?: string | null;
  parent_name?: string | null;
  group?: string | null;
  group_name?: string | null;
  group_module?: string | null;
  group_sort_order?: number;
  group_is_system?: boolean;
  sort_order?: number;
}

export interface TreeGroup<T extends TreeCategory> {
  /** The group id, or "" for categories in no group (old rows). */
  key: string;
  /** What the group is called; blank for a system group - the module's name. */
  name: string;
  module: string | null;
  isSystem: boolean;
  entries: { row: T; depth: 0 | 1 }[];
}

const byOrder = <T extends TreeCategory>(a: T, b: T) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name);

/** The categories as groups, each holding its categories and their sub-categories. */
export function categoryTree<T extends TreeCategory>(rows: readonly T[]): TreeGroup<T>[] {
  const groups = new Map<string, { group: TreeGroup<T>; order: number; rows: T[] }>();
  for (const row of rows) {
    const key = row.group ?? "";
    let entry = groups.get(key);
    if (!entry) {
      entry = {
        group: {
          key,
          name: row.group_name ?? "",
          module: row.group_module ?? null,
          isSystem: Boolean(row.group_is_system) || !key,
          entries: [],
        },
        order: row.group_sort_order ?? 0,
        rows: [],
      };
      groups.set(key, entry);
    }
    entry.rows.push(row);
  }
  const ordered = [...groups.values()].sort(
    (a, b) => Number(b.group.isSystem) - Number(a.group.isSystem) || a.order - b.order,
  );
  for (const { group, rows: members } of ordered) {
    const ids = new Set(members.map((row) => row.id));
    const children = new Map<string, T[]>();
    const tops: T[] = [];
    for (const row of members) {
      if (row.parent && ids.has(row.parent)) {
        children.set(row.parent, [...(children.get(row.parent) ?? []), row]);
      } else {
        tops.push(row);
      }
    }
    for (const top of [...tops].sort(byOrder)) {
      // A sub-category whose parent is not in the list (switched off, left
      // out) stands at the top, named with its parent.
      group.entries.push({ row: top, depth: 0 });
      for (const child of [...(children.get(top.id) ?? [])].sort(byOrder)) {
        group.entries.push({ row: child, depth: 1 });
      }
    }
  }
  return ordered.map(({ group }) => group);
}

/** Whether a picker shows the group headings: only with more than one group. */
export function showsGroups(groups: readonly TreeGroup<TreeCategory>[]): boolean {
  return groups.filter((group) => group.entries.length > 0).length > 1;
}

/**
 * A category as a closed picker shows it: 「电缆 › 4mm 电缆」 for a
 * sub-category, so the choice reads whole once the list is closed.
 */
export function categoryLabel(row: TreeCategory): string {
  return row.parent && row.parent_name ? `${row.parent_name} › ${row.name}` : row.name;
}
