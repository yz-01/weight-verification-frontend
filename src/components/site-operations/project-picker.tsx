"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useCurrentProject } from "@/components/providers/current-project-provider";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Project } from "@/interfaces/contractor";
import { getProjects } from "@/services/contractor.service";

/**
 * What a project choice is for, which decides what the top bar's 「当前项目」
 * does to it (B13):
 *
 * - `filter`: narrows a list. The top bar is the list's filter, so it is not
 *   drawn at all. (The default when `allowAll` is set.)
 * - `page`: the whole page is about one project (Multi Engine, the category
 *   tree). Not drawn while the top bar is on a project; on 全部项目 it asks,
 *   and the answer moves the top bar (via `usePageProject`).
 * - `form`: the project of a record being created. Filled from the top bar and
 *   shown as text; on 全部项目 the form asks for it itself. (The default.)
 * - `own`: a choice the top bar does not make, where leaving it empty means
 *   something (an external link for the whole company). Always drawn.
 */
export type ProjectPickerScope = "filter" | "page" | "form" | "own";

/** "" and "all" both mean every project. */
function sameProject(left: string, right: string) {
  return (left === "all" ? "" : left) === (right === "all" ? "" : right);
}

export function ProjectPicker({
  value,
  onValueChange,
  placeholder,
  allowAll = false,
  allLabel,
  className,
  disabled = false,
  projects,
  projectsLoading,
  projectsError,
  scope,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  allowAll?: boolean;
  allLabel?: string;
  className?: string;
  disabled?: boolean;
  projects?: Project[];
  projectsLoading?: boolean;
  projectsError?: boolean;
  scope?: ProjectPickerScope;
}) {
  const t = useTranslations("siteControl");
  const tc = useTranslations("currentProject");
  const { user } = useAuth();
  const current = useCurrentProject();
  const role: ProjectPickerScope = scope ?? (allowAll ? "filter" : "form");
  const shouldLoadProjects = projects === undefined && !current.active;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () => getProjects({ page_size: 100, sort_by: "name" }),
    enabled: shouldLoadProjects,
    staleTime: 60_000,
  });
  const options = projects ?? (current.active ? current.projects : data?.results) ?? [];
  const loading = projectsLoading ?? (current.active ? current.loading : shouldLoadProjects && isLoading);
  const failed = projectsError ?? (shouldLoadProjects && isError);
  const boundProject = user?.is_field_staff
    ? user.active_project?.project_id ?? (options.length === 1 ? options[0].id : "")
    : "";
  useEffect(() => {
    if (boundProject && value !== boundProject) onValueChange(boundProject);
  }, [boundProject, onValueChange, value]);

  // The top bar's project (B13). A page that still keeps its own copy of the
  // project is brought onto it; a form starts on it. A form already holding
  // another project (editing a record of that project) is left alone.
  const topBar = current.active && !boundProject && role !== "own" ? current.projectId : null;
  const followsTopBar =
    topBar !== null &&
    (role === "filter" ||
      (role === "page" && topBar !== "") ||
      (role === "form" && topBar !== "" && (!value || value === topBar)));
  useEffect(() => {
    if (!followsTopBar || topBar === null || sameProject(value, topBar)) return;
    if (role === "form" && value) return;
    onValueChange(topBar || (allowAll ? "all" : ""));
  }, [allowAll, followsTopBar, onValueChange, role, topBar, value]);

  if (followsTopBar && role !== "form") return null;
  if (followsTopBar) {
    const chosen = options.find((project) => project.id === topBar);
    return (
      <p className="min-w-0 break-words py-2 text-sm font-medium" data-project-locked>
        {chosen ? `${chosen.code} - ${chosen.name}` : ""}
      </p>
    );
  }

  if (boundProject) {
    const name = options.find((project) => project.id === boundProject)?.name
      ?? user?.active_project?.project_name;
    return <p className="min-w-0 break-words py-2 text-sm font-medium">{name}</p>;
  }

  return (
    <div className="min-w-0" data-project-picker={role}>
    <Select value={value || undefined} onValueChange={onValueChange}>
      <SelectTrigger
        className={className ?? "w-full"}
        disabled={loading || failed || disabled}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper">
        {allowAll && <SelectItem value="all">{allLabel}</SelectItem>}
        {options.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            {project.code} - {project.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    {topBar === "" && role === "page" && <p className="mt-1.5 text-xs text-muted-foreground">{tc("pageHint")}</p>}
    {failed && <p role="alert" className="mt-1.5 text-xs font-medium text-destructive">{t("state.projectLoadError")}</p>}
    {!loading && !failed && options.length === 0 && <p className="mt-1.5 text-xs text-muted-foreground">{t("noProjects")}</p>}
    </div>
  );
}
