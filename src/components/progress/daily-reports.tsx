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
  Camera,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
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
import { usePackList } from "@/components/contractor-ops/pack-collect";
import { RecordNo } from "@/components/shared/record-no";
import { clickOpensRow } from "@/components/shared/inside-row-control";
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
import { useUrlSelection } from "@/hooks/use-url-selection";
import { ApiError } from "@/interfaces/api";
import type {
  DailyReport,
  DailyReportEntry,
  DailyReportMonthBookQuery,
  DailyReportSignature,
} from "@/interfaces/progress-reports";
import { useDateFormat } from "@/lib/dates";
import { SIGN_OFF_CANCELLED } from "@/lib/sign-off";
import { usePercentText } from "@/lib/progress-percent";
import {
  bookCounter,
  bookPlace,
  isTopDialog,
  monthWords,
  neighbourMonth,
  shownReport,
  swipeStep,
  turnTo,
} from "@/lib/report-book";
import { cn } from "@/lib/utils";
import { reportTakesWeather, weatherWordKey } from "@/lib/weather-words";
import {
  collectDailyReportEntries,
  createDailyReport,
  exportDailyReports,
  dailyReportPdfFile,
  deleteDailyReport,
  getDailyReport,
  getDailyReportMonthBook,
  getDailyReportWeather,
  getDailyReports,
  updateDailyReport,
} from "@/services/progress-reports.service";
import { signOffBeforeEditing } from "@/services/sign-off.service";
import { CORRECTED_ROW_CLASS, CorrectedTag } from "@/components/shared/record-correction";
import { PhotoStrip } from "@/components/shared/photo-thumb";
import { RecordSendLog, RecordSendTargetProvider } from "@/components/shared/record-send-log";

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
  const tRoot = useTranslations();
  const { can } = useAuth();
  const days = useReportDays();
  const df = useDateFormat();
  const list = useListQuery(["project", "date_from", "date_to"]);
  const project = list.filters.project ?? "";
  // The newest written first (I28): the server's order.
  const rows = useQuery({
    queryKey: ["daily-reports", list.filters, list.page],
    queryFn: () =>
      getDailyReports({ ...list.filters, page: list.page, page_size: PAGE }),
  });
  const [writing, setWriting] = useState(false);
  // A row - or a report just written - opens the book of its project's month
  // at that report (JB175), whatever this list is filtered to. A link may
  // name one too (`?report=`, JB193: a 「被退回」 notice about a report).
  const [viewing, setViewing] = useUrlSelection("report");
  const total = rows.data?.count ?? 0;
  const reportRows = rows.data?.results ?? [];
  // Multi Engine picks reports here (JB193 二 1): any saved report can go in.
  const pack = usePackList({ kind: "DAILY_REPORT" }, reportRows);
  const tPack = useTranslations("multiEngine.collect");
  // The loading and empty rows span every column, the pack ones too.
  const span = 4 + (pack.picking ? 1 : 0) + (pack.showColumn ? 1 : 0);

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
                { key: "record_no", label: tRoot("recordNo.column") },
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
        {pack.bar}
        {/* Fits the page, 查看 pinned at the right (I39). */}
        <Table fit>
          <TableHeader>
            <TableRow>
              {/* Multi Engine's tick box first, as on every packable list. */}
              {pack.picking && <TableHead className="w-10">{pack.checkAll}</TableHead>}
              {/* 记录编号 (I6): DR-<project>-001. */}
              <TableHead className="w-32">{tRoot("recordNo.column")}</TableHead>
              {pack.showColumn && <TableHead>{tPack("column")}</TableHead>}
              <TableHead>{t("reports.name")}</TableHead>
              <TableHead className="w-48">{t("reports.date")}</TableHead>
              <TableHead pin="end" className="w-20 text-right">{t("reports.view")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.isLoading ? (
              <TableRow>
                <TableCell colSpan={span} className="text-center">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : reportRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={span} className="py-8 text-center text-sm text-muted-foreground">
                  {rows.isError ? "—" : t("reports.empty")}
                </TableCell>
              </TableRow>
            ) : (
              reportRows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn("cursor-pointer", row.was_corrected && CORRECTED_ROW_CLASS)}
                  onClick={(event) => {
                    if (clickOpensRow(event)) setViewing(row.id);
                  }}
                >
                  {pack.picking && (
                    // The box ticks; it does not open the report.
                    <TableCell onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                      {pack.check(row.id)}
                    </TableCell>
                  )}
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      {/* 「已修改」 (J20): opens the report's edit history. */}
                      {row.was_corrected && <CorrectedTag kind="DAILY_REPORT" recordId={row.id} />}
                      <RecordNo value={row.record_no} />
                    </span>
                  </TableCell>
                  {pack.showColumn && <TableCell>{pack.badge(row.id)}</TableCell>}
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
                    {/* Its photographs themselves (J34-11); the row opens the report. */}
                    {(row.photo_thumbs ?? []).length > 0 && (
                      <PhotoStrip
                        className="mt-1"
                        thumbs={row.photo_thumbs}
                        count={row.photo_count}
                        icon={Camera}
                        reference={row.record_no || row.name}
                        openable={false}
                      />
                    )}
                  </TableCell>
                  <TableCell className="tabular">{days(row)}</TableCell>
                  <TableCell pin="end" className="text-right">
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
      {pack.overlay}

      {viewing && (
        <DailyReportBook key={viewing} report={viewing} onClose={() => setViewing(null)} />
      )}
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

/**
 * 日报告 like a book (I9, JB175): the report opened, then 上一篇 / 下一篇,
 * ← / → and a sideways swipe through every report of its project in its
 * month, and 上个月 / 下个月 to that project's other months. The bar says
 * 「项目 · 2026 年 11 月 · 第 n / 共 N 篇」.
 *
 * The client (11-12): 「同一个项目、同一个月份的所有日报告，可以通过「上一篇」
 * 「下一篇」连续查看，不需要退出再重新打开」. So the pages are not the rows of
 * the list it was opened from - whatever that list's days, writer, keyword
 * or 「全部项目」 - but the opened report's project and month
 * (`get_month_book`), oldest first. Under 「全部项目」 a report opens its own
 * project's book; nothing turns from one project into another.
 *
 * The book holds ids and names only, so each report is read in full as it is
 * turned to, and its neighbours are fetched ahead.
 */
export function DailyReportBook({
  report: opened,
  onClose,
  onChanged,
}: {
  /** The report opened: the book is its project's month, open at it. */
  report: string;
  onClose: () => void;
  /** After a report was corrected or removed from the book. */
  onChanged?: () => void;
}) {
  const t = useTranslations("progressPage");
  const qc = useQueryClient();
  // Which month: the opened report's, then one chosen with 上个月 / 下个月.
  const [which, setWhich] = useState<DailyReportMonthBookQuery>({ report: opened });
  // The report on show; `null` after a change of month - that month's first.
  const [current, setCurrent] = useState<string | null>(opened);
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  const book = useQuery({
    queryKey: ["daily-reports", "month-book", which],
    queryFn: () => getDailyReportMonthBook(which),
    // The bar and the page stay up while another month comes.
    placeholderData: keepPreviousData,
  });
  const pages = book.data?.reports ?? [];
  // Never a page of the month turned from while the next month is coming.
  const id = shownReport(current, pages, book.isPlaceholderData);
  const report = useQuery({
    queryKey: ["daily-reports", "one", id],
    queryFn: () => getDailyReport(id!),
    enabled: Boolean(id),
    // The page turned from stays up until the next one has come (no flash).
    placeholderData: keepPreviousData,
  });
  const position = bookPlace(pages, id ?? report.data?.id);
  const total = pages.length;
  // A month left with no report (the last one removed elsewhere): nothing to show.
  const empty = book.isSuccess && !book.isPlaceholderData && total === 0;
  useEffect(() => {
    if (empty) onClose();
  }, [empty, onClose]);

  // The pages either side, read ahead so a turn shows at once.
  useEffect(() => {
    if (!id) return;
    for (const by of [-1, 1] as const) {
      const next = turnTo(position, total, by);
      const nextId = next === null ? undefined : pages[next]?.id;
      if (nextId) {
        void qc.prefetchQuery({
          queryKey: ["daily-reports", "one", nextId],
          queryFn: () => getDailyReport(nextId),
        });
      }
    }
  }, [id, pages, position, qc, total]);

  const turn = (by: -1 | 1) => {
    // Not while another month is coming: its pages are not here yet.
    if (!id) return;
    const next = turnTo(position, total, by);
    if (next === null) return;
    setDirection(by);
    setCurrent(pages[next].id);
  };
  const month = book.data?.month ?? "";
  const months = book.data?.months ?? [];
  const toMonth = (by: -1 | 1) => {
    const target = neighbourMonth(months, month, by);
    if (!target || !book.data) return;
    setDirection(by);
    setWhich({ project: book.data.project.id, month: target });
    setCurrent(null);
  };
  const notice = (
    <>
      <QueryFailedNote query={book} what={t("tabs.reports")} />
      <QueryFailedNote query={report} what={t("tabs.reports")} />
    </>
  );

  if (!report.data || !book.data) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tabs.reports")}</DialogTitle>
            <DialogDescription className="sr-only">{t("tabs.reports")}</DialogDescription>
          </DialogHeader>
          {book.isError || report.isError ? (
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
        // The book of where it is now: new days may have moved it to
        // another month (the save already asked for every book again).
        setWhich({ report: saved.id });
        setCurrent(saved.id);
        setDirection(0);
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
        turning: report.isPlaceholderData || book.isPlaceholderData,
        onTurn: turn,
        project: book.data.project.name || book.data.project.code,
        month,
        months,
        onMonth: toMonth,
        notice,
      }}
    />
  );
}

/** What an opened report needs to be one page of a book (I9, JB175). */
export interface DailyReportBookNav {
  /** 0-based, within the month. */
  position: number;
  /** The reports of this project in this month. */
  total: number;
  /** The way the last turn went, for the page's slide in. */
  direction: -1 | 0 | 1;
  /** The next page is still on its way; this one stays up meanwhile. */
  turning: boolean;
  onTurn: (by: -1 | 1) => void;
  /** The book's project, as the bar names it. */
  project: string;
  /** The book's month, `YYYY-MM`. */
  month: string;
  /** The months this project has reports in (上个月 / 下个月 go only there). */
  months: readonly string[];
  onMonth: (by: -1 | 1) => void;
  /** Why the next page could not be read. */
  notice?: ReactNode;
}

/**
 * 上个月 · 上一篇 · 「项目 · 2026 年 11 月 · 第 n / 共 N 篇」 · 下一篇 · 下个月
 * (JB175). On a phone the words sit on their own line above the buttons.
 */
export function BookBar({ book }: { book: DailyReportBookNav }) {
  const t = useTranslations("progressPage.reports.book");
  const locale = useLocale();
  const counter = bookCounter(book.position, book.total);
  const first = turnTo(book.position, book.total, -1) === null;
  const last = turnTo(book.position, book.total, 1) === null;
  const earlier = neighbourMonth(book.months, book.month, -1);
  const later = neighbourMonth(book.months, book.month, 1);
  const place = [
    book.project,
    book.month ? t("month", monthWords(book.month, locale)) : "",
    t("position", counter),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      data-book-bar
      className="sticky -top-4 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 border-b border-panel-border bg-popover px-4 py-2"
    >
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={!earlier}
          disabledReason={t("noEarlierMonth")}
          onClick={() => book.onMonth(-1)}
        >
          <ChevronsLeft />
          {t("previousMonth")}
        </Button>
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
      </div>
      <span
        data-book-place
        className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-center text-sm font-medium tabular max-sm:order-first max-sm:basis-full"
        aria-live="polite"
      >
        {book.turning && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
        {place}
      </span>
      <div className="flex gap-1.5">
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
        <Button
          variant="outline"
          size="sm"
          disabled={!later}
          disabledReason={t("noLaterMonth")}
          onClick={() => book.onMonth(1)}
        >
          {t("nextMonth")}
          <ChevronsRight />
        </Button>
      </div>
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
  /** Turned like a book through its project's month of reports (I9, JB175). */
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
    // A photo printed or sent from inside the report is the report's row in
    // 操作记录, which opens this report again (JB183 做法 6).
    <RecordSendTargetProvider value={{ recordKind: "DAILY_REPORT", recordId: report.id }}>
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
        <ReportSigners report={report} />
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
              // A preview is inline and unsigned; 打印 · 导出 · 发送 from it
              // fetch again with the PIN's grant, so the report is signed
              // for the export and its log row names it (JB27 review #4).
              exportedOnServer: true,
              recordKind: "DAILY_REPORT",
              recordId: report.id,
              project: report.project,
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
        {/* 发送记录 (JB65): every send of this record, to whom and whether it went. */}
        <RecordSendLog recordKind="DAILY_REPORT" recordId={report.id} />
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
    </RecordSendTargetProvider>
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
  // The dashboard's own words for a weather reading (JB186).
  const tWeather = useTranslations("headquarters.reference");
  const df = useDateFormat();
  const qc = useQueryClient();
  // 「开始填写或修改前，必须输入签核密码」 (I29): the editor opens only after the
  // PIN; the save sends it again and the server's check there is the one
  // that counts. `undefined` while asking.
  const signOff = useSignOffBeforeEditing(
    report ? "daily_report.update" : "daily_report.create",
    onClose,
  );
  const today = localDay(null);
  const startDay = initialDays?.from || initialDays?.to || today;
  const [project, setProject] = useState(report?.project ?? initialProject);
  const [from, setFrom] = useState(report?.report_date ?? startDay);
  const [to, setTo] = useState(report?.end_date ?? report?.report_date ?? (initialDays?.to || startDay));
  // 日报天气 (JB186, 客户 11-13: 「日报名称改为日报天气，右上角报告上面能否
  // 页面的天气局气象报告」; Lucas 11-13 chose A). He had been typing
  // 「2026-11-13 日报告 天气：雨天」 into this box by hand. A new report of
  // today now starts with that line, the weather read where the dashboard
  // reads it, at the report's own project - 「2026-11-13 日报告 天气：27°C
  // 毛毛雨」 - and the box is his to change. The PDF prints the box at its
  // top right, as it always did.
  const takesWeather = reportTakesWeather({ editing: Boolean(report), firstDay: startDay, today });
  // query-failure: no weather is the answer when it cannot be read; the box says so below (weatherMissing)
  const weather = useQuery({
    queryKey: ["daily-reports", "weather", project],
    queryFn: () => getDailyReportWeather(project),
    enabled: takesWeather && Boolean(project),
    staleTime: 10 * 60_000,
  });
  const weatherWords = weather.data
    ? `${tWeather("temperature", { value: weather.data.temperature })} ${tWeather(`weather.${weatherWordKey(weather.data.weather_code)}`)}`
    : "";
  const offeredName = weatherWords
    ? t("reports.defaultNameWeather", { date: startDay, weather: weatherWords })
    : t("reports.defaultName", { date: startDay });
  // What the writer typed; until then the box shows the line offered, which
  // gains the weather when it arrives and follows a change of project.
  const [typedName, setName] = useState<string | null>(report?.name ?? null);
  const name = typedName ?? offeredName;
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
        ? updateDailyReport(report.id, payload, signOff)
        : createDailyReport({ ...payload, project }, signOff);
    },
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ["daily-reports"] });
      onSaved(saved);
    },
  });
  // Removing one written by mistake: a switch, then the button (spec rule 8).
  const [removeArmed, setRemoveArmed] = useState(false);
  const [removeReason, setRemoveReason] = useState("");
  const [refusal, setRefusal] = useState("");
  const removal = useMutation({
    mutationFn: () => deleteDailyReport(report!.id, removeReason.trim(), signOff),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["daily-reports"] });
      (onRemoved ?? onClose)();
    },
    onError: (error) =>
      setRefusal(
        error instanceof ApiError && error.code === SIGN_OFF_CANCELLED
          ? ""
          : error instanceof ApiError
            ? error.message
            : t("removeFailed"),
      ),
  });

  // The sign-off PIN dialog is on screen; the editor waits for it.
  if (signOff === undefined) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{report ? t("reports.editTitle") : t("reports.write")}</DialogTitle>
          <DialogDescription>{t("reports.help")}</DialogDescription>
        </DialogHeader>
        <SignerNote report={report} />
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
          {/* Where the weather came from, or why there is none (JB186). */}
          {takesWeather && project && typedName === null && !weather.isPending ? (
            <p className="mt-1 text-xs text-muted-foreground" data-report-weather={weatherWords ? "read" : "none"}>
              {weatherWords ? t("reports.weatherFilled") : t("reports.weatherMissing")}
            </p>
          ) : null}
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
              <>
                <FieldWrapper label={t("reports.remove.reason")} required>
                  <Textarea
                    rows={2}
                    maxLength={500}
                    value={removeReason}
                    onChange={(event) => {
                      setRemoveReason(event.target.value);
                      setRefusal("");
                    }}
                  />
                </FieldWrapper>
                <Button
                  variant="destructive"
                  className="w-full"
                  requires={[[removeReason.trim(), t("reports.remove.reason")]]}
                  disabled={removal.isPending || save.isPending}
                  onClick={() => removal.mutate()}
                >
                  {removal.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  {t("reports.remove.confirm")}
                </Button>
              </>
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

/**
 * Ask for the sign-off PIN once, when an editor opens (I29).
 *
 * `undefined` while the dialog is up; the PIN once it was right (`""` where
 * the server does not ask). Closing the PIN dialog closes the editor.
 */
function useSignOffBeforeEditing(action: string, onCancel: () => void): string | undefined {
  const [pin, setPin] = useState<string | undefined>(undefined);
  const cancel = useRef(onCancel);
  const mounted = useRef(false);
  const asked = useRef(false);
  useEffect(() => {
    cancel.current = onCancel;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    // Once per editor, also when React runs effects twice in development.
    if (asked.current) return;
    asked.current = true;
    signOffBeforeEditing(action)
      .then((typed) => {
        if (!mounted.current) return;
        if (typed === null) cancel.current();
        else setPin(typed);
      })
      .catch(() => {
        if (mounted.current) cancel.current();
      });
  }, [action]);
  return pin;
}

/** 「填写人：完整姓名（账号）· dd/mm/yyyy hh:mm · 已用签核密码确认」 */
function signerLine(
  signature: DailyReportSignature,
  when: (value: string) => string,
  signedWord: string,
): string {
  return [
    signature.signer_account
      ? `${signature.signer_name} (${signature.signer_account})`
      : signature.signer_name,
    when(signature.signed_at),
    signature.pin_verified ? signedWord : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * 填写人 and 修改记录 on an opened report (I29, ID69). Read-only: the server
 * writes them from the signed-in account; nothing here can change a name.
 */
function ReportSigners({ report }: { report: DailyReport }) {
  const t = useTranslations("progressPage");
  const df = useDateFormat();
  const signatures = report.signatures ?? [];
  const written = signatures.find((row) => row.action === "CREATE");
  const history = signatures.filter((row) => row.action !== "CREATE");
  const when = (value: string) => df.dateTime(value);
  return (
    <section className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm" data-testid="report-signers">
      <p>
        <span className="font-medium">{t("reports.signer.author")}：</span>
        {written
          ? signerLine(written, when, t("reports.signer.pinSigned"))
          : report.author_name
            ? `${report.author_name} · ${when(report.created_at)}`
            : "—"}
      </p>
      {history.length > 0 && (
        <details>
          <summary className="cursor-pointer font-medium">
            {t("reports.signer.history", { count: history.length })}
          </summary>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
            {history.map((row) => (
              <li key={row.id}>
                <span className="font-medium text-foreground">{t(`reports.signer.action.${row.action}`)}</span>
                {" · "}
                {signerLine(row, when, t("reports.signer.pinSigned"))}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** In the editor: who is writing - the signed-in account, not a field. */
function SignerNote({ report }: { report?: DailyReport }) {
  const t = useTranslations("progressPage");
  const { user } = useAuth();
  if (!user) return null;
  return (
    <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
      <span className="font-medium">
        {report ? t("reports.signer.editor") : t("reports.signer.author")}：
      </span>
      {user.full_name} ({user.email}) · {t("reports.signer.fixed")}
    </p>
  );
}
