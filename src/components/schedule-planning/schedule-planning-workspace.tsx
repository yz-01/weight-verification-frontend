"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CalendarRange,
  Check,
  ChevronDown,
  Ellipsis,
  FileSpreadsheet,
  GitBranch,
  History,
  Info,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useState, type ReactNode } from "react";

import { ConsultantProjectPicker } from "@/components/consultant-workflow/project-scope-picker";
import {
  useOnProjectChange,
  usePageProject,
  useProjectBoxShown,
} from "@/components/providers/current-project-provider";
import { ScheduleFigures } from "@/components/schedule-planning/schedule-figures";
import { ScheduleGantt } from "@/components/schedule-planning/schedule-gantt";
import { ScheduleTaskTable } from "@/components/schedule-planning/schedule-task-table";
import { isDelayed } from "@/components/schedule-planning/task-status";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ExportButton } from "@/components/shared/export-button";
import {
  EmptyState as EmptyPanel,
  FieldWrapper,
  ListHeader,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/providers/auth-provider";
import type {
  ProgressCandidate,
  ScheduleImportPreview,
  SchedulePlan,
  ScheduleRevision,
  ScheduleTask,
  ScheduleTaskPayload,
} from "@/interfaces/schedule-planning";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  archiveSchedulePlan,
  confirmScheduleImport,
  confirmScheduleRevision,
  confirmScheduleTaskProgress,
  createScheduleImportPreview,
  createSchedulePlan,
  createScheduleRevision,
  createScheduleTask,
  deleteScheduleRevision,
  deleteScheduleTask,
  exportSchedule,
  getProgressCandidates,
  getScheduleHistory,
  getScheduleOverview,
  getSchedulePlans,
  getScheduleRevisions,
  getScheduleTasks,
  updateSchedulePlan,
  updateScheduleRevision,
  updateScheduleTask,
} from "@/services/schedule-planning.service";

/** The two panels of the folded-away 「计划版本和记录」 section. */
export type AdvancedTab = "revisions" | "history";

const ADVANCED_ID = "schedule-advanced";

const tone = (status: string) => {
  if (["ACTIVE", "CONFIRMED"].includes(status)) return "positive" as const;
  if (["ARCHIVED"].includes(status)) return "neutral" as const;
  return "warning" as const;
};

/**
 * 施工计划管理, laid out for a site office (Lucas, 2026-10-09: 「改成简单的就好，
 * 可是gantt chart那些还是需要保留」).
 *
 * One path down the page: pick a plan (or make or import one when there is
 * none) → three figures → the Gantt chart → the task list. The Gantt is the
 * main view rather than a tab. Everything else the page could do before is
 * still here, moved rather than removed:
 *
 * - 「更多」 beside the plan picker: export Excel / PDF, new plan, import
 *   Excel, rename, archive, new revision, and the way into versions and
 *   history.
 * - 「计划版本和记录」 at the foot, folded by default: the baseline and its
 *   revisions (open, confirm, edit, remove a draft, 新建修订版) and the
 *   history.
 *
 * Behaviour is unchanged: the same calls, permissions and dialogs. The cards
 * now ask for the revision on screen, so they and the task list describe the
 * same schedule.
 */
export function SchedulePlanningWorkspace({
  project: chosenProject,
  onProjectChange,
}: {
  /**
   * The project, when the page holds it: 工程进度's 施工计划 tab passes the
   * `?project=` the other four tabs use (B4 audit #7). `/schedule` on its
   * own leaves it out and the workspace keeps its own.
   */
  project?: string;
  onProjectChange?: (project: string) => void;
} = {}) {
  const t = useTranslations("schedulePlanning");
  const { can } = useAuth();
  const qc = useQueryClient();
  // `/schedule` on its own: the top bar's 「当前项目」 (B13).
  const [ownProject, setOwnProject] = usePageProject();
  const project = chosenProject ?? ownProject;
  const projectBoxShown = useProjectBoxShown("page");
  const setProject = onProjectChange ?? setOwnProject;
  const [selectedPlan, setSelectedPlan] = useState("");
  const [selectedRevision, setSelectedRevision] = useState("");
  const [onlyDelayed, setOnlyDelayed] = useState(false);
  // A plan belongs to one project; another project starts with none chosen.
  useOnProjectChange(project, () => {
    setSelectedPlan("");
    setSelectedRevision("");
    setOnlyDelayed(false);
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedTab, setAdvancedTab] = useState<AdvancedTab>("revisions");
  const [planDialog, setPlanDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [revisionDialog, setRevisionDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduleTask | "new" | null>(null);
  const [progressTask, setProgressTask] = useState<ScheduleTask | null>(null);
  const [removingTask, setRemovingTask] = useState<ScheduleTask | null>(null);
  const [removingRevision, setRemovingRevision] = useState<ScheduleRevision | null>(null);
  const [confirmingRevision, setConfirmingRevision] = useState<ScheduleRevision | null>(null);
  const [archivingPlan, setArchivingPlan] = useState<SchedulePlan | null>(null);
  const [editingPlan, setEditingPlan] = useState<SchedulePlan | null>(null);
  const [editingRevision, setEditingRevision] = useState<ScheduleRevision | null>(null);

  const plans = useQuery({
    queryKey: ["schedule-plans", project],
    queryFn: () => getSchedulePlans({ project, page_size: 200 }),
    enabled: Boolean(project),
  });
  const plan =
    plans.data?.results.find((row) => row.id === selectedPlan) ??
    plans.data?.results[0] ??
    null;
  const revisions = useQuery({
    queryKey: ["schedule-revisions", plan?.id],
    queryFn: () => getScheduleRevisions({ plan: plan?.id, page_size: 200 }),
    enabled: Boolean(plan),
  });
  const defaultRevision =
    revisions.data?.results.find((row) => row.status === "DRAFT") ??
    revisions.data?.results.find((row) => row.is_current) ??
    revisions.data?.results[0] ??
    null;
  const revision =
    revisions.data?.results.find((row) => row.id === selectedRevision) ?? defaultRevision;
  const tasks = useQuery({
    queryKey: ["schedule-tasks", revision?.id],
    queryFn: () => getScheduleTasks({ revision: revision?.id, page_size: 200 }),
    enabled: Boolean(revision),
  });
  // The figures of the revision on screen, not whichever the server would
  // pick: a draft opens ahead of the current revision, and the cards used to
  // describe the current one beside the draft's tasks.
  const overview = useQuery({
    queryKey: ["schedule-overview", plan?.id, revision?.id],
    queryFn: () => getScheduleOverview(plan!.id, revision?.id),
    enabled: Boolean(plan && revision),
  });
  const historyRows = useQuery({
    queryKey: ["schedule-history", plan?.id],
    queryFn: () => getScheduleHistory(plan!.id),
    enabled: Boolean(plan) && advancedOpen && advancedTab === "history",
  });

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["schedule-plans"] }),
      qc.invalidateQueries({ queryKey: ["schedule-revisions"] }),
      qc.invalidateQueries({ queryKey: ["schedule-tasks"] }),
      qc.invalidateQueries({ queryKey: ["schedule-overview"] }),
      qc.invalidateQueries({ queryKey: ["schedule-history"] }),
    ]);
  };
  const removeTask = useMutation({
    mutationFn: deleteScheduleTask,
    onSuccess: async () => {
      setRemovingTask(null);
      await invalidate();
    },
  });
  const removeRevision = useMutation({
    mutationFn: deleteScheduleRevision,
    onSuccess: async () => {
      setRemovingRevision(null);
      setSelectedRevision("");
      await invalidate();
    },
  });
  const confirmRevision = useMutation({
    mutationFn: confirmScheduleRevision,
    onSuccess: async () => {
      setConfirmingRevision(null);
      await invalidate();
    },
  });
  const archivePlan = useMutation({
    mutationFn: (id: string) => archiveSchedulePlan(id, "Archived by schedule manager"),
    onSuccess: async () => {
      setArchivingPlan(null);
      setSelectedPlan("");
      await invalidate();
    },
  });

  const rows = tasks.data?.results ?? [];
  const shownRows = onlyDelayed ? rows.filter(isDelayed) : rows;
  const hasDraft = Boolean(revisions.data?.results.some((row) => row.status === "DRAFT"));
  const canManage = can("schedule.manage");
  const canConfirm = can("schedule.confirm");
  const canImport = canManage && canConfirm;
  const canNewRevision =
    canManage && Boolean(plan && revision?.is_current && !hasDraft && plan.status !== "ARCHIVED");

  const openAdvanced = (tab: AdvancedTab) => {
    setAdvancedTab(tab);
    setAdvancedOpen(true);
    requestAnimationFrame(() =>
      document.getElementById(ADVANCED_ID)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  return (
    <div className="space-y-4">
      <ListHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="surface-panel space-y-3 rounded-xl p-4 sm:p-6" data-slot="schedule-plan-bar">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          {projectBoxShown && (
            <FieldWrapper label={t("field.project")} required className="lg:w-72">
              <ConsultantProjectPicker
                value={project}
                onChange={(value) => {
                  setProject(value);
                  setSelectedPlan("");
                  setSelectedRevision("");
                }}
                scope="page"
              />
            </FieldWrapper>
          )}
          <FieldWrapper label={t("field.plan")} className="lg:w-72">
            <Select
              value={plan?.id}
              onValueChange={(value) => {
                setSelectedPlan(value);
                setSelectedRevision("");
                setOnlyDelayed(false);
              }}
              disabled={!plans.data?.count}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder={t("field.selectPlan")} /></SelectTrigger>
              <SelectContent>
                {(plans.data?.results ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            {canManage && revision?.status === "DRAFT" && (
              <Button onClick={() => setEditingTask("new")}><Plus />{t("action.addTask")}</Button>
            )}
            {canConfirm && revision?.status === "DRAFT" && rows.length > 0 && (
              <Button variant="outline" onClick={() => setConfirmingRevision(revision)}><Check />{t("action.confirmRevision")}</Button>
            )}
            {/* 预览 · 打印 · 导出 · 发送 (PDF 统一操作规则), as on every export. */}
            {plan && revision ? (
              <ExportButton
                onExport={(format) => exportSchedule(plan.id, revision.id, format)}
                title={plan.name}
              />
            ) : null}
            <MoreMenu
              items={[
                ...(project && canManage
                  ? [{ key: "newPlan", icon: Plus, label: t("action.newPlan"), onSelect: () => setPlanDialog(true) }]
                  : []),
                ...(project && canImport
                  ? [{ key: "import", icon: Upload, label: t("action.importExcel"), onSelect: () => setImportDialog(true) }]
                  : []),
                ...(plan && canManage
                  ? [{ key: "rename", icon: Pencil, label: t("action.editPlan"), onSelect: () => setEditingPlan(plan), group: true }]
                  : []),
                ...(plan && canManage && plan.status !== "ARCHIVED"
                  ? [{ key: "archive", icon: Archive, label: t("action.archive"), onSelect: () => setArchivingPlan(plan) }]
                  : []),
                ...(canNewRevision
                  ? [{ key: "newRevision", icon: GitBranch, label: t("action.newRevision"), onSelect: () => setRevisionDialog(true), group: true }]
                  : []),
                ...(plan
                  ? [
                      { key: "revisions", icon: CalendarRange, label: t("action.showRevisions"), onSelect: () => openAdvanced("revisions"), group: !canNewRevision },
                      { key: "history", icon: History, label: t("action.showHistory"), onSelect: () => openAdvanced("history") },
                    ]
                  : []),
              ]}
            />
          </div>
        </div>
        {plan && revision && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3 text-sm" data-slot="schedule-version-line">
            <span className="text-muted-foreground">{t("version.showing", { label: revision.label })}</span>
            <StatusBadge label={t("revisionStatus." + revision.status)} tone={tone(revision.status)} />
            {revision.is_current && <StatusBadge label={t("status.current")} tone="info" />}
            {plan.status === "ARCHIVED" && <StatusBadge label={t("planStatus.ARCHIVED")} tone="neutral" />}
            {revision.id !== defaultRevision?.id && (
              <Button size="sm" variant="ghost" onClick={() => setSelectedRevision("")}>{t("action.backToDefault")}</Button>
            )}
            {revision.status === "DRAFT" && (
              <p className="basis-full text-xs text-muted-foreground">{t("version.draftNote")}</p>
            )}
          </div>
        )}
      </div>

      {!project ? (
        <EmptyState text={t("state.chooseProject")} />
      ) : plans.isLoading ? (
        <LoadingState />
      ) : plans.isError ? (
        <EmptyState text={t("state.loadError")} danger />
      ) : !plan ? (
        <EmptyPanel
          icon={CalendarRange}
          title={t("state.noPlans")}
          description={t("state.noPlansHelp")}
          action={
            canManage ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setPlanDialog(true)}><Plus />{t("action.newPlan")}</Button>
                {canImport && (
                  <Button variant="outline" onClick={() => setImportDialog(true)}><Upload />{t("action.importExcel")}</Button>
                )}
              </div>
            ) : undefined
          }
        />
      ) : (
        <>
          {overview.isError ? (
            <EmptyState text={t("state.overviewLoadError")} danger />
          ) : (
            <ScheduleFigures
              summary={overview.data?.summary}
              loading={overview.isLoading}
              onlyDelayed={onlyDelayed}
              onToggleDelayed={() => setOnlyDelayed((old) => !old)}
            />
          )}

          <section className="space-y-3" aria-labelledby="schedule-gantt-title">
            <h3 id="schedule-gantt-title" className="panel-title">{t("section.gantt")}</h3>
            <QueryPanel query={tasks} errorText={t("state.tasksLoadError")}>
              <ScheduleGantt tasks={shownRows} />
            </QueryPanel>
          </section>

          <section className="space-y-3" aria-labelledby="schedule-tasks-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="schedule-tasks-title" className="panel-title">{t("section.tasks")}</h3>
              {onlyDelayed && (
                <Button size="sm" variant="outline" onClick={() => setOnlyDelayed(false)}>{t("action.showAll")}</Button>
              )}
            </div>
            <p className="flex items-start gap-2 text-xs text-muted-foreground" data-slot="schedule-progress-source">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              {t("progressSource")}
            </p>
            <QueryPanel query={tasks} errorText={t("state.tasksLoadError")}>
              <ScheduleTaskTable
                rows={shownRows}
                revision={revision}
                canManage={canManage}
                canConfirm={canConfirm}
                emptyText={onlyDelayed ? t("state.noDelayed") : t("state.noTasks")}
                onEdit={setEditingTask}
                onProgress={setProgressTask}
                onRemove={setRemovingTask}
              />
            </QueryPanel>
          </section>

          <AdvancedSection
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
            tab={advancedTab}
            onTabChange={setAdvancedTab}
            action={
              canNewRevision && advancedTab === "revisions" ? (
                <Button size="sm" variant="outline" onClick={() => setRevisionDialog(true)}><GitBranch />{t("action.newRevision")}</Button>
              ) : undefined
            }
          >
            {advancedTab === "revisions" ? (
              <QueryPanel query={revisions} errorText={t("state.revisionsLoadError")}>
                <RevisionList
                  rows={revisions.data?.results ?? []}
                  selected={revision?.id ?? ""}
                  canManage={canManage}
                  canConfirm={canConfirm}
                  onSelect={(id) => {
                    setSelectedRevision(id);
                    setOnlyDelayed(false);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  onConfirm={setConfirmingRevision}
                  onEdit={setEditingRevision}
                  onRemove={setRemovingRevision}
                />
              </QueryPanel>
            ) : (
              <QueryPanel query={historyRows} errorText={t("state.historyLoadError")}>
                <HistoryList rows={historyRows.data?.results ?? []} />
              </QueryPanel>
            )}
          </AdvancedSection>
        </>
      )}

      {planDialog && (
        <PlanDialog
          project={project}
          onClose={() => setPlanDialog(false)}
          onSaved={async (id) => { setPlanDialog(false); setSelectedPlan(id); await invalidate(); }}
        />
      )}
      {importDialog && (
        <ImportDialog
          project={project}
          plans={plans.data?.results ?? []}
          defaultPlan={plan?.id ?? ""}
          onClose={() => setImportDialog(false)}
          onSaved={async (planId, revisionId) => { setImportDialog(false); setSelectedPlan(planId); setSelectedRevision(revisionId); await invalidate(); }}
        />
      )}
      {revisionDialog && plan && (
        <RevisionDialog plan={plan.id} onClose={() => setRevisionDialog(false)} onSaved={async (id) => { setRevisionDialog(false); setSelectedRevision(id); await invalidate(); }} />
      )}
      {editingPlan && (
        <PlanDialog project={project} plan={editingPlan} onClose={() => setEditingPlan(null)} onSaved={async () => { setEditingPlan(null); await invalidate(); }} />
      )}
      {editingRevision && (
        <RevisionDialog plan={editingRevision.plan} revision={editingRevision} onClose={() => setEditingRevision(null)} onSaved={async () => { setEditingRevision(null); await invalidate(); }} />
      )}
      {editingTask && revision && (
        <TaskDialog
          revision={revision}
          row={editingTask === "new" ? null : editingTask}
          tasks={rows}
          onClose={() => setEditingTask(null)}
          onSaved={async () => { setEditingTask(null); await invalidate(); }}
        />
      )}
      {progressTask && (
        <ProgressDialog project={project} task={progressTask} onClose={() => setProgressTask(null)} onSaved={async () => { setProgressTask(null); await invalidate(); }} />
      )}
      <ConfirmDialog open={Boolean(removingTask)} onOpenChange={() => setRemovingTask(null)} title={t("confirm.removeTaskTitle")} description={t("confirm.removeTaskBody")} confirmLabel={t("action.remove")} confirmIcon={Trash2} isPending={removeTask.isPending} onConfirm={() => removingTask && removeTask.mutate(removingTask.id)} />
      <ConfirmDialog open={Boolean(removingRevision)} onOpenChange={() => setRemovingRevision(null)} title={t("confirm.removeRevisionTitle")} description={t("confirm.removeRevisionBody")} confirmLabel={t("action.remove")} confirmIcon={Trash2} isPending={removeRevision.isPending} onConfirm={() => removingRevision && removeRevision.mutate(removingRevision.id)} />
      <ConfirmDialog open={Boolean(confirmingRevision)} onOpenChange={() => setConfirmingRevision(null)} title={t("confirm.lockTitle")} description={t("confirm.lockBody")} confirmLabel={t("action.confirmRevision")} confirmIcon={Check} isPending={confirmRevision.isPending} onConfirm={() => confirmingRevision && confirmRevision.mutate(confirmingRevision.id)} />
      <ConfirmDialog open={Boolean(archivingPlan)} onOpenChange={() => setArchivingPlan(null)} title={t("confirm.archiveTitle")} description={t("confirm.archiveBody")} confirmLabel={t("action.archive")} confirmIcon={Archive} isPending={archivePlan.isPending} onConfirm={() => archivingPlan && archivePlan.mutate(archivingPlan.id)} />
    </div>
  );
}

interface MoreItem {
  key: string;
  icon: typeof Plus;
  label: string;
  onSelect: () => void;
  /** Starts a new group: a line is drawn above it. */
  group?: boolean;
}

/**
 * 「更多」: everything the page can do that a site office does not do every
 * day. Only the items this person may use on this plan are listed, as the
 * buttons were only drawn for them before.
 */
export function MoreMenu({ items }: { items: MoreItem[] }) {
  const t = useTranslations("schedulePlanning");
  if (!items.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" data-slot="schedule-more"><Ellipsis />{t("action.more")}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {items.map(({ key, icon: Icon, label, onSelect, group }, index) => (
          <Fragment key={key}>
            {group && index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={onSelect}><Icon />{label}</DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 「计划版本和记录」: the baseline, its revisions and the history, folded
 * away at the foot of the page. Closed until somebody opens it here or from
 * 「更多」; the history is only fetched once its panel is shown.
 */
export function AdvancedSection({
  open,
  onOpenChange,
  tab,
  onTabChange,
  action,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: AdvancedTab;
  onTabChange: (tab: AdvancedTab) => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("schedulePlanning");
  const tabs: Array<[AdvancedTab, typeof History]> = [["revisions", GitBranch], ["history", History]];
  return (
    <section id={ADVANCED_ID} className="surface-panel scroll-mt-4 rounded-xl" data-slot="schedule-advanced">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={ADVANCED_ID + "-body"}
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-6"
      >
        <span className="min-w-0">
          <span className="block font-semibold">{t("advanced.title")}</span>
          <span className="block text-xs text-muted-foreground">{t("advanced.help")}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={ADVANCED_ID + "-body"} className="space-y-4 border-t px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex w-full gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-1 sm:w-fit" role="tablist">
              {tabs.map(([key, Icon]) => (
                <Button
                  key={key}
                  size="sm"
                  role="tab"
                  aria-selected={tab === key}
                  variant={tab === key ? "default" : "ghost"}
                  className="shrink-0"
                  onClick={() => onTabChange(key)}
                >
                  <Icon />{t(`advanced.${key}`)}
                </Button>
              ))}
            </div>
            {action}
          </div>
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * The revisions of one plan.
 *
 * Editing and removing are offered on drafts only, matching the API word for
 * word: a confirmed revision is the schedule everyone is working to, and the
 * reason recorded against it is part of why the dates changed.
 */
function RevisionList({ rows, selected, canManage, canConfirm, onSelect, onConfirm, onEdit, onRemove }: { rows: ScheduleRevision[]; selected: string; canManage: boolean; canConfirm: boolean; onSelect: (id: string) => void; onConfirm: (row: ScheduleRevision) => void; onEdit: (row: ScheduleRevision) => void; onRemove: (row: ScheduleRevision) => void }) {
  const t = useTranslations("schedulePlanning"); const df = useDateFormat();
  return <div className="grid gap-3 lg:grid-cols-2">{rows.map((row) => <article key={row.id} className={"surface-panel rounded-xl p-4 " + (selected === row.id ? "ring-2 ring-primary/30" : "")}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{row.label}</h3><StatusBadge label={t("revisionStatus." + row.status)} tone={tone(row.status)} />{row.is_current && <StatusBadge label={t("status.current")} tone="info" />}</div><p className="mt-1 text-sm text-muted-foreground">{t("revision.number", { number: row.revision_number })} / {t("source." + row.source)}</p></div><GitBranch className="size-5 text-muted-foreground" /></div><p className="mt-3 min-h-10 text-sm">{row.reason || t("state.noReason")}</p><div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"><span className="text-xs text-muted-foreground">{row.task_count} {t("common.tasks")} {row.confirmed_at ? " / " + df.dateTime(row.confirmed_at) : ""}</span><div className="ml-auto flex gap-1"><Button size="sm" variant="outline" onClick={() => onSelect(row.id)}>{t("action.open")}</Button>{canConfirm && row.status === "DRAFT" && row.task_count > 0 && <Button size="icon-sm" title={t("action.confirmRevision")} onClick={() => onConfirm(row)}><Check /></Button>}{canManage && row.status === "DRAFT" && <Button size="icon-sm" variant="ghost" title={t("action.editRevision")} onClick={() => onEdit(row)}><Pencil /></Button>}{canManage && row.status === "DRAFT" && <Button size="icon-sm" variant="ghost" className="text-destructive" title={t("action.remove")} onClick={() => onRemove(row)}><Trash2 /></Button>}</div></div></article>)}</div>;
}

function HistoryList({ rows }: { rows: Array<{ id: string; event: string; note: string; revision_label: string | null; task_name: string | null; actor_name: string | null; created_at: string }> }) {
  const t = useTranslations("schedulePlanning"); const df = useDateFormat();
  if (!rows.length) return <EmptyState text={t("state.noHistory")} />;
  return <div className="overflow-hidden surface-panel rounded-xl"><div className="divide-y">{rows.map((row) => <div key={row.id} className="flex gap-3 p-4"><span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><History className="size-4" /></span><div className="min-w-0 flex-1"><p className="font-medium">{t("history." + row.event)}</p><p className="text-sm text-muted-foreground">{[row.revision_label, row.task_name, row.note].filter(Boolean).join(" / ") || t("state.noReason")}</p></div><div className="shrink-0 text-right text-xs text-muted-foreground"><p>{row.actor_name || t("common.system")}</p><p>{df.dateTime(row.created_at)}</p></div></div>)}</div></div>;
}

/**
 * Create a plan, or correct its name and description.
 *
 * The baseline label is only asked for on creation: it names the plan's first
 * revision, and revisions are edited in their own dialog. Offering it here
 * when renaming would let someone type into a field the request does not
 * carry.
 */
function PlanDialog({ project, plan, onClose, onSaved }: { project: string; plan?: SchedulePlan; onClose: () => void; onSaved: (id: string) => void }) {
  const t = useTranslations("schedulePlanning");
  const [form, setForm] = useState({ name: plan?.name ?? "", description: plan?.description ?? "", baseline_label: t("defaults.baseline") });
  const save = useMutation({
    mutationFn: () => plan
      ? updateSchedulePlan(plan.id, { name: form.name, description: form.description }).then((row) => ({ plan: row }))
      : createSchedulePlan({ project, ...form }),
    onSuccess: (row) => onSaved(row.plan.id),
  });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{t(plan ? "dialog.editPlanTitle" : "dialog.planTitle")}</DialogTitle><DialogDescription>{t(plan ? "dialog.editPlanHelp" : "dialog.planHelp")}</DialogDescription></DialogHeader><div className="grid gap-4"><FieldWrapper label={t("field.planName")} required><Input value={form.name} onChange={(event) => setForm((old) => ({ ...old, name: event.target.value }))} /></FieldWrapper>{!plan && <FieldWrapper label={t("field.baselineLabel")} required><Input value={form.baseline_label} onChange={(event) => setForm((old) => ({ ...old, baseline_label: event.target.value }))} /></FieldWrapper>}<FieldWrapper label={t("field.description")}><Textarea value={form.description} onChange={(event) => setForm((old) => ({ ...old, description: event.target.value }))} /></FieldWrapper></div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[form.name, t("field.planName")], [Boolean(plan) || form.baseline_label, t("field.baselineLabel")]]} disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Save />}{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

/**
 * Open a revision, or correct a draft before it is confirmed.
 *
 * The reason is required either way. It is the sentence that explains to
 * everyone reading the schedule later why the dates moved, so a revision
 * without one is a change nobody can account for.
 */
function RevisionDialog({ plan, revision, onClose, onSaved }: { plan: string; revision?: ScheduleRevision; onClose: () => void; onSaved: (id: string) => void }) {
  const t = useTranslations("schedulePlanning"); const [label, setLabel] = useState(revision?.label ?? ""); const [reason, setReason] = useState(revision?.reason ?? "");
  const save = useMutation({
    mutationFn: () => revision
      ? updateScheduleRevision(revision.id, { label, reason })
      : createScheduleRevision({ plan, label, reason }),
    onSuccess: (row) => onSaved(row.id),
  });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{t(revision ? "dialog.editRevisionTitle" : "dialog.revisionTitle")}</DialogTitle><DialogDescription>{t(revision ? "dialog.editRevisionHelp" : "dialog.revisionHelp")}</DialogDescription></DialogHeader><FieldWrapper label={t("field.revisionLabel")} required><Input value={label} onChange={(event) => setLabel(event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.revisionReason")} required><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></FieldWrapper><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[label, t("field.revisionLabel")], [reason, t("field.revisionReason")]]} disabled={save.isPending} onClick={() => save.mutate()}>{revision ? <Save /> : <GitBranch />}{t(revision ? "action.save" : "action.createRevision")}</Button></DialogFooter></DialogContent></Dialog>;
}

function TaskDialog({ revision, row, tasks, onClose, onSaved }: { revision: ScheduleRevision; row: ScheduleTask | null; tasks: ScheduleTask[]; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("schedulePlanning");
  const [form, setForm] = useState<ScheduleTaskPayload>({ revision: revision.id, parent: row?.parent ?? null, wbs_code: row?.wbs_code ?? "", name: row?.name ?? "", description: row?.description ?? "", planned_start: row?.planned_start ?? "", planned_end: row?.planned_end ?? "", weight: row?.weight ?? "1.00", sort_order: row?.sort_order ?? tasks.length });
  const set = <K extends keyof ScheduleTaskPayload>(key: K, value: ScheduleTaskPayload[K]) => setForm((old) => ({ ...old, [key]: value }));
  const save = useMutation({ mutationFn: () => row ? updateScheduleTask(row.id, form) : createScheduleTask(form), onSuccess: onSaved });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t(row ? "dialog.editTaskTitle" : "dialog.taskTitle")}</DialogTitle><DialogDescription>{t("dialog.taskHelp")}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><FieldWrapper label={t("field.wbs")} required><Input value={form.wbs_code} onChange={(event) => set("wbs_code", event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.parentTask")}><Select value={form.parent ?? "none"} onValueChange={(value) => set("parent", value === "none" ? null : value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t("field.noParent")}</SelectItem>{tasks.filter((item) => item.id !== row?.id).map((item) => <SelectItem key={item.id} value={item.id}>{item.wbs_code} - {item.name}</SelectItem>)}</SelectContent></Select></FieldWrapper><FieldWrapper label={t("field.taskName")} required className="sm:col-span-2"><Input value={form.name} onChange={(event) => set("name", event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.plannedStart")} required><Input type="date" value={form.planned_start} onChange={(event) => set("planned_start", event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.plannedEnd")} required><Input type="date" value={form.planned_end} onChange={(event) => set("planned_end", event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.weight")} hint={t("field.weightHelp")}><Input type="number" min="0" step="0.01" value={form.weight ?? "1.00"} onChange={(event) => set("weight", event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.description")} className="sm:col-span-2"><Textarea value={form.description} onChange={(event) => set("description", event.target.value)} /></FieldWrapper></div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[form.wbs_code, t("field.wbs")], [form.name, t("field.taskName")], [form.planned_start, t("field.plannedStart")], [form.planned_end, t("field.plannedEnd")]]} disabled={save.isPending} onClick={() => save.mutate()}><Save />{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function ProgressDialog({ project, task, onClose, onSaved }: { project: string; task: ScheduleTask; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("schedulePlanning"); const common = useTranslations("common");
  const candidates = useQuery({ queryKey: ["schedule-progress-candidates", project], queryFn: () => getProgressCandidates(project) });
  const [progress, setProgress] = useState(task.actual_progress); const [start, setStart] = useState(task.actual_start ?? ""); const [end, setEnd] = useState(task.actual_end ?? ""); const [note, setNote] = useState(task.progress_note); const [selected, setSelected] = useState<string[]>(task.progress_links.map((link) => link.progress_record));
  const lockedEvidence = new Set(task.progress_links.map((link) => link.progress_record));
  const save = useMutation({ mutationFn: () => confirmScheduleTaskProgress(task.id, { actual_progress: progress, actual_start: start || null, actual_end: Number(progress) >= 100 ? end || null : null, note, progress_record_ids: selected }), onSuccess: onSaved });
  const toggle = (id: string) => {
    if (lockedEvidence.has(id)) return;
    setSelected((old) => old.includes(id) ? old.filter((value) => value !== id) : [...old, id]);
  };
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t("dialog.progressTitle")}</DialogTitle><DialogDescription>{task.wbs_code} - {task.name}. {t("dialog.progressHelp")}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><FieldWrapper label={t("field.actualProgress")} required><Input type="number" min="0" max="100" step="0.01" value={progress} onChange={(event) => setProgress(event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.actualStart")} required={Number(progress) > 0}><Input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></FieldWrapper>{Number(progress) >= 100 && <FieldWrapper label={t("field.actualEnd")}><Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></FieldWrapper>}<FieldWrapper label={t("field.managerNote")} className="sm:col-span-2"><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></FieldWrapper><div className="space-y-2 sm:col-span-2"><p className="text-sm font-medium">{t("field.progressEvidence")}</p><p className="text-xs text-muted-foreground">{t("field.progressEvidenceHelp")}</p><div className="max-h-52 overflow-y-auto rounded-lg border">{candidates.isError ? <div className="p-5 text-center text-sm text-destructive">{t("state.candidatesLoadError")}</div> : candidates.isLoading ? <LoadingState /> : !(candidates.data?.count) ? <div className="p-5 text-center text-sm text-muted-foreground">{t("state.noConfirmedProgress")}</div> : candidates.data.results.map((row) => <EvidenceOption key={row.id} row={row} checked={selected.includes(row.id)} locked={lockedEvidence.has(row.id)} onToggle={() => toggle(row.id)} />)}</div></div></div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button disabledReason={Number(progress) < 0 || Number(progress) > 100 ? common("outOfRange", { field: t("field.actualProgress"), min: 0, max: 100 }) : undefined} requires={[[Number(progress) <= 0 || start, t("field.actualStart")]]} disabled={Number(progress) < 0 || Number(progress) > 100 || save.isPending} onClick={() => save.mutate()}><Check />{t("action.confirmProgress")}</Button></DialogFooter></DialogContent></Dialog>;
}

function EvidenceOption({ row, checked, locked, onToggle }: { row: ProgressCandidate; checked: boolean; locked: boolean; onToggle: () => void }) {
  const df = useDateFormat();
  return <label className="flex cursor-pointer items-start gap-3 border-b p-3 last:border-0 hover:bg-muted/30"><input type="checkbox" className="mt-1" checked={checked} disabled={locked} onChange={onToggle} /><div className="min-w-0"><p className="text-sm font-medium">{row.phase_name} / {row.percent_complete}%</p><p className="truncate text-xs text-muted-foreground">{row.description}</p><p className="mt-1 text-xs text-muted-foreground">{df.dateTime(row.captured_at)} / {row.submitted_by_name}</p></div></label>;
}

type MappingField = "wbs_code" | "parent_wbs" | "name" | "description" | "planned_start" | "planned_end" | "duration_days";

function ImportDialog({ project, plans, defaultPlan, onClose, onSaved }: { project: string; plans: SchedulePlan[]; defaultPlan: string; onClose: () => void; onSaved: (planId: string, revisionId: string) => void }) {
  const t = useTranslations("schedulePlanning");
  const [plan, setPlan] = useState(defaultPlan || "new"); const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<ScheduleImportPreview | null>(null); const [mapping, setMapping] = useState<Record<string, string>>({}); const [planName, setPlanName] = useState(""); const [revisionLabel, setRevisionLabel] = useState(""); const [reason, setReason] = useState("");
  const makePreview = useMutation({ mutationFn: () => createScheduleImportPreview({ project, plan: plan === "new" ? undefined : plan, file: file! }), onSuccess: (row) => { setPreview(row); setMapping(row.suggested_mapping); } });
  const confirm = useMutation({ mutationFn: () => confirmScheduleImport(preview!.id, { plan_name: plan === "new" ? planName : "", revision_label: revisionLabel, reason, mapping }), onSuccess: (row) => onSaved(row.plan, row.id) });
  // One spreadsheet column per field. Written out field by field below so each
  // compulsory one carries its own label and star (T-164); an end date or a
  // duration will do, so each of those two is starred only while the other is empty.
  const column = (field: MappingField) => <Select value={mapping[field] || "none"} onValueChange={(value) => setMapping((old) => ({ ...old, [field]: value === "none" ? "" : value }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t("mapping.notUsed")}</SelectItem>{(preview?.headers ?? []).map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}</SelectContent></Select>;
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden sm:max-w-4xl"><DialogHeader><DialogTitle>{t("dialog.importTitle")}</DialogTitle><DialogDescription>{t("dialog.importHelp")}</DialogDescription></DialogHeader><div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">{!preview ? <div className="grid gap-4 sm:grid-cols-2"><FieldWrapper label={t("field.importTarget")}><Select value={plan} onValueChange={setPlan}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">{t("field.newPlanFromExcel")}</SelectItem>{plans.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent></Select></FieldWrapper><FieldWrapper label={t("field.excelFile")} required><Input type="file" accept=".xlsx,.xlsm" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></FieldWrapper></div> : <><div className="rounded-lg border bg-muted/20 p-4"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-success/10 text-success"><FileSpreadsheet className="size-5" /></span><div><p className="font-medium">{preview.original_filename}</p><p className="text-xs text-muted-foreground">{preview.sheet_name} / {t("import.headerRow", { row: preview.header_row })}</p></div></div></div><div className="grid gap-4 sm:grid-cols-2">{plan === "new" && <FieldWrapper label={t("field.planName")} required><Input value={planName} onChange={(event) => setPlanName(event.target.value)} /></FieldWrapper>}<FieldWrapper label={t("field.revisionLabel")} required><Input value={revisionLabel} onChange={(event) => setRevisionLabel(event.target.value)} /></FieldWrapper>{plan !== "new" && <FieldWrapper label={t("field.revisionReason")} required className="sm:col-span-2"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></FieldWrapper>}</div><section className="space-y-3"><div><h3 className="font-semibold">{t("import.mappingTitle")}</h3><p className="text-sm text-muted-foreground">{t("import.mappingHelp")}</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><FieldWrapper label={t("mapping.wbs_code")} required>{column("wbs_code")}</FieldWrapper><FieldWrapper label={t("mapping.parent_wbs")}>{column("parent_wbs")}</FieldWrapper><FieldWrapper label={t("mapping.name")} required>{column("name")}</FieldWrapper><FieldWrapper label={t("mapping.description")}>{column("description")}</FieldWrapper><FieldWrapper label={t("mapping.planned_start")} required>{column("planned_start")}</FieldWrapper><FieldWrapper label={t("mapping.planned_end")} required={!mapping.duration_days}>{column("planned_end")}</FieldWrapper><FieldWrapper label={t("mapping.duration_days")} required={!mapping.planned_end}>{column("duration_days")}</FieldWrapper></div></section><section className="space-y-2"><h3 className="font-semibold">{t("import.previewTitle")}</h3><div className="overflow-x-auto rounded-lg border"><table className="min-w-full text-sm"><thead className="bg-muted/40"><tr>{preview.headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-muted-foreground">{header}</th>)}</tr></thead><tbody>{preview.preview_rows.map((row, index) => <tr key={index} className="border-t">{preview.headers.map((header) => <td key={header} className="max-w-56 truncate whitespace-nowrap px-3 py-2">{String(row[header] ?? "")}</td>)}</tr>)}</tbody></table></div></section></>}</div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button>{!preview ? <Button requires={[[file, t("field.excelFile")]]} disabled={makePreview.isPending} onClick={() => makePreview.mutate()}>{makePreview.isPending ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}{t("action.preview")}</Button> : <Button requires={[[mapping.wbs_code, t("mapping.wbs_code")], [mapping.name, t("mapping.name")], [mapping.planned_start, t("mapping.planned_start")], [mapping.planned_end || mapping.duration_days, t("mapping.planned_end")], [revisionLabel, t("field.revisionLabel")], [plan !== "new" || planName, t("field.planName")], [plan === "new" || reason, t("field.revisionReason")]]} disabled={confirm.isPending} onClick={() => confirm.mutate()}>{confirm.isPending ? <Loader2 className="animate-spin" /> : <Upload />}{t("action.confirmImport")}</Button>}</DialogFooter></DialogContent></Dialog>;
}

function LoadingState() { return <div className="grid min-h-40 place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></div>; }

/**
 * A query's two unhappy answers, kept apart from its empty one.
 *
 * The history tab answered every failure with "no schedule history yet":
 * `data?.results ?? []` turns a 500 into zero rows, and from there nothing
 * downstream can tell an empty list from a dead request. The backend fault
 * that made it fail is fixed, but the screen would have gone on reporting an
 * absence it never observed the next time anything broke. Three of this
 * file's five queries did that; only `plans` was ever handled.
 *
 * `children` is an element rather than a call, so a list's own empty state is
 * only reached once there is a real answer for it to be empty.
 */
function QueryPanel({ query, errorText, children }: { query: { isError: boolean; isLoading: boolean }; errorText: string; children: ReactNode }) {
  if (query.isError) return <EmptyState text={errorText} danger />;
  if (query.isLoading) return <LoadingState />;
  return <>{children}</>;
}

function EmptyState({ text, danger = false }: { text: string; danger?: boolean }) { return <div className={danger ? "rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive" : "rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground"}>{text}</div>; }
