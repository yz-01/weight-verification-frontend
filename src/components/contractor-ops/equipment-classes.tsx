"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/interfaces/api";
import type { ProjectCategory } from "@/interfaces/contractor-ops";
import { addEquipmentClass, getProjectCategories } from "@/services/contractor-ops.service";

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

/** The major-class choice that means "a new one, named below". */
const NEW_MAJOR = "__new_major__";

/**
 * Make the class where the machine is filed (Lucas 2026-10-07).
 *
 * Nobody knows in advance which machine will arrive, so the office files a
 * 「新设备」 when it accepts the entry - and when no class fits, it makes one
 * here, under an existing major class or a new one, without a trip to
 * Category Management. The new sub class is chosen at once.
 */
export function InlineClassCreator({
  project,
  tree,
  onCreated,
}: {
  project: string;
  tree: EquipmentClassTree;
  /** The sub class just made - its name too, shown before the list refetches. */
  onCreated: (subClass: { id: string; name: string }) => void;
}) {
  const t = useTranslations("contractorOps");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [major, setMajor] = useState(tree.majors[0]?.id ?? NEW_MAJOR);
  const [majorName, setMajorName] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const isNewMajor = major === NEW_MAJOR || !tree.majors.some((row) => row.id === major);
  const create = useMutation({
    mutationFn: () =>
      addEquipmentClass({
        project,
        ...(isNewMajor ? { major_name: majorName.trim() } : { major }),
        name: name.trim(),
      }),
    onMutate: () => setError(""),
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: ["project-categories"] });
      void qc.invalidateQueries({ queryKey: ["category-management"] });
      setOpen(false);
      setName("");
      setMajorName("");
      onCreated({ id: row.id, name: row.name });
    },
    onError: (failure) =>
      setError(
        failure instanceof ApiError
          ? Object.values(failure.errors).join("; ") || failure.message
          : t("state.loadError"),
      ),
  });
  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setOpen(true)}>
        <Plus />
        {t("equipment.addClass")}
      </Button>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded-md border p-2" data-testid="inline-class-creator">
      <FieldWrapper label={t("equipment.classMajor")} required>
        <Select value={isNewMajor ? NEW_MAJOR : major} onValueChange={setMajor}>
          <SelectTrigger className="w-full" aria-label={t("equipment.classMajor")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tree.majors.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
              </SelectItem>
            ))}
            <SelectItem value={NEW_MAJOR}>{t("equipment.classNewMajor")}</SelectItem>
          </SelectContent>
        </Select>
      </FieldWrapper>
      {isNewMajor && (
        <FieldWrapper label={t("equipment.classNewMajorName")} required>
          <Input
            aria-label={t("equipment.classNewMajorName")}
            value={majorName}
            onChange={(e) => setMajorName(e.target.value)}
          />
        </FieldWrapper>
      )}
      <FieldWrapper label={t("equipment.classSubName")} required>
        <Input
          aria-label={t("equipment.classSubName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FieldWrapper>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("action.cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          requires={[
            [!isNewMajor || majorName.trim(), t("equipment.classNewMajorName")],
            [name.trim(), t("equipment.classSubName")],
          ]}
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          {t("equipment.classCreate")}
        </Button>
      </div>
    </div>
  );
}
