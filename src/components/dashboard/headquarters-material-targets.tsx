"use client";

/**
 * 总部仪表板 → 材料目标 (I18, ID42): 「总部 Dashboard 可查看各项目材料目标与
 * 实际累计数量对比，并可进入原记录查看」.
 *
 * One line per project that has targets: how many, and how many are over, at
 * and near them. A line opens that project's 材料目标, where each target opens
 * its deliveries and returns.
 */

import { Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { StatusBadge } from "@/components/shared/page-primitives";
import type { HeadquartersOverview } from "@/interfaces/headquarters";
import { projectTargetsLink } from "@/lib/material-targets";

export function HeadquartersMaterialTargets({ data }: { data: HeadquartersOverview }) {
  const t = useTranslations("headquarters.materialTargets");
  const router = useRouter();
  const rows = data.projects.filter((project) => (project.material_targets?.targets ?? 0) > 0);
  return (
    <section aria-label={t("title")} className="surface-panel rounded-xl p-4 sm:p-5">
      <header className="mb-3 flex items-center gap-2">
        <Target className="size-4 text-primary" />
        <h3 className="panel-title">{t("title")}</h3>
      </header>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y">
          {rows.map((project) => {
            const figures = project.material_targets;
            return (
              <li key={project.id}>
                <button
                  type="button"
                  onClick={() => router.push(projectTargetsLink(project.id))}
                  className="flex w-full flex-wrap items-center gap-2 py-2 text-left hover:bg-muted/40"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {project.code} · {project.name}
                  </span>
                  <span className="text-xs text-muted-foreground">{t("targets", { count: figures?.targets ?? 0 })}</span>
                  {(figures?.exceeded ?? 0) > 0 && (
                    <StatusBadge label={t("exceeded", { count: figures?.exceeded ?? 0 })} tone="danger" />
                  )}
                  {(figures?.reached ?? 0) > 0 && (
                    <StatusBadge label={t("reached", { count: figures?.reached ?? 0 })} tone="positive" />
                  )}
                  {(figures?.approaching ?? 0) > 0 && (
                    <StatusBadge label={t("approaching", { count: figures?.approaching ?? 0 })} tone="warning" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
