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

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  NotebookPen,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";

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
import { useArrowKeys } from "@/hooks/use-arrow-keys";
import { useListQuery } from "@/hooks/use-list-query";
import { ApiError } from "@/interfaces/api";
import type { DailyReport, DailyReportEntry } from "@/interfaces/progress-reports";
import { useDateFormat } from "@/lib/dates";
import { usePercentText } from "@/lib/progress-percent";
import {
  bookCounter,
  bookPage,
  bookPosition,
  isTopDialog,
  swipeStep,
  turnTo,
} from "@/lib/report-book";
import { cn } from "@/lib/utils";
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
  const df = useDateFormat();
  const list = useListQuery(["project", "date_from", "date_to"]);
  const project = list.filters.project ?? "";
  // The newest written first (I28): the server's order, which the book
  // below turns through page by page.
  const rows = useQuery({
    queryKey: ["daily-reports", list.filters, list.page],
    queryFn: () =>
      getDailyReports({ ...list.filters, page: list.page, page_size: PAGE }),
  });
  const [writing, setWriting] = useState(false);
  // A row opens the book at its place in the list (I9); a report just written
  // opens on its own, wherever the list's filter would put it.
  const [viewing, setViewing] = useState<
    { position: number } | { id: string } | null
  >(null);
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
              (rows.data?.results ?? []).map((row, index) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => setViewing({ position: bookPosition(list.page, index, PAGE) })}
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
                    {/* I28: when it was written - the list's order. */}
                    <p className="text-xs tabular text-muted-foreground">
                      {t("reports.generatedAt", { when: df.dateTime(row.created_at) })}
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
                        setViewing({ position: bookPosition(list.page, index, PAGE) });
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

      {viewing && "position" in viewing && (
        <DailyReportBook
          source={{ kind: "list", query: list.filters, total }}
          start={viewing.position}
          onClose={() => setViewing(null)}
        />
      )}
      {viewing && "id" in viewing && (
        <DailyReportOpened id={viewing.id} onClose={() => setViewing(null)} />
      )}
      {writing && (
        <DailyReportDialog
          project={project}
          onClose={() => setWriting(false)}
          onSaved={(saved) => {
            setWriting(false);
            setViewing({ id: saved.id });
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

/** The rows a book turns through: the list's own pages, or the ids it was handed. */
export type DailyReportBookSource =
  /** 日报告 on the progress page: the list's filter, page by page (I9). */
  | { kind: "list"; query: Readonly<Record<string, string>>; total: number }
  /** The report centre's preview rows, by date (I8). */
  | { kind: "ids"; ids: readonly string[] };

/**
 * 日报告 like a book (I9): the report at `start`, then 上一篇 / 下一篇, ← / →
 * and a sideways swipe through the rest, 「第 n / 共 N 篇」 at the top.
 *
 * The list rows carry counts, not photographs (`compact`), so each report is
 * read in full as it is turned to, and its neighbours are fetched ahead. The
 * page behind the last row of a list page is fetched when the book gets
 * there, so it reads on past row 20 without closing.
 */
export function DailyReportBook({
  source,
  start,
  onClose,
  onChanged,
}: {
  source: DailyReportBookSource;
  start: number;
  onClose: () => void;
  /** After a report was corrected or removed from the book. */
  onChanged?: () => void;
}) {
  const t = useTranslations("progressPage");
  const qc = useQueryClient();
  const [position, setPosition] = useState(start);
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  const query = source.kind === "list" ? source.query : null;
  const ids = source.kind === "ids" ? source.ids : null;
  const { page, index } = bookPage(position, PAGE);
  const listPage = useQuery({
    queryKey: ["daily-reports", query, page],
    queryFn: () => getDailyReports({ ...query, page, page_size: PAGE }),
    enabled: query !== null,
  });
  const total = ids ? ids.length : (listPage.data?.count ?? (source.kind === "list" ? source.total : 0));
  const id = (ids ? ids[position] : listPage.data?.results[index]?.id) || undefined;
  const report = useQuery({
    queryKey: ["daily-reports", "one", id],
    queryFn: () => getDailyReport(id!),
    enabled: Boolean(id),
    // The page turned from stays up until the next one has come (no flash).
    placeholderData: keepPreviousData,
  });

  // The pages either side, read ahead so a turn shows at once.
  useEffect(() => {
    for (const by of [-1, 1] as const) {
      const next = turnTo(position, total, by);
      if (next === null) continue;
      const spot = bookPage(next, PAGE);
      if (query !== null && spot.page !== page) {
        void qc.prefetchQuery({
          queryKey: ["daily-reports", query, spot.page],
          queryFn: () => getDailyReports({ ...query, page: spot.page, page_size: PAGE }),
        });
        continue;
      }
      const nextId = ids ? ids[next] : listPage.data?.results[spot.index]?.id;
      if (nextId) {
        void qc.prefetchQuery({
          queryKey: ["daily-reports", "one", nextId],
          queryFn: () => getDailyReport(nextId),
        });
      }
    }
  }, [ids, listPage.data, page, position, qc, query, total]);

  const turn = (by: -1 | 1) => {
    const next = turnTo(position, total, by);
    if (next === null) return;
    setDirection(by);
    setPosition(next);
  };
  const notice = (
    <>
      <QueryFailedNote query={listPage} what={t("tabs.reports")} />
      <QueryFailedNote query={report} what={t("tabs.reports")} />
    </>
  );

  if (!report.data) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tabs.reports")}</DialogTitle>
            <DialogDescription className="sr-only">{t("tabs.reports")}</DialogDescription>
          </DialogHeader>
          {listPage.isError || report.isError ? (
            notice
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
      onSaved={(saved) => {
        qc.setQueryData(["daily-reports", "one", saved.id], saved);
        onChanged?.();
      }}
      onRemoved={() => {
        onChanged?.();
        onClose();
      }}
      book={{
        position,
        total,
        direction,
        turning: report.isPlaceholderData || (!id && listPage.isFetching),
        onTurn: turn,
        notice,
      }}
    />
  );
}

/** What an opened report needs to be one page of a book (I9). */
export interface DailyReportBookNav {
  /** 0-based, over the whole list. */
  position: number;
  total: number;
  /** The way the last turn went, for the page's slide in. */
  direction: -1 | 0 | 1;
  /** The next page is still on its way; this one stays up meanwhile. */
  turning: boolean;
  onTurn: (by: -1 | 1) => void;
  /** Why the next page could not be read. */
  notice?: ReactNode;
}

/** 上一篇 · 「第 n / 共 N 篇」 · 下一篇. */
function BookBar({ book }: { book: DailyReportBookNav }) {
  const t = useTranslations("progressPage.reports.book");
  const counter = bookCounter(book.position, book.total);
  const first = turnTo(book.position, book.total, -1) === null;
  const last = turnTo(book.position, book.total, 1) === null;
  return (
    <div
      data-book-bar
      className="sticky -top-4 z-10 -mx-4 flex items-center justify-between gap-2 border-b border-panel-border bg-popover px-4 py-2"
    >
      <Button
        variant="outline"
        size="sm"
        disabled={first}
        disabledReason={t("first")}
        onClick={() => book.onTurn(-1)}
      >
        <ChevronLeft />
        {t("previous")}
      </Button>
      <span className="flex items-center gap-1.5 text-sm font-medium tabular" aria-live="polite">
        {book.turning && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        {t("position", counter)}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={last}
        disabledReason={t("last")}
        onClick={() => book.onTurn(1)}
      >
        {t("next")}
        <ChevronRight />
      </Button>
    </div>
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
  onRemoved,
  book,
}: {
  report: DailyReport;
  onClose: () => void;
  /**
   * The report as saved after 修改. Whoever holds `report` replaces it, so
   * the new text and photos show at once (B4 audit #20).
   */
  onSaved?: (saved: DailyReport) => void;
  /** After 删除 from 修改; closes the view when not given. */
  onRemoved?: () => void;
  /** Turned like a book through a list of reports (I9). */
  book?: DailyReportBookNav;
}) {
  const t = useTranslations("progressPage");
  const locale = useLocale();
  const df = useDateFormat();
  const days = useReportDays();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  // ← / → while this report is the dialog on top; a photograph opened over
  // it keeps them for itself.
  useArrowKeys((step) => book?.onTurn(step), {
    enabled: Boolean(book) && !editing,
    owner: contentRef,
  });
  // A new page starts at its top.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [report.id]);
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
        onRemoved={onRemoved ?? onClose}
      />
    );
  }
  // A sideways stroke on a phone turns the page. Only one that starts inside
  // this dialog: a photograph opened over it is its own (a portal, outside).
  const swipe = book
    ? {
        onTouchStart: (event: React.TouchEvent) => {
          const point = event.touches[0];
          touch.current =
            point && contentRef.current?.contains(event.target as Node)
              ? { x: point.clientX, y: point.clientY }
              : null;
        },
        onTouchEnd: (event: React.TouchEvent) => {
          const from = touch.current;
          touch.current = null;
          const point = event.changedTouches[0];
          if (!from || !point || !isTopDialog(contentRef.current)) return;
          const step = swipeStep(point.clientX - from.x, point.clientY - from.y);
          if (step !== null) book.onTurn(step);
        },
      }
    : {};
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        ref={contentRef}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
        {...swipe}
      >
        <DialogHeader>
          <DialogTitle>{report.name}</DialogTitle>
          <DialogDescription>
            {[days(report), report.project_name, report.author_name]
              .filter(Boolean)
              .join(" · ")}
          </DialogDescription>
        </DialogHeader>
        {book && <BookBar book={book} />}
        {book?.notice}
        <div
          key={report.id}
          className={cn(
            "grid gap-4",
            book && book.direction !== 0 && "animate-in fade-in-0 duration-200 motion-reduce:animate-none",
            book?.direction === 1 && "slide-in-from-right-10",
            book?.direction === -1 && "slide-in-from-left-10",
          )}
        >
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
        </div>
        {can("progress.manage") && (
          <DialogFooter>
            <Button
              variant="outline"
              disabled={Boolean(book?.turning)}
              disabledReason={t("reports.book.waiting")}
              onClick={() => setEditing(true)}
            >
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
