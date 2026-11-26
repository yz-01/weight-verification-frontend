"use client";

/**
 * 施工计划's site records and consultant applications (客户 11-26 事项 7, 12,
 * 13, 14 = JB266, JB271, JB272, JB273).
 *
 * - `RecordLine`: one 施工进度 record as the schedule shows it - number,
 *   photographs (press to enlarge), 施工分类, time, who recorded it.
 * - `ProgressRecordPicker` (JB271): 「关联现场进度」 in 确认实际进度, searched on
 *   the server by number / 施工分类 / day, a page at a time; the records
 *   already linked stay above, ticked and locked.
 * - `LinkedRecordsDialog` (JB273): 「附 N 条现场记录」 opened, without
 *   确认进度; each record opens its own window.
 * - `HistoryList` / `HistoryEntryDialog` (JB272): 操作记录, each 「已确认实际
 *   进度」 with 确认前 → 确认后, the records linked that time, who, when, 备注;
 *   pressed, the whole entry.
 * - `ConsultantApprovalCell` (JB266): the 「顾问审批」 column.
 */

import { useQuery } from "@tanstack/react-query";
import { ChartNoAxesCombined, History, Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { DayRange, Pager } from "@/components/progress/progress-photos";
import { InPlaceRecord } from "@/components/shared/in-place-record";
import { StatusBadge } from "@/components/shared/page-primitives";
import { PhotoStrip, recordPhotos } from "@/components/shared/photo-thumb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type {
  ProgressCandidate,
  ScheduleConsultantApproval,
  ScheduleHistoryEntry,
  ScheduleTask,
} from "@/interfaces/schedule-planning";
import { useDateFormat } from "@/lib/dates";
import { usePercentText } from "@/lib/progress-percent";
import { getConstructionPhases } from "@/services/contractor-ops.service";
import { getProgressCandidates, getTaskLinkedRecords } from "@/services/schedule-planning.service";

const PAGE_SIZE = 20;

/** A record's number, or its 施工分类 for a record from before numbers. */
export function recordLabel(row: Pick<ProgressCandidate, "record_no" | "phase_name">): string {
  return row.record_no || row.phase_name || "";
}

/** Who recorded it: the recorder fields, else the name the list sent before JB271. */
export function recorderOf(row: Pick<ProgressCandidate, "created_by_name" | "submitted_by_name">): string {
  return row.created_by_name || row.submitted_by_name || "";
}

/**
 * One 施工进度 record: photographs (press one to enlarge), number, 施工分类,
 * time, who. `onOpen` makes the words open the original record.
 */
export function RecordLine({
  row,
  recorderWord,
  onOpen,
  badge,
}: {
  row: ProgressCandidate;
  /** 「上传人」 in 关联现场进度 (事项 12), 「记录人」 elsewhere (事项 14). */
  recorderWord: "uploader" | "recorder";
  onOpen?: () => void;
  badge?: React.ReactNode;
}) {
  const t = useTranslations("jb266");
  const df = useDateFormat();
  const percent = usePercentText();
  const label = recordLabel(row);
  const words = (
    <div className="min-w-0 space-y-0.5 text-left">
      <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
        <span className="tabular-nums" data-slot="record-no">{row.record_no || "—"}</span>
        <span className="text-muted-foreground">·</span>
        <span>{row.phase_name}</span>
        {row.percent_complete != null && (
          <span className="text-xs font-normal text-muted-foreground">{percent(row.percent_complete)}</span>
        )}
        {badge}
      </p>
      {row.description && <p className="truncate text-xs text-muted-foreground">{row.description}</p>}
      <p className="text-xs text-muted-foreground">
        {t("recordedAt")} {df.dateTime(row.captured_at)} · {t(recorderWord)} {recorderOf(row) || "—"}
      </p>
    </div>
  );
  return (
    <div className="flex min-w-0 items-start gap-3" data-slot="schedule-record-line">
      <PhotoStrip
        thumbs={row.photo_thumbs}
        coverUrl={row.cover_photo_url}
        count={row.photo_count}
        icon={ChartNoAxesCombined}
        reference={label}
        photos={recordPhotos("PROGRESS", row.id, label)}
        squares={3}
      />
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 rounded-md hover:underline"
          title={t("openRecord")}
        >
          {words}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{words}</div>
      )}
    </div>
  );
}

/**
 * 「关联现场进度」 (JB271, 客户 11-26 事项 12): number, photographs, 施工分类,
 * time and uploader on every row; search by number / 施工分类 / day on the
 * server, a page at a time, so a project with thousands of records still
 * finds the right one. The records the task already has stay on top, ticked
 * and locked (a confirmation never takes evidence away, JB272).
 */
export function ProgressRecordPicker({
  project,
  linked,
  selected,
  onToggle,
}: {
  project: string;
  /** The task's records already linked: shown first, ticked, locked. */
  linked: ProgressCandidate[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("jb266");
  const tSchedule = useTranslations("schedulePlanning");
  const [search, setSearch] = useState("");
  const [phase, setPhase] = useState("");
  const [range, setRange] = useState<{ date_from?: string; date_to?: string }>({});
  const [page, setPage] = useState(1);
  const query = {
    page,
    page_size: PAGE_SIZE,
    search: search.trim() || undefined,
    phase: phase || undefined,
    date_from: range.date_from,
    date_to: range.date_to,
  };
  const candidates = useQuery({
    queryKey: ["schedule-progress-candidates", project, query],
    queryFn: () => getProgressCandidates(project, query),
    enabled: Boolean(project),
    placeholderData: (previous) => previous,
  });
  const phases = useQuery({
    queryKey: ["construction-phases", project],
    queryFn: () => getConstructionPhases({ project, page_size: 200 }),
    enabled: Boolean(project),
  });
  const locked = new Set(linked.map((row) => row.id));
  const rows = (candidates.data?.results ?? []).filter((row) => !locked.has(row.id));
  const filtered = Boolean(query.search || query.phase || query.date_from || query.date_to);

  return (
    <div className="space-y-2" data-slot="progress-record-picker">
      {linked.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t("alreadyLinked", { count: linked.length })}</p>
          <div className="max-h-44 overflow-y-auto rounded-lg border bg-muted/20">
            {linked.map((row) => (
              <label key={row.id} className="flex items-start gap-3 border-b p-2.5 last:border-0">
                <input type="checkbox" className="mt-1" checked disabled aria-label={recordLabel(row)} />
                <RecordLine row={row} recorderWord="uploader" />
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            value={search}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={phase || "ALL"}
          onValueChange={(value) => {
            setPhase(value === "ALL" ? "" : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full" aria-label={t("phase")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("allPhases")}</SelectItem>
            {(phases.data?.results ?? []).map((row) => (
              <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DayRange
        from={range.date_from ?? ""}
        to={range.date_to ?? ""}
        onChange={(next) => {
          setRange(next);
          setPage(1);
        }}
      />
      <div className="max-h-80 overflow-y-auto rounded-lg border">
        {candidates.isError ? (
          <div className="p-5 text-center text-sm text-destructive">{tSchedule("state.candidatesLoadError")}</div>
        ) : candidates.isLoading ? (
          <div className="grid min-h-24 place-items-center"><Loader2 className="size-5 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <div className="p-5 text-center text-sm text-muted-foreground">
            {filtered ? t("noMatch") : tSchedule("state.noConfirmedProgress")}
          </div>
        ) : (
          rows.map((row) => (
            <label
              key={row.id}
              className="flex cursor-pointer items-start gap-3 border-b p-2.5 last:border-0 hover:bg-muted/30"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(row.id)}
                onChange={() => onToggle(row.id)}
                aria-label={recordLabel(row)}
              />
              <RecordLine row={row} recorderWord="uploader" />
            </label>
          ))
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{t("found", { count: candidates.data?.count ?? 0 })}</span>
        {(candidates.data?.total_pages ?? 1) > 1 && (
          <Pager page={page} pages={candidates.data?.total_pages ?? 1} onPage={setPage} />
        )}
      </div>
    </div>
  );
}

/**
 * 「附 N 条现场记录」 opened (JB273, 客户 11-26 事项 14): every record linked
 * to the task - number, photographs, time, 记录人 - and each opens the
 * original record, without going through 确认进度.
 */
export function LinkedRecordsDialog({ task, onClose }: { task: ScheduleTask; onClose: () => void }) {
  const t = useTranslations("jb266");
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<string | null>(null);
  const records = useQuery({
    queryKey: ["schedule-task-linked-records", task.id, page],
    queryFn: () => getTaskLinkedRecords(task.id, { page, page_size: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  });
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-slot="schedule-linked-records">
          <DialogHeader>
            <DialogTitle>{t("linkedTitle", { task: `${task.wbs_code} ${task.name}` })}</DialogTitle>
            <DialogDescription>{t("linkedHelp")}</DialogDescription>
          </DialogHeader>
          {records.isError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-center text-sm text-destructive">{t("linkedLoadError")}</p>
          ) : records.isLoading ? (
            <div className="grid min-h-24 place-items-center"><Loader2 className="size-5 animate-spin text-primary" /></div>
          ) : !(records.data?.results.length) ? (
            <p className="p-5 text-center text-sm text-muted-foreground">{t("linkedEmpty")}</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {records.data.results.map((row) => (
                <div key={row.id} className="p-3">
                  <RecordLine row={row} recorderWord="recorder" onOpen={() => setOpened(row.id)} />
                </div>
              ))}
            </div>
          )}
          {(records.data?.total_pages ?? 1) > 1 && (
            <Pager page={page} pages={records.data?.total_pages ?? 1} onPage={setPage} />
          )}
        </DialogContent>
      </Dialog>
      {opened && <InPlaceRecord kind="PROGRESS" id={opened} onClose={() => setOpened(null)} />}
    </>
  );
}

/** 「附 N 条现场记录」 under 完成%: a button when the reader may see the records. */
export function LinkedRecordsCount({
  count,
  canOpen,
  onOpen,
}: {
  count: number;
  canOpen: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations("schedulePlanning");
  const tU = useTranslations("jb266");
  if (count <= 0) return null;
  if (!canOpen) {
    return <p className="mt-1 text-xs text-muted-foreground">{t("field.linkedRecords", { count })}</p>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
      title={tU("linkedOpen")}
      data-slot="linked-records-open"
    >
      {t("field.linkedRecords", { count })}
    </button>
  );
}

function statusTone(status: string): "neutral" | "positive" | "warning" | "danger" | "info" {
  if (status === "APPROVED" || status === "REMEDIAL_ACCEPTED") return "positive";
  if (status === "REJECTED") return "danger";
  if (status === "SUBMITTED" || status === "REVISE_RESUBMIT" || status === "APPROVED_WITH_REMEDIAL") return "warning";
  if (status === "ARCHIVED") return "info";
  return "neutral";
}

/**
 * 「顾问审批」 (JB266, 客户 11-26 事项 7): each application's number and status;
 * pressing one opens the whole application - its approval steps, decisions
 * and report - over the schedule. 「—」 when there is none.
 */
export function ConsultantApprovalCell({
  rows,
  onOpen,
}: {
  rows: ScheduleConsultantApproval[] | undefined;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("consultantWorkflow");
  const tU = useTranslations("jb266");
  if (!rows?.length) return <span className="text-muted-foreground" data-slot="consultant-approvals">—</span>;
  return (
    <div className="flex flex-col items-start gap-1" data-slot="consultant-approvals">
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => onOpen(row.id)}
          className="flex flex-wrap items-center gap-1.5 text-left"
          title={tU("approvalOpen", { no: row.application_no })}
        >
          <span className="text-xs font-medium text-primary underline-offset-2 hover:underline">{row.application_no}</span>
          <StatusBadge label={t(`status.${row.status}`)} tone={statusTone(row.status)} />
        </button>
      ))}
    </div>
  );
}

/** 「40% → 100%」, 「—」 for a before an older entry cannot tell. */
export function ProgressChange({ entry }: { entry: ScheduleHistoryEntry }) {
  const tU = useTranslations("jb266");
  const show = (value: string | null | undefined) => (value == null ? "—" : `${Number(value)}%`);
  return (
    <span className="tabular-nums" data-slot="progress-change">
      {tU("change", { before: show(entry.progress_before), after: show(entry.progress_after) })}
    </span>
  );
}

/**
 * 操作记录 (JB272, 客户 11-26 事项 13): every entry kept and shown; a
 * 「已确认实际进度」 says 确认前 → 确认后, shows the records linked that time
 * (numbers and photographs), who, when and 备注. Pressing an entry opens it
 * whole.
 */
export function HistoryList({
  rows,
  onOpen,
}: {
  rows: ScheduleHistoryEntry[];
  onOpen: (row: ScheduleHistoryEntry) => void;
}) {
  const t = useTranslations("schedulePlanning");
  const tU = useTranslations("jb266");
  const df = useDateFormat();
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground">
        {t("state.noHistory")}
      </div>
    );
  }
  return (
    <div className="overflow-hidden surface-panel rounded-xl">
      <div className="divide-y">
        {rows.map((row) => {
          const confirmed = row.event === "PROGRESS_CONFIRMED";
          const records = row.linked_records ?? [];
          const count = row.linked_record_count ?? records.length;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onOpen(row)}
              className="flex w-full gap-3 p-4 text-left hover:bg-muted/30"
              data-slot="schedule-history-row"
            >
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <History className="size-4" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium">
                  {t("history." + row.event)}
                  {confirmed && (
                    <span className="ml-2 text-sm font-normal text-foreground">
                      <ProgressChange entry={row} />
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[row.revision_label, row.task_name, row.note].filter(Boolean).join(" / ") || t("state.noReason")}
                </p>
                {confirmed && count > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {tU("historyRecords", { count })}
                      {records.length > 0 && ": " + records.map((record) => record.record_no || record.phase_name).join("、")}
                    </p>
                    {records.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {records.slice(0, 6).map((record) => (
                          <PhotoStrip
                            key={record.id}
                            thumbs={record.photo_thumbs?.slice(0, 1)}
                            coverUrl={record.cover_photo_url}
                            count={1}
                            squares={1}
                            icon={ChartNoAxesCombined}
                            reference={recordLabel(record)}
                            openable={false}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <p>{row.actor_name || t("common.system")}</p>
                <p>{df.dateTime(row.created_at)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One 操作记录 entry, whole (JB272: 「点击每条操作记录，可以查看完整详情」). */
export function HistoryEntryDialog({ entry, onClose }: { entry: ScheduleHistoryEntry; onClose: () => void }) {
  const t = useTranslations("schedulePlanning");
  const tU = useTranslations("jb266");
  const df = useDateFormat();
  const [opened, setOpened] = useState<string | null>(null);
  const confirmed = entry.event === "PROGRESS_CONFIRMED";
  const snapshot = (entry.snapshot ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" && value ? value : "");
  const records = entry.linked_records ?? [];
  const count = entry.linked_record_count ?? records.length;
  const fresh = new Set(entry.new_record_ids ?? []);
  const show = (value: string | null | undefined) => (value == null ? "—" : `${Number(value)}%`);
  const facts: Array<[string, React.ReactNode]> = [
    [t("field.task"), [entry.task_wbs_code, entry.task_name].filter(Boolean).join(" ") || "—"],
    [t("field.plan"), entry.revision_label || "—"],
  ];
  if (confirmed) {
    facts.push(
      [tU("before"), show(entry.progress_before)],
      [tU("after"), show(entry.progress_after)],
      [t("field.actualStart"), text(snapshot.actual_start) ? df.date(text(snapshot.actual_start)) : "—"],
      [t("field.actualEnd"), text(snapshot.actual_end) ? df.date(text(snapshot.actual_end)) : "—"],
    );
  }
  facts.push(
    [tU("confirmer"), entry.actor_name || t("common.system")],
    [tU("confirmedAt"), df.dateTime(entry.created_at)],
    [confirmed ? t("field.managerNote") : tU("note"), entry.note || t("state.noReason")],
  );
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-slot="schedule-history-entry">
          <DialogHeader>
            <DialogTitle>{t("history." + entry.event)}</DialogTitle>
            <DialogDescription>{df.dateTime(entry.created_at)}</DialogDescription>
          </DialogHeader>
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            {facts.map(([label, value]) => (
              <div key={label} className="space-y-0.5">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-sm">{value}</dd>
              </div>
            ))}
          </dl>
          {confirmed && (
            <section className="space-y-2">
              <h4 className="text-sm font-medium">{tU("historyRecords", { count })}</h4>
              {count > 0 && records.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tU("recordsHidden")}</p>
              ) : records.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tU("noRecordsThatTime")}</p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {records.map((record) => (
                    <div key={record.id} className="p-3">
                      <RecordLine
                        row={record}
                        recorderWord="recorder"
                        onOpen={() => setOpened(record.id)}
                        badge={fresh.has(record.id) ? <StatusBadge label={tU("newThisTime")} tone="info" /> : undefined}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </DialogContent>
      </Dialog>
      {opened && <InPlaceRecord kind="PROGRESS" id={opened} onClose={() => setOpened(null)} />}
    </>
  );
}
