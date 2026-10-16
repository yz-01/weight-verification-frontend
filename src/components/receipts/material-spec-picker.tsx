"use client";

/**
 * The specification of one material (I19, ID45, ID46), for the office's
 * forms - a delivery's correction, a return application. The phone has its
 * own, inline in its form.
 *
 * Reads the material list the material picker beside it reads (same query
 * key), so it costs nothing extra. Choosing a specification hands back its
 * name and unit; 「其他」 hands back neither - the specification is typed.
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MaterialSpec } from "@/interfaces/contractor-ops";
import { offeredSpecs } from "@/lib/material-catalogue";
import { getProjectCategories } from "@/services/contractor-ops.service";

export function MaterialSpecPicker({
  project,
  category,
  value,
  onChange,
}: {
  project: string;
  category: string;
  value: string;
  /** The chosen specification, or null for none. */
  onChange: (spec: MaterialSpec | null) => void;
}) {
  const t = useTranslations("receipts");
  const columns = useQuery({
    queryKey: ["project-categories", "capture", project, "MATERIAL"],
    queryFn: () => getProjectCategories({ project, kind: "MATERIAL", is_active: true, page_size: 200 }),
    enabled: Boolean(project),
  });
  const material = (columns.data?.results ?? []).find((row) => row.id === category);
  const specs = offeredSpecs(material, value);
  return (
    <FieldWrapper label={t("field.spec")} hint={t("field.specHint")}>
      <Select
        value={value || "__none__"}
        onValueChange={(next) => onChange(next === "__none__" ? null : (specs.find((spec) => spec.id === next) ?? null))}
        disabled={!category || columns.isLoading}
      >
        <SelectTrigger className="w-full" aria-label={t("field.spec")}>
          <SelectValue placeholder={t("field.chooseSpec")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{t("field.noSpec")}</SelectItem>
          {specs.map((spec) => (
            <SelectItem key={spec.id} value={spec.id}>
              {spec.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <QueryFailedNote query={columns} what={t("field.spec")} />
    </FieldWrapper>
  );
}
