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
    // JB202 (Lucas 11-16 「字被裁掉了」): the project's whole name, never
    // 「…」 - on a phone on a row of its own under the top bar's buttons
    // (`order-last basis-full`), wrapping if it is longer still.
    return (
      <span
        data-current-project
        title={t("label")}
        className="order-last flex min-h-9 min-w-0 max-w-full basis-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-sm sm:order-none sm:basis-auto"
      >
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 break-words">{only.code} - {only.name}</span>
      </span>
    );
  }

  return (
    // JB202: a select box cannot wrap, so it gets the room for the chosen
    // project's name (it had 9 rem on a phone - an empty box - and 14 rem on
    // a desktop, one character short of 「PRJ-0001 - 示范商业大厦一期」); on a
    // phone it has the second row of the top bar to itself.
    <label className="order-last flex min-w-0 max-w-full basis-full items-center gap-1.5 sm:order-none sm:basis-auto" data-current-project>
      <Building2 className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
      <span className="sr-only">{t("label")}</span>
      <select
        aria-label={t("label")}
        title={t("label")}
        className="h-9 min-w-0 max-w-full flex-1 rounded-md border bg-background px-2 text-sm sm:flex-initial"
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
