"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProjectCategoryKind } from "@/interfaces/contractor-ops";
import { getProjectCategories } from "@/services/contractor-ops.service";

export function ProjectColumnPicker({ project, kind, value, onChange, className }: {
  project: string;
  kind: ProjectCategoryKind;
  value: string;
  onChange: (value: string) => void;
  className?: string;
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
  return <FieldWrapper label={t("field.category")} required className={className}>
    <Select value={value || undefined} onValueChange={onChange} disabled={!project || columns.isLoading}>
      <SelectTrigger className="w-full"><SelectValue placeholder={t("field.category")} /></SelectTrigger>
      <SelectContent>
        {available.map((row) =>
          <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>,
        )}
      </SelectContent>
    </Select>
    {columns.isError && <p role="alert" className="text-sm text-destructive">{t("state.loadError")}</p>}
    {project && columns.isSuccess && !available.length && <p role="alert" className="text-sm text-destructive">{t("filing.noColumns")}</p>}
  </FieldWrapper>;
}
