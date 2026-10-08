"use client";

import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCurrentProject } from "@/components/providers/current-project-provider";
import { ALL_PROJECTS_CHOICE } from "@/lib/project-context";

/**
 * The top bar's 「当前项目」 (B13): chosen once, used by every page.
 *
 * Plain on purpose - the top bar is restyled with the rest of the UI (E1).
 * One project: its name, nothing to choose. Several: a list of them, headed by
 * 「全部项目」 (Q7: only for someone who sees more than one project).
 */
export function CurrentProjectPicker() {
  const t = useTranslations("currentProject");
  const current = useCurrentProject();
  if (!current.active || current.projects.length === 0) return null;

  if (current.projects.length === 1) {
    const only = current.projects[0];
    return (
      <span
        data-current-project
        title={t("label")}
        className="flex h-9 min-w-0 max-w-56 items-center gap-1.5 truncate rounded-md border bg-background px-2 text-sm"
      >
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{only.code} - {only.name}</span>
      </span>
    );
  }

  return (
    <label className="flex min-w-0 items-center gap-1.5" data-current-project>
      <Building2 className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
      <span className="sr-only">{t("label")}</span>
      <select
        aria-label={t("label")}
        title={t("label")}
        className="h-9 min-w-0 max-w-36 rounded-md border bg-background px-2 text-sm sm:max-w-56"
        value={current.projectId || ALL_PROJECTS_CHOICE}
        onChange={(event) => current.setProjectId(event.target.value)}
      >
        {current.canChooseAll && (
          <option value={ALL_PROJECTS_CHOICE}>{t("all")}</option>
        )}
        {current.projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.code} - {project.name}
          </option>
        ))}
      </select>
    </label>
  );
}
