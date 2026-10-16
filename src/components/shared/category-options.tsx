"use client";

import { useTranslations } from "next-intl";
import { Fragment } from "react";

import { SelectGroup, SelectItem, SelectLabel, SelectSeparator } from "@/components/ui/select";
import { categoryTree, showsGroups, type TreeCategory } from "@/lib/category-tree";

/** The module key each 分类组 module is named by (`categoryManagement.module.*`). */
const MODULE_KEY: Record<string, string> = {
  MATERIAL: "material",
  EQUIPMENT: "equipment",
  EHS: "ehs",
  RECYCLE: "recycle",
  CLAIM: "claim",
};

/**
 * One category picker's items: 分类组 → 分类 → 子分类 (I11, ID3).
 *
 * The group is a heading only when there is more than one; a sub-category is
 * indented under its category. ``selectable`` decides which rows can be
 * chosen (equipment files a machine on a sub class only); the others still
 * show, as headings of their sub-categories.
 */
export function CategoryOptionItems<T extends TreeCategory>({
  rows,
  selectable = () => true,
  label = (row) => row.name,
  groupsSelectable = false,
}: {
  rows: readonly T[];
  selectable?: (row: T, depth: 0 | 1) => boolean;
  label?: (row: T) => string;
  /**
   * A filter (not a form) may choose a whole 分类组: 「全部 · 机电材料」,
   * value ``group:<id>``, which every list reads as every category in it.
   */
  groupsSelectable?: boolean;
}) {
  const t = useTranslations("categoryManagement");
  const groups = categoryTree(rows);
  const headed = showsGroups(groups);
  return (
    <>
      {groups.map((group, index) => {
        if (!group.entries.length) return null;
        const items = group.entries.map(({ row, depth }) =>
          selectable(row, depth) ? (
            <SelectItem key={row.id} value={row.id} className={depth ? "pl-8" : undefined}>
              {depth ? <span aria-hidden className="mr-1 text-muted-foreground">└</span> : null}
              {label(row)}
            </SelectItem>
          ) : (
            <SelectLabel key={row.id} className="text-xs font-medium text-foreground">
              {label(row)}
            </SelectLabel>
          ),
        );
        const name =
          group.name || (group.module && MODULE_KEY[group.module] ? t(`module.${MODULE_KEY[group.module]}`) : "");
        // Always a group: a label (a heading, or a category that is not
        // itself a choice) only renders inside one.
        return (
          <Fragment key={group.key || "none"}>
            {headed && index > 0 && <SelectSeparator />}
            <SelectGroup>
              {headed && <SelectLabel className="text-xs text-muted-foreground">{name}</SelectLabel>}
              {headed && groupsSelectable && group.key && (
                <SelectItem value={`group:${group.key}`}>{t("groups.all", { name })}</SelectItem>
              )}
              {items}
            </SelectGroup>
          </Fragment>
        );
      })}
    </>
  );
}
