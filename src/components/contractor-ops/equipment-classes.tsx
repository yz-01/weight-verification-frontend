"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectCategory } from "@/interfaces/contractor-ops";
import { getProjectCategories } from "@/services/contractor-ops.service";

/**
 * Equipment categories in two levels (2026-10 B2, X1): 大类 → 小类.
 *
 * A machine sits on a sub class. The major classes are the top-level rows;
 * a sub class names its major class in `parent`. A top-level row with no sub
 * classes is still a major class - an empty one, or a flat column from before
 * the two levels that machines may still sit on.
 */
export interface EquipmentClassTree {
  majors: ProjectCategory[];
  subClasses: (major: string) => ProjectCategory[];
  /** Every sub class, in its major class's order. */
  allSubClasses: ProjectCategory[];
}

export function equipmentClassTree(rows: readonly ProjectCategory[]): EquipmentClassTree {
  const byOrder = [...rows].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );
  const majors = byOrder.filter((row) => !row.parent);
  const subClasses = (major: string) => byOrder.filter((row) => row.parent === major);
  return {
    majors,
    subClasses,
    allSubClasses: majors.flatMap((major) => subClasses(major.id)),
  };
}

/** This project's equipment classes, only when a project is chosen. */
export function useEquipmentClasses(project: string) {
  // query-failure: every caller renders <QueryFailedNote query={classes.query} />.
  const query = useQuery({
    queryKey: ["project-categories", "equipment", project],
    queryFn: () =>
      getProjectCategories({
        project,
        kind: "EQUIPMENT",
        page_size: 200,
        sort_by: "sort_order",
        sort_order: "asc",
      }),
    enabled: Boolean(project),
  });
  return { query, tree: equipmentClassTree(query.data?.results ?? []) };
}

/**
 * The office's sub-class picker: sub classes grouped under their major class.
 *
 * A machine already on a flat column from before the two levels keeps it on
 * offer, so opening its profile does not silently empty the field.
 */
export function EquipmentClassSelect({
  tree,
  value,
  currentName,
  disabled,
  onChange,
}: {
  tree: EquipmentClassTree;
  value: string | null;
  /** The machine's current category name, for one no longer among the sub classes. */
  currentName?: string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("contractorOps");
  const known = tree.allSubClasses.some((row) => row.id === value);
  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full" aria-label={t("field.equipmentSubClass")}>
        <SelectValue placeholder={t("field.chooseEquipmentSubClass")} />
      </SelectTrigger>
      <SelectContent>
        {tree.majors.map((major) => {
          const subs = tree.subClasses(major.id).filter((row) => row.is_active || row.id === value);
          if (!subs.length) return null;
          return (
            <SelectGroup key={major.id}>
              <SelectLabel>{major.name}</SelectLabel>
              {subs.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
        {value && !known && (
          <SelectItem value={value}>{currentName || value}</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
