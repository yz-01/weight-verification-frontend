"use client";

/**
 * 日报告 (B17, H15 / HD12): the list 「日报名称｜日期｜查看」, the report
 * opened in full, and the form that writes one.
 *
 * The client: 「日报告必须要有所有的照片与记录，不能选择」. A report covers a
 * span of days - today unless changed - and holds every progress record of
 * its project in those days with all their photographs, each with the
 * site's note. There is no picker. Saving freezes what was collected;
 * 「重新整理」 collects the days again. The project manager can bring the
 * days' notes into the text with 「带入这几天的备注」 (H14).
 *
 * The report is a file to send (图15): 预览 · 打印 · 导出 · 发送 on its own
 * PDF, the same four buttons every exported file has.
 *
 * Written by the site manager (`progress.manage`), read by everybody who can
 * read progress.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, NotebookPen, Pencil, RefreshCw, Save, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import {
  DayRange,
  Pager,
  PhotoGrid,
  PhotoTile,
  localDay,
  usePhotoViewer,
} from "@/components/progress/progress-photos";
import { useAuth } from "@/components/providers/auth-provider";
import { ExportButton } from "@/components/shared/export-button";
import { FileActionButtons } from "@/components/shared/file-actions";
import { ProjectListFilter } from "@/components/shared/module-records-table";
import { FieldWrapper, FilterBar, QueryFailedNote } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import { ApiError } from "@/interfaces/api";
import type { DailyReport, DailyReportEntry } from "@/interfaces/progress-reports";
import { useDateFormat } from "@/lib/dates";
import { usePercentText } from "@/lib/progress-percent";
import {
  collectDailyReportEntries,
  createDailyReport,
  exportDailyReports,
  dailyReportPdfFile,
  deleteDailyReport,
  getDailyReport,
  getDailyReports,
  updateDailyReport,
} from "@/services/progress-reports.service";

const PAGE = 20;

/** The longest span one report covers (D5), as the server refuses more. */
export const MAX_REPORT_DAYS = 31;

/** ``day`` (YYYY-MM-DD) plus ``days``, as YYYY-MM-DD. */
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  const moved = new Date(Date.UTC(year, month - 1, date + days));
  return moved.toISOString().slice(0, 10);
}

/** 「2026-10-11」 or 「2026-10-11 – 2026-10-13」, in the reader's date format. */
function useReportDays() {
  const df = useDateFormat();
  return (report: Pick<DailyReport, "report_date" | "end_date">) =>
    report.end_date && report.end_date !== report.report_date
      ? `${df.date(report.report_date)} – ${df.date(report.end_date)}`
      : df.date(report.report_date);
}

export function DailyReportsTab() {
  const t = useTranslations("progressPage");
  const { can } = useAuth();
  const days = useReportDays();
  const list = useListQuery(["project", "date_from", "date_to"]);
  const project = list.filters.project ?? "";
  const rows = useQuery({
    queryKey: ["daily-reports", list.filters, list.page],
    queryFn: () =>
      getDailyReports({ ...list.filters, page: list.page, page_size: PAGE }),
  });
  const [writing, setWriting] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const total = rows.data?.count ?? 0;

  return (
    <div className="space-y-4">
      <FilterBar>
        <ProjectListFilter list={list} />
        <DayRange
          from={list.filters.date_from ?? ""}
          to={list.filters.date_to ?? ""}
          onChange={(next) => list.setFilters(next)}
        />
        {/* The reports listed, as a file (H16, HD13). */}
        <ExportButton
          disabled={total === 0}
          disabledReason={t("reports.empty")}
          title={t("tabs.reports")}
          onExport={(format) =>
            exportDailyReports({
              format,
              title: t("tabs.reports"),
              query: list.filters,
              columns: [
                { key: "name", label: t("reports.name") },
                { key: "report_date", label: t("dateFrom") },
                { key: "end_date", label: t("dateTo") },
                { key: "project_name", label: t("project") },
                { key: "author_name", label: t("reports.author") },
                { key: "record_count", label: t("reports.content") },
                { key: "photo_count", label: t("reports.photosCount") },
              ],
            })
          }
        />
        {can("progress.manage") && (
          <Button className="sm:ml-auto" onClick={() => setWriting(true)}>
            <Pencil />
            {t("reports.write")}
          </Button>
        )}
      </FilterBar>
      <QueryFailedNote query={rows} what={t("tabs.reports")} />
      <div className="surface-panel overflow-hidden rounded-xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("reports.name")}</TableHead>
              <TableHead className="w-48">{t("reports.date")}</TableHead>
              <TableHead className="w-20 text-right">{t("reports.view")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.isLoading ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : (rows.data?.results ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                  {rows.isError ? "—" : t("reports.empty")}
                </TableCell>
              </TableRow>
            ) : (
              (rows.data?.results ?? []).map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => setViewing(row.id)}
                >
                  <TableCell>
                    <p className="font-medium text-foreground">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        project ? null : row.project_name,
                        row.author_name,
                        t("reports.counts", { records: row.record_count, photos: row.photo_count }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </TableCell>
                  <TableCell className="tabular">{days(row)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-primary"
                      aria-label={t("reports.view")}
                      title={t("reports.view")}
                      onClick={(event) => {
                        event.stopPropagation();
                        setViewing(row.id);
                      }}
                    >
                      <Eye className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {total > PAGE && (
        <Pager page={list.page} pages={Math.ceil(total / PAGE)} onPage={list.setPage} />
      )}

      {viewing && <DailyReportOpened id={viewing} onClose={() => setViewing(null)} />}
      {writing && (
        <DailyReportDialog
          project={project}
          onClose={() => setWriting(false)}
          onSaved={(saved) => {
            setWriting(false);
            setViewing(saved.id);
          }}
        />
      )}
    </div>
  );
}

/** A report from the list: read in full (the list carries its counts only). */
function DailyReportOpened({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("progressPage");
  const qc = useQueryClient();
  const report = useQuery({
    queryKey: ["daily-reports", "one", id],
    queryFn: () => getDailyReport(id),
  });
  if (!report.data) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tabs.reports")}</DialogTitle>
            <DialogDescription className="sr-only">{t("tabs.reports")}</DialogDescription>
          </DialogHeader>
          {report.isError ? (
            <QueryFailedNote query={report} what={t("tabs.reports")} />
          ) : (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <DailyReportView
      report={report.data}
      onClose={onClose}
      onSaved={(saved) => qc.setQueryData(["daily-reports", "one", id], saved)}
    />
  );
}

/** One record of a report: when, 施工分类, percentage, the note, its photographs. */
function EntryBlock({
  entry,
  onOpen,
}: {
  entry: DailyReportEntry;
  onOpen?: (photoId: string) => void;
}) {
  const t = useTranslations("progressPage");
  const df = useDateFormat();
  const percent = usePercentText();
  return (
    <li className="space-y-2 rounded-xl border border-panel-border p-3">
      {entry.is_deleted ? (
        // D4: deleted after the report was saved; the report keeps it.
        <span className="inline-flex rounded-md bg-tone-rose/10 px-1.5 py-0.5 text-xs font-medium text-tone-rose">
          {t("reports.recordDeleted")}
        </span>
      ) : null}
      <p className="text-sm font-medium">
        {[
          entry.captured_at ? df.dateTime(entry.captured_at) : null,
          entry.phase_name,
          percent(entry.percent_complete),
          entry.recorded_by_name,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p className="whitespace-pre-wrap text-sm text-foreground/85">
        <span className="font-medium text-muted-foreground">{t("reports.note")}：</span>
        {entry.description.trim() || t("reports.noNote")}
      </p>
      {entry.photos.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("reports.noPhotos")}</p>
      ) : (
        <PhotoGrid>
          {entry.photos.map((photo) => (
            <PhotoTile key={photo.id} photo={photo} onOpen={onOpen ? () => onOpen(photo.id) : undefined} />
          ))}
        </PhotoGrid>
      )}
    </li>
  );
}

/** Every record of the report, each with its note and photographs. */
function EntryList({ entries }: { entries: DailyReportEntry[] }) {
  const t = useTranslations("progressPage");
  const photos = entries.flatMap((entry) => entry.photos);
  const viewer = usePhotoViewer(photos, t("tabs.reports"));
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("reports.noRecords")}</p>;
  }
  return (
    <>
      <ul className="space-y-2">
        {entries.map((entry) => (
          <EntryBlock
            key={entry.id}
            entry={entry}
            onOpen={(photoId) => viewer.open(photos.findIndex((photo) => photo.id === photoId))}
          />
        ))}
      </ul>
      {viewer.viewer}
    </>
  );
}

/** One report opened: its text, then every record and photograph it holds. */
export function DailyReportView({
  report,
  onClose,
  onSaved,
}: {
  report: DailyReport;
  onClose: () => void;
  /**
   * The report as saved after 修改. Whoever holds `report` replaces it, so
   * the new text and photos show at once (B4 audit #20).
   */
  onSaved?: (saved: DailyReport) => void;
}) {
  const t = useTranslations("progressPage");
  const locale = useLocale();
  const df = useDateFormat();
  const days = useReportDays();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <DailyReportDialog
        project={report.project}
        report={report}
        onClose={() => setEditing(false)}
        onSaved={(saved) => {
          setEditing(false);
          onSaved?.(saved);
        }}
        onRemoved={onClose}
      />
    );
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{report.name}</DialogTitle>
          <DialogDescription>
            {[days(report), report.project_name, report.author_name]
              .filter(Boolean)
              .join(" · ")}
          </DialogDescription>
        </DialogHeader>
        {/* 图15: the report is a file to send - 预览 · 打印 · 导出 · 发送. */}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <FileActionButtons
            label={t("reports.file")}
            source={{
              load: () => dailyReportPdfFile(report.id, locale, report.name),
              title: report.name,
            }}
          />
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {report.body || t("reports.noBody")}
        </p>
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("reports.content")} · {t("reports.counts", { records: report.record_count, photos: report.photo_count })}
          </h3>
          <p className="text-xs text-muted-foreground">
            {report.collected_at
              ? t("reports.collectedAt", { when: df.dateTime(report.collected_at) })
              : t("reports.legacy")}
          </p>
          <EntryList entries={report.entries} />
        </section>
        {can("progress.manage") && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil />
              {t("reports.edit")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The days' notes as lines for the report's text (「带入这几天的备注」):
 * 「10/11 08:28 · 钢结构：F4 的钢结构…」, records without a note left out.
 */
export function notesText(
  entries: DailyReportEntry[],
  when: (value: string) => string,
): string {
  return entries
    .filter((entry) => entry.description.trim())
    .map((entry) =>
      `${[entry.captured_at ? when(entry.captured_at) : "", entry.phase_name].filter(Boolean).join(" · ")}：${entry.description.trim()}`,
    )
    .join("\n");
}

/**
 * Write a daily report, or correct one.
 *
 * Opened on today (or the days the photo wall was filtered to). What those
 * days hold is shown below the text: every record with its note and
 * photographs. A report being corrected shows what it froze until its days
 * change or 「重新整理」 is pressed; then it shows what the days hold now,
 * and saving keeps that.
 */
export function DailyReportDialog({
  project: initialProject,
  report,
  days: initialDays,
  onClose,
  onSaved,
  onRemoved,
}: {
  project: string;
  report?: DailyReport;
  /** The days to open on: the photo wall's filter. Today when not given. */
  days?: { from: string; to: string };
  onClose: () => void;
  onSaved: (report: DailyReport) => void;
  onRemoved?: () => void;
}) {
  const t = useTranslations("progressPage");
  const df = useDateFormat();
  const qc = useQueryClient();
  const today = localDay(null);
  const startDay = initialDays?.from || initialDays?.to || today;
  const [project, setProject] = useState(report?.project ?? initialProject);
  const [from, setFrom] = useState(report?.report_date ?? startDay);
  const [to, setTo] = useState(report?.end_date ?? report?.report_date ?? (initialDays?.to || startDay));
  const [name, setName] = useState(report?.name ?? t("reports.defaultName", { date: startDay }));
  const [body, setBody] = useState(report?.body ?? "");
  // A report being corrected shows what it froze until the reader asks for
  // the days again; a new one always shows what the days hold.
  const [recollect, setRecollect] = useState(!report);
  const [nothingToBring, setNothingToBring] = useState(false);
  const daysChanged = report ? from !== report.report_date || (to || from) !== (report.end_date ?? report.report_date) : false;
  const live = recollect || daysChanged;
  const latest = from ? addDays(from, MAX_REPORT_DAYS - 1) : "";
  const lastDay = to && to >= from ? (latest && to > latest ? latest : to) : from;
  const collection = useQuery({
    queryKey: ["daily-reports", "collect", project, from, lastDay],
    queryFn: () => collectDailyReportEntries({ project, date_from: from, date_to: lastDay }),
    enabled: live && Boolean(project && from),
  });
  const entries = live ? (collection.data?.entries ?? []) : (report?.entries ?? []);
  const counts = live
    ? { records: collection.data?.record_count ?? 0, photos: collection.data?.photo_count ?? 0 }
    : { records: report?.record_count ?? 0, photos: report?.photo_count ?? 0 };
  const bringNotes = () => {
    const notes = notesText(entries, (value) => df.dateTime(value));
    setNothingToBring(!notes);
    if (!notes || body.includes(notes)) return;
    setBody(body.trim() ? `${body.trimEnd()}\n\n${notes}` : notes);
  };
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        body,
        report_date: from,
        end_date: lastDay === from ? null : lastDay,
        recollect: live,
      };
      return report
        ? updateDailyReport(report.id, payload)
        : createDailyReport({ ...payload, project });
    },
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ["daily-reports"] });
      onSaved(saved);
    },
  });
  // Removing one written by mistake: a switch, then the button (spec rule 8).
  const [removeArmed, setRemoveArmed] = useState(false);
  const [refusal, setRefusal] = useState("");
  const removal = useMutation({
    mutationFn: () => deleteDailyReport(report!.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["daily-reports"] });
      (onRemoved ?? onClose)();
    },
    onError: (error) =>
      setRefusal(error instanceof ApiError ? error.message : t("removeFailed")),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{report ? t("reports.editTitle") : t("reports.write")}</DialogTitle>
          <DialogDescription>{t("reports.help")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <FieldWrapper label={t("project")} required>
            {report ? (
              <p className="py-2 text-sm font-medium">{report.project_name}</p>
            ) : (
              <ProjectPicker
                value={project}
                onValueChange={setProject}
                placeholder={t("chooseProject")}
              />
            )}
          </FieldWrapper>
          <FieldWrapper label={t("dateFrom")} required>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("dateTo")}>
            <Input
              type="date"
              value={to}
              min={from}
              max={latest || undefined}
              title={t("reports.maxDays", { days: MAX_REPORT_DAYS })}
              onChange={(event) => setTo(event.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("reports.maxDays", { days: MAX_REPORT_DAYS })}</p>
          </FieldWrapper>
        </div>
        <FieldWrapper label={t("reports.name")} required>
          <Input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("reports.body")}>
          <Textarea rows={8} value={body} onChange={(event) => setBody(event.target.value)} />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={entries.length === 0}
              disabledReason={t("reports.noRecords")}
              onClick={bringNotes}
            >
              <NotebookPen />
              {t("reports.bringNotes")}
            </Button>
            {nothingToBring && (
              <span className="text-xs text-muted-foreground">{t("reports.noNotes")}</span>
            )}
          </div>
        </FieldWrapper>
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("reports.content")} · {t("reports.counts", counts)}
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              disabled={!project}
              disabledReason={t("chooseProject")}
              title={t("reports.recollectHint")}
              onClick={() => {
                if (live) void collection.refetch();
                else setRecollect(true);
              }}
            >
              {collection.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {t("reports.recollect")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {live ? t("reports.liveHint") : report?.collected_at
              ? t("reports.collectedAt", { when: df.dateTime(report.collected_at) })
              : t("reports.legacy")}
          </p>
          <QueryFailedNote query={collection} what={t("reports.content")} />
          {!project ? (
            <p className="text-sm text-muted-foreground">{t("chooseProject")}</p>
          ) : live && collection.isLoading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <EntryList entries={entries} />
          )}
        </section>
        {report && (
          <div className="space-y-3 rounded-xl border border-tone-rose/25 bg-tone-rose/6 p-3">
            <label className="flex items-start gap-3">
              <Switch
                checked={removeArmed}
                onCheckedChange={(next) => {
                  setRemoveArmed(next);
                  setRefusal("");
                }}
                aria-label={t("reports.remove.switch")}
              />
              <span>
                <span className="block text-sm font-medium">{t("reports.remove.switch")}</span>
                <span className="block text-xs text-muted-foreground">{t("reports.remove.hint")}</span>
              </span>
            </label>
            {removeArmed && (
              <Button
                variant="destructive"
                className="w-full"
                disabled={removal.isPending || save.isPending}
                onClick={() => removal.mutate()}
              >
                {removal.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                {t("reports.remove.confirm")}
              </Button>
            )}
            {refusal && (
              <p role="alert" className="text-sm text-destructive">
                {refusal}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            requires={[
              [project, t("project")],
              [from, t("dateFrom")],
              [name.trim(), t("reports.name")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
