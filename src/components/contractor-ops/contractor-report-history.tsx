"use client";

/**
 * 报表导出历史 - the contractor's archive of generated reports (2026-10-10),
 * with its search and its operation log (JB27, 客户 10-26 事项 3).
 *
 * The client: 「历史报表无法点击打开查看 · 打印、下载、发送等操作无法正常使用 ·
 * 没有搜索及筛选功能」「增加四项搜索筛选：日期（单日）、操作员名称、操作类型、
 * 报表 / 资料名称 · 支持组合筛选」「可以查看每份报表的打印、下载及发送操作记录」
 * 「能否直接完善以上功能，并集中查询整个系统打印、下载、发送的操作日志？」
 * 「优先利用现有页面及系统功能，不要重复开发」.
 *
 * So this one page has two tabs: 「报表」, the history as before - searched
 * and paged on the server, no longer only the newest 100 - and 「操作记录」,
 * every print, download and send in the back office, with the same four
 * filters and the project. Each report opens its own records.
 *
 * JB178 / JB180 (客户 11-12 追加 1、3): both tabs follow the page's project
 * (the top bar's choice) and say what they show - 「现在只显示：…，共 N 笔。」 -
 * and, when a project has nothing, which project and how to see all. Every
 * 操作记录 row has 「查看」 (the file as it was kept), 「打开记录」 (a single
 * record) or 「这一份当时没有保存文件」; a send shows to whom, how and its
 * three states (`SendStates`).
 *
 * JB183 (客户 11-13 事项 1、2): 「打开记录」 opens the record the row names
 * (`record_kind` + `record_id`, `logRowTarget`) in its own window over the
 * list (`LogRecordWindow`) - never the page the button happened to be
 * pressed on - and X, Esc, a click outside or the browser's back closes it
 * onto the same list. The page keeps its tab, filters, project and pages in
 * its address and its scroll position for that address, so the back arrow
 * from a record that has only a page, and a reload, come back to the same
 * place.
 *
 * Rows from before files were kept (before 2026-10-10) have nothing stored
 * to open. 「按当时条件重新生成」 generates them again from the conditions the
 * row saved - with the data as it is now, which the file says - into a new
 * row the usual 查看 · 打印 · 导出 · 发送 work on. The old row stays.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, History, Loader2, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { toast } from "sonner";

import { CompanyBanner } from "@/components/dashboard/company-banner";
import {
  ArchivedReportActions,
  ArchivedReportName,
  ArchivedReportNote,
  previewArchived,
  useReportArchive,
  type ReportArchive,
} from "@/components/reports/report-archive";
import { ReportJobs } from "@/components/reports/report-jobs";
import { ReportSelector } from "@/components/reports/report-selector";
import { LogRecordWindow, type LogRecordHeading } from "@/components/contractor-ops/log-record-window";
import { clickOpensRow } from "@/components/shared/inside-row-control";
import { FilterBar, FilterField, ListHeader } from "@/components/shared/page-primitives";
import { SendStates } from "@/components/shared/send-states";
import { useCurrentProject, useProjectBoxShown } from "@/components/providers/current-project-provider";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, type ListQuery } from "@/interfaces/api";
import type {
  ContractorReportExportRecord,
  ContractorReportFilters,
  ContractorReportType,
} from "@/interfaces/contractor-report";
import {
  FILE_ACTION_TYPES,
  type FileActionRecord,
  type FileActionType,
  type FileShare,
} from "@/interfaces/file-action";
import type { ArchivedReportFile } from "@/interfaces/report-archive";
import { useDateFormat } from "@/lib/dates";
import { logRowTarget } from "@/lib/log-record-open";
import { messageCodes, reportColumnValues } from "@/lib/report-preview";
import {
  historyQuery,
  openRecordIn,
  readHistoryAddress,
  scrollKey,
  withOpenRecord,
  withoutOpenRecord,
  type HistoryTab,
} from "@/lib/report-history-address";
import { useUnitExportValues } from "@/hooks/use-material-units";
import { isSignOffCancelled } from "@/lib/sign-off";
import { cn } from "@/lib/utils";
import { captureDownload } from "@/services/api-client";
import {
  exportContractorReport,
  getContractorReport,
  getContractorReportHistory,
} from "@/services/contractor-report.service";
import { getProjects } from "@/services/contractor.service";
import { getFileActionRecords } from "@/services/file-action.service";

const PAGE_SIZE = 20;

/** The reports a name typed in 「报表 / 资料名称」 can match (by their words). */
const REPORT_TYPES: ReadonlyArray<
  ContractorReportType | "material_report" | "material_cost" | "material_quantity" | "material_issue_statement"
> = [
  "progress", "safety", "consultant", "attendance", "equipment", "recycling", "schedule", "target",
  "photos", "documents", "daily_report", "progress_summary", "field_tasks", "material_outgoing",
  "claims", "sundry_claims", "material_returns", "material_rejections",
  // 材料报表's PDF of more than 20 deliveries, made in the background (JB48).
  "material_report",
  // 材料领用结账单, printed / exported / sent from 材料出场 › 材料领用 (JB179).
  "material_issue_statement",
  // 材料成本报表 / 材料数量报表, kept since JB178.
  "material_cost",
  "material_quantity",
];

/** The filter keys a history row may have saved, sent back as they were. */
const SAVED_KEYS = [
  "category", "subcategory", "keyword", "actor", "status", "event", "geofence", "equipment",
  "supplier", "direction", "record_type", "counterparty", "subcontractor", "plan", "target_type",
] as const;

interface Filters {
  date: string;
  operator: string;
  action: "" | FileActionType;
  name: string;
  project: string;
  /** JB65: 「可以按接收方搜索」 - the operation log only. */
  recipient: string;
}

const NO_FILTERS: Filters = { date: "", operator: "", action: "", name: "", project: "all", recipient: "" };

export function ContractorReportHistoryWorkspace() {
  const t = useTranslations("contractorReports");
  const h = useTranslations("contractorReports.history");
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const current = useCurrentProject();
  // JB183 做法 5: where the page was - tab, filters, project, pages - read
  // from its address once, when it opens (back, the back arrow, a reload).
  const [initial] = useState(() => readHistoryAddress(new URLSearchParams(search.toString())));
  const [home] = useState(pathname);
  const [tab, setTab] = useState<HistoryTab>(initial.tab);
  const [filters, setFilters] = useState<Filters>(() => ({
    date: initial.date,
    operator: initial.operator,
    action: (FILE_ACTION_TYPES as readonly string[]).includes(initial.action) ? (initial.action as FileActionType) : "",
    name: initial.name,
    recipient: initial.recipient,
    // The project the page was on; else the top bar's, which it follows.
    project: initial.project !== "all" ? initial.project : current.active ? current.projectId || "all" : "all",
  }));
  const [page, setPage] = useState(initial.page);
  const [logPage, setLogPage] = useState(initial.logPage);
  const set = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
    setLogPage(1);
  };
  // The page's state, kept in its address as it changes (replacing the
  // entry: a filter typed is not a step for the back button).
  const searchText = search.toString();
  useEffect(() => {
    if (window.location.pathname !== home) return;
    const now = new URLSearchParams(window.location.search);
    const query = historyQuery(now, { tab, ...filters, page, logPage });
    if (query === now.toString()) return;
    window.history.replaceState(null, "", query ? `${home}?${query}` : home);
  }, [tab, filters, page, logPage, home, searchText]);
  const listRef = useRef<HTMLDivElement | null>(null);
  useSavedListScroll(listRef);
  const opened = useOpenedLogRecord({ home, pathname, listRef, router });
  const projectBoxShown = useProjectBoxShown("filter");
  const scope = useHistoryScope(filters, tab, () => set(NO_FILTERS));
  const projectPicker = (
    <ProjectPicker
      value={filters.project}
      onValueChange={(value) => {
        // The top bar settling while its list loads is not a choice: the
        // page and its project stay as they were (JB183 做法 5).
        if (current.active && current.loading) return;
        set({ project: value });
      }}
      placeholder={t("filter.allProjects")}
      allowAll
      allLabel={t("filter.allProjects")}
      className="sm:w-56"
    />
  );

  return (
    <OpenLogRow.Provider value={opened.open}>
    <div className="flex flex-col gap-4" ref={listRef} data-slot="report-history">
      <CompanyBanner scope="reports" />
      <ReportSelector />
      <ListHeader title={h("title")} subtitle={h("subtitle")} />
      {/* 「准备中」 and the ones not made (JB48): above the finished files. */}
      <ReportJobs />
      <Tabs value={tab} onValueChange={(value) => setTab(value === "log" ? "log" : "reports")}>
        <TabsList>
          <TabsTrigger value="reports" data-slot="history-tab-reports">{h("tabReports")}</TabsTrigger>
          <TabsTrigger value="log" data-slot="history-tab-log">{h("tabLog")}</TabsTrigger>
        </TabsList>
        <FilterBar className="mt-3">
          <FilterField label={h("filter.date")}>
            <Input
              type="date"
              className="sm:w-44"
              value={filters.date}
              onChange={(event) => set({ date: event.target.value })}
              data-slot="history-filter-date"
            />
          </FilterField>
          <FilterField label={h("filter.operator")}>
            <Input
              className="sm:w-48"
              value={filters.operator}
              placeholder={h("filter.operatorHint")}
              onChange={(event) => set({ operator: event.target.value })}
              data-slot="history-filter-operator"
            />
          </FilterField>
          <FilterField label={h("filter.action")}>
            <select
              aria-label={h("filter.action")}
              className="native-control sm:w-44"
              value={filters.action}
              onChange={(event) => set({ action: event.target.value as Filters["action"] })}
              data-slot="history-filter-action"
            >
              <option value="">{h("filter.anyAction")}</option>
              {FILE_ACTION_TYPES.map((value) => (
                <option key={value} value={value}>{h(`action.${value}`)}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label={h("filter.name")} className="sm:min-w-56 sm:flex-1">
            <Input
              value={filters.name}
              placeholder={h("filter.nameHint")}
              onChange={(event) => set({ name: event.target.value })}
              data-slot="history-filter-name"
            />
          </FilterField>
          {tab === "log" ? (
            <FilterField label={h("filter.recipient")}>
              <Input
                className="sm:w-56"
                value={filters.recipient}
                placeholder={h("filter.recipientHint")}
                onChange={(event) => set({ recipient: event.target.value })}
                data-slot="history-filter-recipient"
              />
            </FilterField>
          ) : null}
          {/* The top bar's project covers it: no empty 「项目」 label (JB65 fix).
              Both tabs follow it (JB178: 「报表」页签同样). */}
          {projectBoxShown ? (
            <FilterField label={t("history.project")}>{projectPicker}</FilterField>
          ) : (
            // Following the top bar's project: kept for its sync, with no label.
            projectPicker
          )}
        </FilterBar>
        <p className="mt-2 text-xs text-muted-foreground">
          {tab === "log" ? h("logHint") : h("actionFilterHint")}
        </p>
        <TabsContent value="reports" className="mt-3">
          <ReportRows filters={filters} page={page} onPage={setPage} scope={scope} />
        </TabsContent>
        <TabsContent value="log" className="mt-3">
          <ActionLog filters={filters} page={logPage} onPage={setLogPage} scope={scope} />
        </TabsContent>
      </Tabs>
      {opened.window}
    </div>
    </OpenLogRow.Provider>
  );
}

/* ------------------------------------------------- the record a row opens */

/** Opens the record a log row names (JB183); null outside the page. */
const OpenLogRow = createContext<((row: FileActionRecord) => void) | null>(null);

/**
 * 「打开记录」 (JB183 做法 1、2): the record in its window over this list,
 * named in the address as a history entry of its own (`open_kind` +
 * `open_id`), so the browser's back closes the window and stays here; X,
 * Esc and a click outside close it the same way. A record that has only a
 * page, and a row that kept only the page it was written on, go there; the
 * list's place is saved first, for the way back.
 */
function useOpenedLogRecord({
  home,
  pathname,
  listRef,
  router,
}: {
  home: string;
  /** The address now: `home`, or a form / record opened over this page. */
  pathname: string;
  /** The list, whose scroll place is saved before a page opens. */
  listRef: RefObject<HTMLDivElement | null>;
  router: ReturnType<typeof useRouter>;
}) {
  const search = useSearchParams();
  // What the row said of its record, for the window's heading.
  const [headings, setHeadings] = useState<Record<string, LogRecordHeading>>({});
  // Whether this page added the window's history entry (then X goes back to
  // the list's own entry rather than adding another).
  const pushed = useRef(false);
  const open = useCallback(
    (row: FileActionRecord) => {
      const target = logRowTarget(row);
      if (!target) return;
      if ("window" in target) {
        const heading: LogRecordHeading = {
          reference: rowTitle(row),
          project_id: row.project,
          project_name: row.project_name ?? "",
        };
        setHeadings((known) => ({ ...known, [`${row.record_kind}:${row.record_id}`]: heading }));
        const query = withOpenRecord(new URLSearchParams(window.location.search), row.record_kind, row.record_id);
        window.history.pushState(null, "", `${home}?${query}`);
        pushed.current = true;
        return;
      }
      saveListScroll(listRef.current);
      router.push("page" in target ? target.page : target.pastPage);
    },
    [home, listRef, router],
  );
  const close = useCallback(() => {
    const now = new URLSearchParams(window.location.search);
    if (window.location.pathname !== home || !openRecordIn(now)) return;
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
      return;
    }
    // Opened from the address itself (a reload): take the record out of it.
    const query = withoutOpenRecord(now);
    window.history.replaceState(null, "", query ? `${home}?${query}` : home);
  }, [home]);
  // A form or record opened from inside the window (更正, 补供应商) has an
  // address of its own, over this page, and this page's address no longer
  // names the window. The window stays under it, as every window opened in
  // place does - so a saved form comes back to it, not to a second window
  // of the same record that had to be closed first (JB187).
  const namedHere = openRecordIn(search);
  const here = pathname === home;
  const [kept, setKept] = useState(namedHere);
  if (here && (kept?.kind !== namedHere?.kind || kept?.id !== namedHere?.id)) setKept(namedHere);
  const named = here ? namedHere : kept;
  const target = named ? logRowTarget({ record_kind: named.kind, record_id: named.id }) : null;
  const shown =
    named && target && "window" in target ? (
      <LogRecordWindow
        key={`${named.kind}:${named.id}`}
        opener={target.window}
        kind={target.kind}
        id={target.id}
        heading={headings[`${named.kind}:${named.id}`]}
        onClose={close}
      />
    ) : null;
  return { open, window: shown };
}

/* ------------------------------------------------- the list's scroll place */

/** Where the list was scrolled, for which address (sessionStorage). */
const SCROLL_STORE = "report-history-scroll";

/** The element the page scrolls in: the layout's, not the window. */
function scrollBox(node: HTMLElement | null): HTMLElement | null {
  for (let at = node?.parentElement ?? null; at; at = at.parentElement) {
    if (/(auto|scroll)/.test(window.getComputedStyle(at).overflowY)) return at;
  }
  return null;
}

function currentScrollKey(): string {
  return scrollKey(window.location.pathname, new URLSearchParams(window.location.search));
}

/** Keep where the list around `node` is scrolled, for the current address. */
function saveListScroll(node: HTMLElement | null) {
  const box = scrollBox(node);
  if (!box) return;
  try {
    window.sessionStorage.setItem(SCROLL_STORE, JSON.stringify({ key: currentScrollKey(), top: box.scrollTop }));
  } catch {
    // No storage (a private window): the list opens at the top.
  }
}

/**
 * 「返回后保留…列表位置」 (JB183 做法 5): the scroll position is kept for this
 * address as the reader scrolls, before a record's page opens (`open`) and
 * before a reload; `useRestoredListScroll` puts it back once the list has come.
 */
function useSavedListScroll(listRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const node = listRef.current;
    const box = scrollBox(node);
    if (!box) return;
    const save = () => saveListScroll(node);
    let frame = 0;
    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(save);
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      window.cancelAnimationFrame(frame);
      box.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", save);
    };
  }, [listRef]);
}

/** Back to the kept place, once, when the list for the same address has come. */
function useRestoredListScroll(ready: boolean) {
  const marker = useRef<HTMLElement | null>(null);
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const box = scrollBox(marker.current);
    if (!box) return;
    try {
      const kept = JSON.parse(window.sessionStorage.getItem(SCROLL_STORE) ?? "null") as { key?: string; top?: number } | null;
      if (kept && kept.key === currentScrollKey() && typeof kept.top === "number") box.scrollTop = kept.top;
    } catch {
      // Nothing kept, or no storage: stay at the top.
    }
  }, [ready]);
  return marker;
}

/**
 * What the page is showing (JB180 第 4 点, JB178 第 5 点): the project and the
 * filters in force, in plain words - 「现在只显示：PRJ-0003 - PUTRA_MAS ·
 * 12/11/2026 · 下载 / 导出，共 1 笔。」 - and, when a project has nothing, which
 * project and where to choose 「全部项目」.
 */
export interface HistoryScope {
  /** 「PRJ-0003 - PUTRA_MAS」 while one project is chosen, else "". */
  projectLabel: string;
  /** The project and filters in force, each in words. */
  parts: string[];
  /** A filter other than the project narrows the list. */
  narrowed: boolean;
  /** Something 【清除筛选】 can take away (the top bar's project it cannot). */
  clearable: boolean;
  /** 「要看所有项目的，请在右上角选「全部项目」。」 */
  allProjectsHint: string;
  onClear: () => void;
}

/** 「PRJ-0003 - PUTRA_MAS」 for a project id; "" for 「全部项目」. */
function useProjectLabel(project: string): string {
  const current = useCurrentProject();
  const wanted = project && project !== "all" ? project : "";
  // query-failure: only names the project in a sentence; without the list the sentence shows 「…」 for it
  const list = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () => getProjects({ page_size: 100, sort_by: "name" }),
    enabled: Boolean(wanted) && !current.active,
    staleTime: 60_000,
  });
  if (!wanted) return "";
  const found = (current.active ? current.projects : list.data?.results ?? []).find((row) => row.id === wanted);
  return found ? `${found.code} - ${found.name}` : "…";
}

function useHistoryScope(filters: Filters, tab: string, onClear: () => void): HistoryScope {
  const t = useTranslations("contractorReports");
  const h = useTranslations("contractorReports.history");
  const df = useDateFormat();
  const current = useCurrentProject();
  const projectLabel = useProjectLabel(filters.project);
  const others = [
    filters.date ? df.date(filters.date) : "",
    filters.operator.trim(),
    filters.action ? h(`action.${filters.action}`) : "",
    filters.name.trim(),
    tab === "log" ? filters.recipient.trim() : "",
  ].filter(Boolean);
  return {
    projectLabel,
    parts: [projectLabel, ...others].filter(Boolean),
    narrowed: others.length > 0,
    clearable: others.length > 0 || (!current.active && Boolean(projectLabel)),
    allProjectsHint: current.active
      ? h("allProjectsTopBar")
      : h("allProjectsFilter", { all: t("filter.allProjects") }),
    onClear,
  };
}

/** 「现在只显示：…，共 N 笔。」 and 【清除筛选】, above the table. */
export function ShowingOnly({ scope, count }: { scope: HistoryScope; count?: number }) {
  const h = useTranslations("contractorReports.history");
  if (!scope.parts.length || count === undefined) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm" data-slot="history-showing">
      <p className="min-w-0 break-words">{h("showingOnly", { what: scope.parts.join(" · "), count })}</p>
      {scope.clearable ? (
        <Button size="sm" variant="ghost" onClick={scope.onClear} data-slot="history-clear">
          {h("filter.clear")}
        </Button>
      ) : null}
    </div>
  );
}

/** Nothing to list: why, in words that say which project and how to see all. */
export function EmptyNote({
  scope,
  plain,
  noMatch,
  projectEmpty,
}: {
  scope: HistoryScope;
  plain: string;
  noMatch: string;
  projectEmpty: string;
}) {
  return (
    <div className="space-y-1 p-10 text-center text-sm text-muted-foreground" data-slot="history-empty">
      {scope.narrowed ? (
        <p>{noMatch}</p>
      ) : scope.projectLabel ? (
        <>
          <p>{projectEmpty}</p>
          <p>{scope.allProjectsHint}</p>
        </>
      ) : (
        <p>{plain}</p>
      )}
    </div>
  );
}

/** The report types whose name, in the reader's words, holds what was typed. */
function useMatchingTypes(name: string): string[] {
  const t = useTranslations("contractorReports");
  const dashboard = useTranslations("contractorDashboard");
  const wanted = name.trim().toLowerCase();
  if (!wanted) return [];
  const matches: string[] = REPORT_TYPES.filter((type) => t(`type.${type}`).toLowerCase().includes(wanted));
  if (dashboard("export.title").toLowerCase().includes(wanted)) matches.push("dashboard");
  return matches;
}

/* --------------------------------------------------------------- reports */

function ReportRows({
  filters,
  page,
  onPage,
  scope,
}: {
  filters: Filters;
  page: number;
  onPage: (page: number) => void;
  scope: HistoryScope;
}) {
  const t = useTranslations("contractorReports");
  const h = useTranslations("contractorReports.history");
  const dashboard = useTranslations("contractorDashboard");
  const archiveT = useTranslations("reportArchive");
  const df = useDateFormat();
  const archive = useReportArchive();
  const [showing, setShowing] = useState<ContractorReportExportRecord | null>(null);
  const operator = useDeferredValue(filters.operator.trim());
  const name = useDeferredValue(filters.name.trim());
  const types = useMatchingTypes(name);
  const query: ListQuery = {
    page,
    page_size: PAGE_SIZE,
    date: filters.date || undefined,
    operator: operator || undefined,
    action: filters.action || undefined,
    name: name || undefined,
    report_types: types.length ? types.join(",") : undefined,
    // The page's project, as on 「操作记录」 (JB178): 「全部项目」 sends none.
    project: filters.project === "all" ? undefined : filters.project,
  };
  const history = useQuery({
    queryKey: ["contractor-reports", "history", query],
    queryFn: () => getContractorReportHistory(query),
  });
  // The 现场看板 export shares this history; it is not one of the report types.
  const reportName = (row: ContractorReportExportRecord) =>
    row.report_type === "dashboard" ? dashboard("export.title") : t(`type.${row.report_type}`);
  const previewTitle = (row: ContractorReportExportRecord) =>
    `${reportName(row)} · ${row.date_from} - ${row.date_to}`;
  const rows = history.data?.results ?? [];
  const marker = useRestoredListScroll(history.isSuccess);

  return (
    <section className="surface-panel overflow-hidden rounded-xl" ref={marker}>
      {history.isLoading ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-9 w-full" />)}
        </div>
      ) : history.isError ? (
        <p className="p-8 text-center text-sm text-destructive">{t("loadError")}</p>
      ) : rows.length === 0 ? (
        <>
          <ShowingOnly scope={scope} count={history.data?.count ?? 0} />
          <EmptyNote
            scope={scope}
            plain={h("empty")}
            noMatch={h("noMatch")}
            projectEmpty={h("emptyProject", { project: scope.projectLabel })}
          />
        </>
      ) : (
        <>
          <ShowingOnly scope={scope} count={history.data?.count} />
          {/* Fits the page (I39): the file name wraps, the dates stack. */}
          <Table fit>
            <TableHeader><TableRow>
              <TableHead>{h("file")}</TableHead>
              <TableHead>{h("report")}</TableHead>
              <TableHead>{h("project")}</TableHead>
              <TableHead>{h("period")}</TableHead>
              <TableHead className="text-right tabular">{h("rows")}</TableHead>
              <TableHead>{h("generatedBy")}</TableHead>
              <TableHead>{h("generatedAt")}</TableHead>
              <TableHead pin="end">{archiveT("column")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="align-top cursor-pointer"
                  onClick={(event) => {
                    if (clickOpensRow(event)) previewArchived(archive, row, previewTitle(row));
                  }}
                >
                  <TableCell className="overflow-hidden whitespace-normal">
                    <ArchivedReportName row={row} archive={archive} title={previewTitle(row)} />
                    <ArchivedReportNote row={row} className="pl-6" />
                    {row.regenerated_from_at ? (
                      <p className="mt-1 pl-6 text-xs text-muted-foreground" data-slot="history-regenerated">
                        {h("regeneratedNote", { when: df.dateTime(row.regenerated_from_at) })}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>{reportName(row)}</TableCell>
                  <TableCell>{row.project_name || t("filter.allProjects")}</TableCell>
                  <TableCell className="whitespace-nowrap tabular">{row.date_from} - {row.date_to}</TableCell>
                  <TableCell className="text-right tabular">{row.metric_count}</TableCell>
                  <TableCell>{row.generated_by_name || row.generated_by_email}</TableCell>
                  <TableCell className="whitespace-nowrap tabular">{df.dateTime(row.created_at)}</TableCell>
                  <TableCell pin="end">
                    <div className="flex flex-col items-start gap-1">
                      {row.has_file ? (
                        <ArchivedReportActions row={row} archive={archive} title={previewTitle(row)} />
                      ) : row.regenerated_as ? (
                        // Generated again once already: the new row is the
                        // one to open, not a second copy (JB27 review #5).
                        <p className="max-w-56 text-xs text-muted-foreground" data-slot="history-already-regenerated">
                          {h("alreadyRegenerated")}
                        </p>
                      ) : (
                        <RegenerateButton row={row} reportName={reportName(row)} />
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowing(row)}
                        data-slot="history-row-actions"
                      >
                        <History />
                        {h("rowActions", { count: row.file_action_count ?? 0 })}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      <Pager page={page} count={history.data?.count} totalPages={history.data?.total_pages ?? 0} onPage={onPage} />
      {showing ? (
        <ReportActionsDialog row={showing} title={previewTitle(showing)} onClose={() => setShowing(null)} />
      ) : null}
      {archive.element}
    </section>
  );
}

/** The conditions a history row saved, as the report centre's filters. */
export function savedConditions(row: ContractorReportExportRecord): ContractorReportFilters {
  const saved = (row.filters ?? {}) as Record<string, unknown>;
  const conditions: Record<string, string> = {};
  for (const key of SAVED_KEYS) {
    const value = saved[key];
    if (typeof value === "string" && value) conditions[key] = value;
  }
  const project = row.project ?? (typeof saved.project === "string" ? saved.project : "");
  return {
    ...conditions,
    report_type: row.report_type as ContractorReportType,
    date_from: row.date_from,
    date_to: row.date_to,
    project: project || undefined,
  };
}

/**
 * 「按当时条件重新生成」: the row's saved report, project, period and
 * filters, generated again with today's data into a new history row (JB27).
 * Nothing is saved to the computer and nothing leaves: no PIN here - the new
 * row's 打印 · 导出 · 发送 ask, as every other row's do.
 */
function RegenerateButton({ row, reportName }: { row: ContractorReportExportRecord; reportName: string }) {
  const t = useTranslations("contractorReports");
  const h = useTranslations("contractorReports.history");
  const archiveT = useTranslations("reportArchive");
  const tRoot = useTranslations();
  const units = useUnitExportValues();
  const locale = useLocale();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  // The 现场看板 is exported from its own screen, with its own words: its
  // old rows cannot be generated here.
  if (row.report_type === "dashboard") {
    return (
      <p className="max-w-56 text-xs text-muted-foreground" data-slot="history-cannot-regenerate">
        {archiveT("missing")} {h("cannotRegenerate")}
      </p>
    );
  }
  const regenerate = async () => {
    setBusy(true);
    try {
      const conditions = savedConditions(row);
      // The columns the report has now, worded as the screen words them.
      const columns = await getContractorReport(conditions)
        .then((report) => report.columns ?? [])
        .catch(() => [] as string[]);
      await captureDownload(() =>
        exportContractorReport({
          ...conditions,
          format: row.export_format,
          title: reportName,
          subtitle: [
            t("period", { from: row.date_from, to: row.date_to }),
            h("regeneratedOnFile", { when: df.dateTime(row.created_at) }),
          ].join(" · "),
          column_labels: Object.fromEntries(columns.map((key) => [key, t(`column.${key}`)])),
          column_values: reportColumnValues(
            row.report_type as ContractorReportType,
            columns,
            (key) => (tRoot.has(key) ? tRoot(key) : null),
            (namespace) => messageCodes(tRoot, namespace),
            units,
          ),
          lang: locale,
          regenerated_from: row.id,
        }),
      );
      toast.success(h("regenerated"));
      await queryClient.invalidateQueries({ queryKey: ["contractor-reports", "history"] });
    } catch (error) {
      // The server's refusal is already toasted in the reader's words.
      if (!isSignOffCancelled(error) && !(error instanceof ApiError)) {
        toast.error(h("regenerateFailed"));
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        disabledReason={h("regenerating")}
        title={h("regenerateHint")}
        onClick={() => void regenerate()}
        data-slot="history-regenerate"
      >
        {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
        {h("regenerate")}
      </Button>
      <p className="max-w-56 text-xs leading-snug text-muted-foreground">{h("regenerateHint")}</p>
    </div>
  );
}

/** One report's own prints, downloads and sends (事项 3 第 4 点). */
function ReportActionsDialog({
  row,
  title,
  onClose,
}: {
  row: ContractorReportExportRecord;
  title: string;
  onClose: () => void;
}) {
  const h = useTranslations("contractorReports.history");
  const [page, setPage] = useState(1);
  // query-failure: `ActionTable` says the read failed (records.isError), never "no records"
  const records = useQuery({
    queryKey: ["file-actions", "report", row.id, page],
    queryFn: () => getFileActionRecords({ report_export: row.id, page, page_size: PAGE_SIZE }),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl" data-slot="history-row-actions-dialog">
        <DialogHeader>
          <DialogTitle>{h("rowActionsTitle")}</DialogTitle>
          <DialogDescription className="break-all">{title} · {row.file_name}</DialogDescription>
        </DialogHeader>
        <ActionTable records={records} compact />
        <Pager page={page} count={records.data?.count} totalPages={records.data?.total_pages ?? 0} onPage={setPage} />
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------ action log */

function ActionLog({
  filters,
  page,
  onPage,
  scope,
}: {
  filters: Filters;
  page: number;
  onPage: (page: number) => void;
  scope: HistoryScope;
}) {
  const h = useTranslations("contractorReports.history");
  const operator = useDeferredValue(filters.operator.trim());
  const name = useDeferredValue(filters.name.trim());
  const recipient = useDeferredValue(filters.recipient.trim());
  const query: ListQuery = {
    page,
    page_size: PAGE_SIZE,
    date: filters.date || undefined,
    operator: operator || undefined,
    action: filters.action || undefined,
    name: name || undefined,
    project: filters.project === "all" ? undefined : filters.project,
    recipient: recipient || undefined,
  };
  // query-failure: `ActionTable` says the read failed (records.isError), never "no records"
  const records = useQuery({
    queryKey: ["file-actions", "log", query],
    queryFn: () => getFileActionRecords(query),
  });
  const marker = useRestoredListScroll(records.isSuccess);
  return (
    <section className="surface-panel overflow-hidden rounded-xl" data-slot="history-action-log" ref={marker}>
      {records.isSuccess ? <ShowingOnly scope={scope} count={records.data?.count ?? 0} /> : null}
      <ActionTable
        records={records}
        empty={
          <EmptyNote
            scope={scope}
            plain={h("logEmpty")}
            noMatch={h("logNoMatch")}
            projectEmpty={h("logEmptyProject", { project: scope.projectLabel })}
          />
        }
      />
      <Pager page={page} count={records.data?.count} totalPages={records.data?.total_pages ?? 0} onPage={onPage} />
    </section>
  );
}

/**
 * The log's rows (JB180 第 5 点): 日期时间｜操作员（姓名和账号）｜操作类型｜项目｜
 * 报表名称｜发送记录（发给谁、方式、状态）｜查看. A click on a row with a kept
 * file opens it, as its 「查看」 does.
 */
function ActionTable({
  records,
  compact = false,
  empty,
}: {
  records: { isLoading: boolean; isError: boolean; data?: { results: FileActionRecord[] } };
  compact?: boolean;
  /** What an empty list says; 「还没有打印、下载或发送的记录。」 by default. */
  empty?: ReactNode;
}) {
  const h = useTranslations("contractorReports.history");
  const t = useTranslations("contractorReports");
  const archive = useReportArchive();
  const openRow = useContext(OpenLogRow);
  const rows = records.data?.results ?? [];
  if (records.isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-9 w-full" />)}
      </div>
    );
  }
  if (records.isError) return <p className="p-8 text-center text-sm text-destructive">{t("loadError")}</p>;
  if (!rows.length) {
    return empty ?? <p className="p-10 text-center text-sm text-muted-foreground">{h("logEmpty")}</p>;
  }
  return (
    <>
      <Table fit>
        <TableHeader><TableRow>
          <TableHead>{h("log.at")}</TableHead>
          <TableHead>{h("log.operator")}</TableHead>
          <TableHead>{h("log.action")}</TableHead>
          {compact ? null : <TableHead>{h("project")}</TableHead>}
          <TableHead>{h("log.reportName")}</TableHead>
          <TableHead>{h("log.sendRecord")}</TableHead>
          <TableHead pin="end">{h("log.view")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((row) => {
            const kept = keptFile(row);
            // A row opens what it has: the kept file, else its record (JB183).
            const record = openRow ? logRowTarget(row) : null;
            return (
              <TableRow
                key={row.id}
                className={cn("align-top", (kept || record) && "cursor-pointer")}
                data-slot="history-action-row"
                onClick={(event) => {
                  if (!clickOpensRow(event)) return;
                  if (kept) {
                    if (!archive.busy) archive.open(kept, "preview", rowTitle(row));
                  } else if (record) {
                    openRow?.(row);
                  }
                }}
              >
                <TableCell className="whitespace-nowrap tabular">{dateTime24(row.created_at)}</TableCell>
                <TableCell className="whitespace-normal">
                  <p>{row.actor_name || "-"}</p>
                  <p className="break-all text-xs text-muted-foreground">{row.actor_account}</p>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <p>{h(`action.${row.action}`)}</p>
                  {!row.share && row.channel ? (
                    <p className="text-xs text-muted-foreground">{h(`channel.${row.channel}`)}</p>
                  ) : null}
                </TableCell>
                {compact ? null : <TableCell>{row.project_name || "-"}</TableCell>}
                <TableCell className="whitespace-normal">
                  <ActionSubject row={row} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  {row.share ? <SentToCell share={row.share} /> : <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell pin="end">
                  <RowView row={row} kept={kept} archive={archive} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {archive.element}
    </>
  );
}

/** The 「报表导出历史」 file a log row is, when it was kept (JB180). */
export function keptFile(row: FileActionRecord): ArchivedReportFile | null {
  if (!row.report_export || !row.report_has_file) return null;
  const name = row.report_file_name || row.file_name || "";
  return {
    id: row.report_export,
    file_name: name,
    export_format: /\.pdf$/i.test(name) ? "PDF" : "EXCEL",
    has_file: true,
    file_size: 0,
    file_sha256: "",
  };
}

function rowTitle(row: FileActionRecord): string {
  return row.subject || row.file_name || row.report_file_name || "";
}

/**
 * 「查看」 (JB180 第 2 点: 「历史记录没有明确的「查看」按钮，必须能够重新打开原来的
 * 报表，支持预览、打印、下载及发送／分享」): the file as it was kept - never made
 * again - in the viewer with 预览｜打印｜导出｜发送.
 *
 * 「打开记录」 (JB183): the record the row names, in its window over the list
 * (or its page, for the few with only a page). A row that names no record
 * but kept the page it was written on offers 「打开当时的页面」; a row with
 * neither says 「这一行只记下了操作，没有可以打开的文件。」.
 */
export function RowView({
  row,
  kept,
  archive,
}: {
  row: FileActionRecord;
  kept: ArchivedReportFile | null;
  archive: ReportArchive;
}) {
  const h = useTranslations("contractorReports.history");
  const files = useTranslations("fileActions");
  const openRow = useContext(OpenLogRow);
  const target = logRowTarget(row);
  return (
    <div className="flex flex-col items-start gap-1">
      {kept ? (
        <Button
          size="sm"
          variant="outline"
          disabled={Boolean(archive.busy)}
          disabledReason={files("preparing")}
          onClick={() => archive.open(kept, "preview", rowTitle(row))}
          data-slot="history-action-view"
        >
          {archive.busy === `${kept.id}:preview` ? <Loader2 className="animate-spin" /> : <Eye />}
          {h("log.view")}
        </Button>
      ) : null}
      {target ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => openRow?.(row)}
          data-slot="history-action-link"
          data-opens={"window" in target ? "window" : "page" in target ? "page" : "past-page"}
        >
          {"pastPage" in target ? h("log.openPastPage") : h("log.openRecord")}
        </Button>
      ) : null}
      {!kept && !target ? (
        <p className="max-w-48 text-xs leading-snug text-muted-foreground" data-slot="history-action-no-file">
          {h("log.noFile")}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A send's 发送记录 (JB65, JB178): 发给谁（姓名、公司、电话或 Email）、发送方式,
 * and its three states with their times (`SendStates`). Print, download and
 * export rows carry none.
 */
export function SentToCell({ share }: { share: FileShare }) {
  const s = useTranslations("fileActions.send");
  return (
    <div className="space-y-0.5 text-xs" data-slot="history-send-details">
      <p className="font-medium text-foreground">
        {share.recipient_name || "-"}
        {share.recipient_company ? ` · ${share.recipient_company}` : ""}
      </p>
      <p className="break-all text-muted-foreground">
        {s(share.method)}
        {share.recipient_contact ? ` · ${share.recipient_contact}` : ""}
      </p>
      <SendStates share={share} />
    </div>
  );
}

/** The business item and the file it was. */
function ActionSubject({ row }: { row: FileActionRecord }) {
  const name = row.file_name || row.report_file_name || "";
  return (
    <div className="min-w-0 space-y-0.5">
      {row.subject ? <p className="break-all">{row.subject}</p> : null}
      {name && name !== row.subject ? <p className="break-all text-xs text-muted-foreground">{name}</p> : null}
    </div>
  );
}

/** 「操作日期及时间（24小时制）」: always 24-hour, whatever the reader's setting. */
export function dateTime24(value: string): string {
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return value;
  const two = (n: number) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())} ${two(when.getHours())}:${two(when.getMinutes())}:${two(when.getSeconds())}`;
}

function Pager({
  page,
  count,
  totalPages,
  onPage,
}: {
  page: number;
  count?: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  const h = useTranslations("contractorReports.history");
  const table = useTranslations("table");
  const common = useTranslations("common");
  if (!count) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm" data-slot="history-pager">
      <span className="text-muted-foreground">{h("count", { count, page, pages: Math.max(totalPages, 1) })}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} disabledReason={common("alreadyFirstPage")} onClick={() => onPage(page - 1)}>
          {table("previous")}
        </Button>
        <Button size="sm" variant="outline" disabled={page >= totalPages} disabledReason={common("alreadyLastPage")} onClick={() => onPage(page + 1)}>
          {table("next")}
        </Button>
      </div>
    </div>
  );
}
