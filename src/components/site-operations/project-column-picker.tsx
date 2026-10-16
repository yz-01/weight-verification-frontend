"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { CategoryOptionItems } from "@/components/shared/category-options";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProjectCategoryKind } from "@/interfaces/contractor-ops";
import { getProjectCategories } from "@/services/contractor-ops.service";

export function ProjectColumnPicker({ project, kind, value, onChange, className, bare = false }: {
  project: string;
  kind: ProjectCategoryKind;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Leave out the labelled wrapper, for a caller that labels the field itself. */
  bare?: boolean;
}) {
  const t = useTranslations("contractorOps");
  const columns = useQuery({
    queryKey: ["project-categories", "capture", project, kind],
    queryFn: () => getProjectCategories({ project, kind: kind, is_active: true, page_size: 200 }),
    enabled: Boolean(project),
  });
  const available = (columns.data?.results ?? []).filter((row) => row.can_upload);
  useEffect(() => {
    if (columns.isSuccess && value && !available.some((row) => row.id === value)) onChange("");
  }, [columns.isSuccess, available, value, onChange]);
  const control = <>
    <Select value={value || undefined} onValueChange={onChange} disabled={!project || columns.isLoading}>
      <SelectTrigger className="w-full"><SelectValue placeholder={t("field.category")} /></SelectTrigger>
      <SelectContent>
        {/* 分类组 → 分类 → 子分类 (I11). */}
        <CategoryOptionItems rows={available} />
      </SelectContent>
    </Select>
    {columns.isError && <p role="alert" className="text-sm text-destructive">{t("state.loadError")}</p>}
    {project && columns.isSuccess && !available.length && <p role="alert" className="text-sm text-destructive">{t("filing.noColumns")}</p>}
  </>;
  if (bare) return control;
  return <FieldWrapper label={t("field.category")} required className={className}>{control}</FieldWrapper>;
}
