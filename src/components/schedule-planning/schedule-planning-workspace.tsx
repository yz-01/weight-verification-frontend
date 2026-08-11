"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  BarChart3,
  CalendarDays,
  Check,
  Download,
  FileSpreadsheet,
  GitBranch,
  History,
  List,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ConsultantProjectPicker } from "@/components/consultant-workflow/project-scope-picker";
import { ScheduleGantt } from "@/components/schedule-planning/schedule-gantt";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  updateScheduleTask,
} from "@/services/schedule-planning.service";

type ViewMode = "list" | "gantt" | "revisions" | "history";

const tone = (status: string) => {
  if (["ACTIVE", "CONFIRMED"].includes(status)) return "positive" as const;
  if (["ARCHIVED"].includes(status)) return "neutral" as const;
  return "warning" as const;
};

export function SchedulePlanningWorkspace() {
  const t = useTranslations("schedulePlanning");
  const { can } = useAuth();
  const qc = useQueryClient();
  const [project, setProject] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [selectedRevision, setSelectedRevision] = useState("");
  const [view, setView] = useState<ViewMode>("list");
  const [planDialog, setPlanDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [revisionDialog, setRevisionDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduleTask | "new" | null>(null);
  const [progressTask, setProgressTask] = useState<ScheduleTask | null>(null);
  const [removingTask, setRemovingTask] = useState<ScheduleTask | null>(null);
  const [removingRevision, setRemovingRevision] = useState<ScheduleRevision | null>(null);
  const [confirmingRevision, setConfirmingRevision] = useState<ScheduleRevision | null>(null);
  const [archivingPlan, setArchivingPlan] = useState<SchedulePlan | null>(null);

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
  const revision =
    revisions.data?.results.find((row) => row.id === selectedRevision) ??
    revisions.data?.results.find((row) => row.status === "DRAFT") ??
    revisions.data?.results.find((row) => row.is_current) ??
    revisions.data?.results[0] ??
    null;
  const tasks = useQuery({
    queryKey: ["schedule-tasks", revision?.id],
    queryFn: () => getScheduleTasks({ revision: revision?.id, page_size: 200 }),
    enabled: Boolean(revision),
  });
  const overview = useQuery({
    queryKey: ["schedule-overview", plan?.id],
    queryFn: () => getScheduleOverview(plan!.id),
    enabled: Boolean(plan),
  });
  const historyRows = useQuery({
    queryKey: ["schedule-history", plan?.id],
    queryFn: () => getScheduleHistory(plan!.id),
    enabled: Boolean(plan) && view === "history",
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

  const currentSummary = overview.data?.summary;
  const rows = tasks.data?.results ?? [];
  const hasDraft = revisions.data?.results.some((row) => row.status === "DRAFT");

  return (
    <div className="space-y-5">
      <ListHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          can("schedule.manage") ? (
            <div className="flex flex-wrap justify-end gap-2">
              {can("schedule.confirm") && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!project}
                  onClick={() => setImportDialog(true)}
                >
                  <Upload />{t("action.importExcel")}
                </Button>
              )}
              <Button size="sm" disabled={!project} onClick={() => setPlanDialog(true)}>
                <Plus />{t("action.newPlan")}
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-3 rounded-lg border bg-card p-3 shadow-sm lg:grid-cols-[minmax(260px,1fr)_minmax(260px,1fr)_auto] lg:items-end">
        <FieldWrapper label={t("field.project")}>
          <ConsultantProjectPicker
            value={project}
            onChange={(value) => {
              setProject(value);
              setSelectedPlan("");
              setSelectedRevision("");
            }}
          />
        </FieldWrapper>
        <FieldWrapper label={t("field.plan")}>
          <Select
            value={plan?.id}
            onValueChange={(value) => {
              setSelectedPlan(value);
              setSelectedRevision("");
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
        <div className="flex flex-wrap gap-2">
          {plan && revision && (
            <>
              <Button variant="outline" size="sm" onClick={() => void exportSchedule(plan.id, revision.id, "xlsx")}>
                <Download />Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => void exportSchedule(plan.id, revision.id, "pdf")}>
                <Download />PDF
              </Button>
            </>
          )}
          {plan && can("schedule.manage") && plan.status !== "ARCHIVED" && (
            <Button variant="ghost" size="icon-sm" title={t("action.archive")} onClick={() => setArchivingPlan(plan)}>
              <Archive />
            </Button>
          )}
        </div>
      </div>

      {!project ? (
        <EmptyState text={t("state.chooseProject")} />
      ) : plans.isLoading ? (
        <LoadingState />
      ) : plans.isError ? (
        <EmptyState text={t("state.loadError")} danger />
      ) : !plan ? (
        <EmptyState text={t("state.noPlans")} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={CalendarDays} label={t("summary.tasks")} value={String(currentSummary?.task_count ?? 0)} />
            <SummaryCard icon={Check} label={t("summary.completed")} value={String(currentSummary?.completed_count ?? 0)} tone="positive" />
            <SummaryCard icon={AlertTriangle} label={t("summary.delayed")} value={String(currentSummary?.delayed_count ?? 0)} tone="danger" />
            <SummaryCard icon={BarChart3} label={t("summary.progress")} value={(currentSummary?.actual_progress ?? "0") + "%"} hint={t("summary.planned", { value: currentSummary?.planned_progress ?? "0" })} />
          </div>

          <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><GitBranch className="size-5" /></span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-semibold">{plan.name}</h2>
                  <StatusBadge label={t("planStatus." + plan.status)} tone={tone(plan.status)} />
                </div>
                <p className="truncate text-sm text-muted-foreground">{revision ? revision.label : t("state.noRevision")}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {can("schedule.manage") && revision?.status === "DRAFT" && (
                <Button size="sm" onClick={() => setEditingTask("new")}><Plus />{t("action.addTask")}</Button>
              )}
              {can("schedule.manage") && revision?.is_current && !hasDraft && plan.status !== "ARCHIVED" && (
                <Button size="sm" variant="outline" onClick={() => setRevisionDialog(true)}><GitBranch />{t("action.newRevision")}</Button>
              )}
              {can("schedule.confirm") && revision?.status === "DRAFT" && rows.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setConfirmingRevision(revision)}><Check />{t("action.confirmRevision")}</Button>
              )}
            </div>
          </div>

          <ViewSelector value={view} onChange={setView} />
          {view === "list" && (
            <ScheduleTaskTable
              rows={rows}
              revision={revision}
              canManage={can("schedule.manage")}
              canConfirm={can("schedule.confirm")}
              onEdit={setEditingTask}
              onProgress={setProgressTask}
              onRemove={setRemovingTask}
            />
          )}
          {view === "gantt" && <ScheduleGantt tasks={rows} />}
          {view === "revisions" && (
            <RevisionList
              rows={revisions.data?.results ?? []}
              selected={revision?.id ?? ""}
              canManage={can("schedule.manage")}
              canConfirm={can("schedule.confirm")}
              onSelect={(id) => { setSelectedRevision(id); setView("list"); }}
              onConfirm={setConfirmingRevision}
              onRemove={setRemovingRevision}
            />
          )}
          {view === "history" && <HistoryList loading={historyRows.isLoading} rows={historyRows.data?.results ?? []} />}
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

function SummaryCard({ icon: Icon, label, value, hint, tone = "normal" }: { icon: typeof CalendarDays; label: string; value: string; hint?: string; tone?: "normal" | "positive" | "danger" }) {
  const color = tone === "positive" ? "bg-success/10 text-success" : tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary";
  return <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm"><span className={"grid size-10 place-items-center rounded-lg " + color}><Icon className="size-5" /></span><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="text-xl font-semibold tabular-nums">{value}</p>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div></div>;
}

function ViewSelector({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
  const t = useTranslations("schedulePlanning");
  const options: Array<[ViewMode, typeof List]> = [["list", List], ["gantt", BarChart3], ["revisions", GitBranch], ["history", History]];
  return <div className="flex w-full gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-1 sm:w-fit">{options.map(([key, Icon]) => <Button key={key} size="sm" variant={value === key ? "default" : "ghost"} className="shrink-0" onClick={() => onChange(key)}><Icon />{t("view." + key)}</Button>)}</div>;
}

function ScheduleTaskTable({ rows, revision, canManage, canConfirm, onEdit, onProgress, onRemove }: { rows: ScheduleTask[]; revision: ScheduleRevision | null; canManage: boolean; canConfirm: boolean; onEdit: (row: ScheduleTask) => void; onProgress: (row: ScheduleTask) => void; onRemove: (row: ScheduleTask) => void }) {
  const t = useTranslations("schedulePlanning");
  const df = useDateFormat();
  const depths = useMemo(() => {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const result = new Map<string, number>();
    rows.forEach((row) => { let depth = 0; let parent = row.parent ? byId.get(row.parent) : undefined; const seen = new Set<string>(); while (parent && !seen.has(parent.id) && depth < 8) { seen.add(parent.id); depth += 1; parent = parent.parent ? byId.get(parent.parent) : undefined; } result.set(row.id, depth); });
    return result;
  }, [rows]);
  if (!rows.length) return <EmptyState text={t("state.noTasks")} />;
  return <div className="overflow-hidden rounded-lg border bg-card shadow-sm"><Table><TableHeader><TableRow><TableHead>{t("field.wbs")}</TableHead><TableHead>{t("field.task")}</TableHead><TableHead>{t("field.plannedDates")}</TableHead><TableHead>{t("field.plannedProgress")}</TableHead><TableHead>{t("field.actualProgress")}</TableHead><TableHead>{t("field.delay")}</TableHead><TableHead className="text-right">{t("field.actions")}</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.wbs_code}</TableCell><TableCell><div style={{ paddingLeft: (depths.get(row.id) ?? 0) * 18 }}><p className="max-w-72 truncate font-medium">{row.name}</p>{row.description && <p className="max-w-72 truncate text-xs text-muted-foreground">{row.description}</p>}</div></TableCell><TableCell><p>{df.date(row.planned_start)}</p><p className="text-xs text-muted-foreground">{df.date(row.planned_end)} / {row.duration_days} {t("common.day")}</p></TableCell><TableCell><ProgressValue value={Number(row.planned_progress)} /></TableCell><TableCell><ProgressValue value={Number(row.actual_progress)} /></TableCell><TableCell>{row.is_delayed ? <StatusBadge label={t("delay.days", { count: row.delay_days })} tone="danger" /> : <StatusBadge label={t("status.onTrack")} tone="positive" />}</TableCell><TableCell><div className="flex justify-end gap-1">{canConfirm && revision?.status === "CONFIRMED" && <Button size="icon-sm" variant="ghost" title={t("action.confirmProgress")} onClick={() => onProgress(row)}><Check /></Button>}{canManage && revision?.status === "DRAFT" && <><Button size="icon-sm" variant="ghost" title={t("action.edit")} onClick={() => onEdit(row)}><Pencil /></Button><Button size="icon-sm" variant="ghost" className="text-destructive" title={t("action.remove")} onClick={() => onRemove(row)}><Trash2 /></Button></>}</div></TableCell></TableRow>)}</TableBody></Table></div>;
}

function ProgressValue({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(value, 100));
  return <div className="w-28"><div className="mb-1 flex justify-between text-xs"><span>{safe.toFixed(1)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: safe + "%" }} /></div></div>;
}

function RevisionList({ rows, selected, canManage, canConfirm, onSelect, onConfirm, onRemove }: { rows: ScheduleRevision[]; selected: string; canManage: boolean; canConfirm: boolean; onSelect: (id: string) => void; onConfirm: (row: ScheduleRevision) => void; onRemove: (row: ScheduleRevision) => void }) {
  const t = useTranslations("schedulePlanning"); const df = useDateFormat();
  return <div className="grid gap-3 lg:grid-cols-2">{rows.map((row) => <article key={row.id} className={"rounded-lg border bg-card p-4 shadow-sm " + (selected === row.id ? "ring-2 ring-primary/30" : "")}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{row.label}</h3><StatusBadge label={t("revisionStatus." + row.status)} tone={tone(row.status)} />{row.is_current && <StatusBadge label={t("status.current")} tone="info" />}</div><p className="mt-1 text-sm text-muted-foreground">{t("revision.number", { number: row.revision_number })} / {t("source." + row.source)}</p></div><GitBranch className="size-5 text-muted-foreground" /></div><p className="mt-3 min-h-10 text-sm">{row.reason || t("state.noReason")}</p><div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"><span className="text-xs text-muted-foreground">{row.task_count} {t("common.tasks")} {row.confirmed_at ? " / " + df.dateTime(row.confirmed_at) : ""}</span><div className="ml-auto flex gap-1"><Button size="sm" variant="outline" onClick={() => onSelect(row.id)}>{t("action.open")}</Button>{canConfirm && row.status === "DRAFT" && row.task_count > 0 && <Button size="icon-sm" title={t("action.confirmRevision")} onClick={() => onConfirm(row)}><Check /></Button>}{canManage && row.status === "DRAFT" && <Button size="icon-sm" variant="ghost" className="text-destructive" title={t("action.remove")} onClick={() => onRemove(row)}><Trash2 /></Button>}</div></div></article>)}</div>;
}

function HistoryList({ loading, rows }: { loading: boolean; rows: Array<{ id: string; event: string; note: string; revision_label: string | null; task_name: string | null; actor_name: string | null; created_at: string }> }) {
  const t = useTranslations("schedulePlanning"); const df = useDateFormat();
  if (loading) return <LoadingState />;
  if (!rows.length) return <EmptyState text={t("state.noHistory")} />;
  return <div className="overflow-hidden rounded-lg border bg-card shadow-sm"><div className="divide-y">{rows.map((row) => <div key={row.id} className="flex gap-3 p-4"><span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><History className="size-4" /></span><div className="min-w-0 flex-1"><p className="font-medium">{t("history." + row.event)}</p><p className="text-sm text-muted-foreground">{[row.revision_label, row.task_name, row.note].filter(Boolean).join(" / ") || t("state.noReason")}</p></div><div className="shrink-0 text-right text-xs text-muted-foreground"><p>{row.actor_name || t("common.system")}</p><p>{df.dateTime(row.created_at)}</p></div></div>)}</div></div>;
}

function PlanDialog({ project, onClose, onSaved }: { project: string; onClose: () => void; onSaved: (id: string) => void }) {
  const t = useTranslations("schedulePlanning");
  const [form, setForm] = useState({ name: "", description: "", baseline_label: t("defaults.baseline") });
  const save = useMutation({ mutationFn: () => createSchedulePlan({ project, ...form }), onSuccess: (row) => onSaved(row.plan.id) });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{t("dialog.planTitle")}</DialogTitle><DialogDescription>{t("dialog.planHelp")}</DialogDescription></DialogHeader><div className="grid gap-4"><FieldWrapper label={t("field.planName")} required><Input value={form.name} onChange={(event) => setForm((old) => ({ ...old, name: event.target.value }))} /></FieldWrapper><FieldWrapper label={t("field.baselineLabel")} required><Input value={form.baseline_label} onChange={(event) => setForm((old) => ({ ...old, baseline_label: event.target.value }))} /></FieldWrapper><FieldWrapper label={t("field.description")}><Textarea value={form.description} onChange={(event) => setForm((old) => ({ ...old, description: event.target.value }))} /></FieldWrapper></div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button disabled={!form.name.trim() || !form.baseline_label.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Save />}{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function RevisionDialog({ plan, onClose, onSaved }: { plan: string; onClose: () => void; onSaved: (id: string) => void }) {
  const t = useTranslations("schedulePlanning"); const [label, setLabel] = useState(""); const [reason, setReason] = useState("");
  const save = useMutation({ mutationFn: () => createScheduleRevision({ plan, label, reason }), onSuccess: (row) => onSaved(row.id) });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{t("dialog.revisionTitle")}</DialogTitle><DialogDescription>{t("dialog.revisionHelp")}</DialogDescription></DialogHeader><FieldWrapper label={t("field.revisionLabel")} required><Input value={label} onChange={(event) => setLabel(event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.revisionReason")} required><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></FieldWrapper><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button disabled={!label.trim() || !reason.trim() || save.isPending} onClick={() => save.mutate()}><GitBranch />{t("action.createRevision")}</Button></DialogFooter></DialogContent></Dialog>;
}

function TaskDialog({ revision, row, tasks, onClose, onSaved }: { revision: ScheduleRevision; row: ScheduleTask | null; tasks: ScheduleTask[]; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("schedulePlanning");
  const [form, setForm] = useState<ScheduleTaskPayload>({ revision: revision.id, parent: row?.parent ?? null, wbs_code: row?.wbs_code ?? "", name: row?.name ?? "", description: row?.description ?? "", planned_start: row?.planned_start ?? "", planned_end: row?.planned_end ?? "", sort_order: row?.sort_order ?? tasks.length });
  const set = <K extends keyof ScheduleTaskPayload>(key: K, value: ScheduleTaskPayload[K]) => setForm((old) => ({ ...old, [key]: value }));
  const save = useMutation({ mutationFn: () => row ? updateScheduleTask(row.id, form) : createScheduleTask(form), onSuccess: onSaved });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t(row ? "dialog.editTaskTitle" : "dialog.taskTitle")}</DialogTitle><DialogDescription>{t("dialog.taskHelp")}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><FieldWrapper label={t("field.wbs")} required><Input value={form.wbs_code} onChange={(event) => set("wbs_code", event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.parentTask")}><Select value={form.parent ?? "none"} onValueChange={(value) => set("parent", value === "none" ? null : value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t("field.noParent")}</SelectItem>{tasks.filter((item) => item.id !== row?.id).map((item) => <SelectItem key={item.id} value={item.id}>{item.wbs_code} - {item.name}</SelectItem>)}</SelectContent></Select></FieldWrapper><FieldWrapper label={t("field.taskName")} required className="sm:col-span-2"><Input value={form.name} onChange={(event) => set("name", event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.plannedStart")} required><Input type="date" value={form.planned_start} onChange={(event) => set("planned_start", event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.plannedEnd")} required><Input type="date" value={form.planned_end} onChange={(event) => set("planned_end", event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.description")} className="sm:col-span-2"><Textarea value={form.description} onChange={(event) => set("description", event.target.value)} /></FieldWrapper></div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button disabled={!form.wbs_code.trim() || !form.name.trim() || !form.planned_start || !form.planned_end || save.isPending} onClick={() => save.mutate()}><Save />{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function ProgressDialog({ project, task, onClose, onSaved }: { project: string; task: ScheduleTask; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("schedulePlanning");
  const candidates = useQuery({ queryKey: ["schedule-progress-candidates", project], queryFn: () => getProgressCandidates(project) });
  const [progress, setProgress] = useState(task.actual_progress); const [start, setStart] = useState(task.actual_start ?? ""); const [end, setEnd] = useState(task.actual_end ?? ""); const [note, setNote] = useState(task.progress_note); const [selected, setSelected] = useState<string[]>(task.progress_links.map((link) => link.progress_record));
  const lockedEvidence = new Set(task.progress_links.map((link) => link.progress_record));
  const save = useMutation({ mutationFn: () => confirmScheduleTaskProgress(task.id, { actual_progress: progress, actual_start: start || null, actual_end: Number(progress) >= 100 ? end || null : null, note, progress_record_ids: selected }), onSuccess: onSaved });
  const toggle = (id: string) => {
    if (lockedEvidence.has(id)) return;
    setSelected((old) => old.includes(id) ? old.filter((value) => value !== id) : [...old, id]);
  };
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t("dialog.progressTitle")}</DialogTitle><DialogDescription>{task.wbs_code} - {task.name}. {t("dialog.progressHelp")}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><FieldWrapper label={t("field.actualProgress")} required><Input type="number" min="0" max="100" step="0.01" value={progress} onChange={(event) => setProgress(event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.actualStart")}><Input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></FieldWrapper>{Number(progress) >= 100 && <FieldWrapper label={t("field.actualEnd")}><Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></FieldWrapper>}<FieldWrapper label={t("field.managerNote")} className="sm:col-span-2"><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></FieldWrapper><div className="space-y-2 sm:col-span-2"><p className="text-sm font-medium">{t("field.progressEvidence")}</p><p className="text-xs text-muted-foreground">{t("field.progressEvidenceHelp")}</p><div className="max-h-52 overflow-y-auto rounded-lg border">{candidates.isLoading ? <LoadingState /> : !(candidates.data?.count) ? <div className="p-5 text-center text-sm text-muted-foreground">{t("state.noConfirmedProgress")}</div> : candidates.data.results.map((row) => <EvidenceOption key={row.id} row={row} checked={selected.includes(row.id)} locked={lockedEvidence.has(row.id)} onToggle={() => toggle(row.id)} />)}</div></div></div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button disabled={Number(progress) < 0 || Number(progress) > 100 || (Number(progress) > 0 && !start) || save.isPending} onClick={() => save.mutate()}><Check />{t("action.confirmProgress")}</Button></DialogFooter></DialogContent></Dialog>;
}

function EvidenceOption({ row, checked, locked, onToggle }: { row: ProgressCandidate; checked: boolean; locked: boolean; onToggle: () => void }) {
  const df = useDateFormat();
  return <label className="flex cursor-pointer items-start gap-3 border-b p-3 last:border-0 hover:bg-muted/30"><input type="checkbox" className="mt-1" checked={checked} disabled={locked} onChange={onToggle} /><div className="min-w-0"><p className="text-sm font-medium">{row.phase_name} / {row.percent_complete}%</p><p className="truncate text-xs text-muted-foreground">{row.description}</p><p className="mt-1 text-xs text-muted-foreground">{df.dateTime(row.captured_at)} / {row.submitted_by_name}</p></div></label>;
}

const MAPPING_FIELDS = ["wbs_code", "parent_wbs", "name", "description", "planned_start", "planned_end", "duration_days"] as const;

function ImportDialog({ project, plans, defaultPlan, onClose, onSaved }: { project: string; plans: SchedulePlan[]; defaultPlan: string; onClose: () => void; onSaved: (planId: string, revisionId: string) => void }) {
  const t = useTranslations("schedulePlanning");
  const [plan, setPlan] = useState(defaultPlan || "new"); const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<ScheduleImportPreview | null>(null); const [mapping, setMapping] = useState<Record<string, string>>({}); const [planName, setPlanName] = useState(""); const [revisionLabel, setRevisionLabel] = useState(""); const [reason, setReason] = useState("");
  const makePreview = useMutation({ mutationFn: () => createScheduleImportPreview({ project, plan: plan === "new" ? undefined : plan, file: file! }), onSuccess: (row) => { setPreview(row); setMapping(row.suggested_mapping); } });
  const confirm = useMutation({ mutationFn: () => confirmScheduleImport(preview!.id, { plan_name: plan === "new" ? planName : "", revision_label: revisionLabel, reason, mapping }), onSuccess: (row) => onSaved(row.plan, row.id) });
  const requiredReady = Boolean(mapping.wbs_code && mapping.name && mapping.planned_start && (mapping.planned_end || mapping.duration_days));
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden sm:max-w-4xl"><DialogHeader><DialogTitle>{t("dialog.importTitle")}</DialogTitle><DialogDescription>{t("dialog.importHelp")}</DialogDescription></DialogHeader><div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">{!preview ? <div className="grid gap-4 sm:grid-cols-2"><FieldWrapper label={t("field.importTarget")}><Select value={plan} onValueChange={setPlan}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">{t("field.newPlanFromExcel")}</SelectItem>{plans.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent></Select></FieldWrapper><FieldWrapper label={t("field.excelFile")} required><Input type="file" accept=".xlsx,.xlsm" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></FieldWrapper></div> : <><div className="rounded-lg border bg-muted/20 p-4"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-success/10 text-success"><FileSpreadsheet className="size-5" /></span><div><p className="font-medium">{preview.original_filename}</p><p className="text-xs text-muted-foreground">{preview.sheet_name} / {t("import.headerRow", { row: preview.header_row })}</p></div></div></div><div className="grid gap-4 sm:grid-cols-2">{plan === "new" && <FieldWrapper label={t("field.planName")} required><Input value={planName} onChange={(event) => setPlanName(event.target.value)} /></FieldWrapper>}<FieldWrapper label={t("field.revisionLabel")} required><Input value={revisionLabel} onChange={(event) => setRevisionLabel(event.target.value)} /></FieldWrapper>{plan !== "new" && <FieldWrapper label={t("field.revisionReason")} required className="sm:col-span-2"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></FieldWrapper>}</div><section className="space-y-3"><div><h3 className="font-semibold">{t("import.mappingTitle")}</h3><p className="text-sm text-muted-foreground">{t("import.mappingHelp")}</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{MAPPING_FIELDS.map((field) => <FieldWrapper key={field} label={t("mapping." + field)} required={["wbs_code", "name", "planned_start"].includes(field)}><Select value={mapping[field] || "none"} onValueChange={(value) => setMapping((old) => ({ ...old, [field]: value === "none" ? "" : value }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t("mapping.notUsed")}</SelectItem>{preview.headers.map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}</SelectContent></Select></FieldWrapper>)}</div></section><section className="space-y-2"><h3 className="font-semibold">{t("import.previewTitle")}</h3><div className="overflow-x-auto rounded-lg border"><table className="min-w-full text-sm"><thead className="bg-muted/40"><tr>{preview.headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-muted-foreground">{header}</th>)}</tr></thead><tbody>{preview.preview_rows.map((row, index) => <tr key={index} className="border-t">{preview.headers.map((header) => <td key={header} className="max-w-56 truncate whitespace-nowrap px-3 py-2">{String(row[header] ?? "")}</td>)}</tr>)}</tbody></table></div></section></>}</div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button>{!preview ? <Button disabled={!file || makePreview.isPending} onClick={() => makePreview.mutate()}>{makePreview.isPending ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}{t("action.preview")}</Button> : <Button disabled={!requiredReady || !revisionLabel.trim() || (plan === "new" && !planName.trim()) || (plan !== "new" && !reason.trim()) || confirm.isPending} onClick={() => confirm.mutate()}>{confirm.isPending ? <Loader2 className="animate-spin" /> : <Upload />}{t("action.confirmImport")}</Button>}</DialogFooter></DialogContent></Dialog>;
}

function LoadingState() { return <div className="grid min-h-40 place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></div>; }
function EmptyState({ text, danger = false }: { text: string; danger?: boolean }) { return <div className={danger ? "rounded-lg border border-destructive/30 bg-destructive/5 p-10 text-center text-sm text-destructive" : "rounded-lg border border-dashed bg-muted/15 p-10 text-center text-sm text-muted-foreground"}>{text}</div>; }
