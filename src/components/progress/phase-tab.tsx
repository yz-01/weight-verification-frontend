"use client";

/**
 * 施工分类 (2026-10 B17, Q5, X7): each project's construction phases - name
 * and weight - managed on the progress page itself.
 *
 * The phone picks one of these with every progress photograph, and the
 * weights are what the project's overall percentage is computed from. The
 * dialog is the one the page always used (`PhaseDialog`): correcting,
 * switching off, and removing one added by mistake behind a switch.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListTree, Loader2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { PhaseDialog } from "@/components/contractor-ops/operations-workspaces";
import { useAuth } from "@/components/providers/auth-provider";
import { ProjectListFilter, SummaryStrip } from "@/components/shared/module-records-table";
import { FilterBar, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useListQuery } from "@/hooks/use-list-query";
import type { ConstructionPhase } from "@/interfaces/contractor-ops";
import {
  getConstructionPhases,
  getSiteProgressSummary,
} from "@/services/contractor-ops.service";

export function PhaseTab() {
  const t = useTranslations("progressPage");
  const tOps = useTranslations("contractorOps");
  const { can } = useAuth();
  const qc = useQueryClient();
  const list = useListQuery(["project"]);
  const project = list.filters.project ?? "";
  const phases = useQuery({
    queryKey: ["construction-phases", project],
    queryFn: () =>
      getConstructionPhases({ project: project || undefined, page_size: 200 }),
  });
  const summary = useQuery({
    queryKey: ["site-progress-summary", project],
    queryFn: () => getSiteProgressSummary(project),
    enabled: Boolean(project),
  });
  const [adding, setAdding] = useState(false);
  const [editingPhase, setEditingPhase] = useState<ConstructionPhase | null>(null);
  const rows = phases.data?.results ?? [];
  const saved = () => {
    void qc.invalidateQueries({ queryKey: ["construction-phases"] });
    void qc.invalidateQueries({ queryKey: ["site-progress-summary"] });
    setAdding(false);
    setEditingPhase(null);
  };

  return (
    <div className="space-y-4">
      <FilterBar>
        <ProjectListFilter list={list} />
        {can("progress.manage") && (
          <Button className="sm:ml-auto" onClick={() => setAdding(true)}>
            <ListTree />
            {t("phases.add")}
          </Button>
        )}
      </FilterBar>
      <p className="text-sm text-muted-foreground">{t("phases.help")}</p>
      {project && (
        <SummaryStrip
          items={[
            {
              key: "weighted",
              label: tOps("progress.summary.weighted"),
              value:
                summary.isError || summary.data?.weighted_progress == null
                  ? "—"
                  : `${summary.data.weighted_progress}%`,
            },
          ]}
        />
      )}
      <QueryFailedNote query={summary} what={tOps("what.progressSummary")} />
      <QueryFailedNote query={phases} what={tOps("what.phases")} />
      <div className="surface-panel overflow-hidden rounded-xl">
        <Table>
          <TableHeader>
            <TableRow>
              {!project && <TableHead>{tOps("field.project")}</TableHead>}
              <TableHead className="w-28">{tOps("field.code")}</TableHead>
              <TableHead>{t("phases.name")}</TableHead>
              <TableHead className="tabular w-24 text-right">{tOps("progress.plannedWeight")}</TableHead>
              <TableHead className="tabular w-24 text-right">{t("phases.records")}</TableHead>
              <TableHead className="w-24">{tOps("field.status")}</TableHead>
              <TableHead className="w-16 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {phases.isLoading ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  {phases.isError ? "—" : t("phases.empty")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((phase) => (
                <TableRow key={phase.id} className={phase.is_active ? undefined : "text-muted-foreground"}>
                  {!project && <TableCell>{phase.project_name ?? "—"}</TableCell>}
                  <TableCell className="font-mono text-xs">{phase.code}</TableCell>
                  <TableCell className="font-medium">{phase.name}</TableCell>
                  <TableCell className="tabular text-right">{phase.planned_weight}</TableCell>
                  <TableCell className="tabular text-right">{phase.record_count}</TableCell>
                  <TableCell>
                    <StatusBadge
                      label={phase.is_active ? t("phases.active") : t("phases.inactive")}
                      tone={phase.is_active ? "positive" : "neutral"}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {can("progress.manage") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={tOps("progress.editPhase")}
                        title={tOps("progress.editPhase")}
                        onClick={() => setEditingPhase(phase)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {editingPhase && (
        <PhaseDialog
          project={editingPhase.project}
          phase={editingPhase}
          onClose={() => setEditingPhase(null)}
          onSaved={saved}
        />
      )}
      {adding && (
        <PhaseDialog project={project} onClose={() => setAdding(false)} onSaved={saved} />
      )}
    </div>
  );
}
