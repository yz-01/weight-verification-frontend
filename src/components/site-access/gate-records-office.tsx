"use client";

/**
 * 工地门禁 → 日常拍照记录 / 门岗事项 (batch H, HD9; moved from 整改 / EHS in
 * I25, ID61 - the address `/gate-records` and its two tabs are unchanged).
 *
 * 「门岗拍照记录可以…方便后台查看、搜索及导出」, in the client's two parts:
 *
 * - **日常拍照记录 (Photo Records)**: lorries in and out and ordinary gate
 *   photos, each one photo with its time, GPS, project and photographer -
 *   searched by date and time, project and photographer, and exported; seen
 *   as a list or, since I33 (ID74), as a 照片墙 of thumbnails;
 * - **门岗事项 (Gate Issues)**: photo, the people asked in, their
 *   conversation, status, and who confirmed it finished and when - searched,
 *   opened and exported.
 *
 * Both search by 「开始日期 时间 – 结束日期 时间」 on a 24-hour clock (I15,
 * ID62), and every row prints as its own PDF (I14, ID33).
 *
 * Visitor entries and exits are not here: they are 访客进退场记录, a list of
 * their own (`visitor-records.tsx`).
 */

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { DoorOpen, FileText, LayoutGrid, List, Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DATE_TIME_RANGE_KEYS, DateTimeRangeFilter } from "@/components/shared/date-time-range-filter";
import { ExportButton } from "@/components/shared/export-button";
import { useFileActions } from "@/components/shared/file-actions";
import {
  FilterSelect,
  ModuleRecordsTable,
  PlainHeader,
  ProjectListFilter,
  sortable,
} from "@/components/shared/module-records-table";
import { ListHeader } from "@/components/shared/page-primitives";
import { photoColumn } from "@/components/shared/photo-thumb";
import { RecordNo } from "@/components/shared/record-no";
import { GatePhotoWall, useGateWall } from "@/components/site-access/gate-photo-wall";
import {
  GateIncidentDetailDialog,
  GateIssueStatusBadge,
} from "@/components/site-access/gate-records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebounce } from "@/hooks/use-debounce";
import { useListQuery } from "@/hooks/use-list-query";
import { useUrlSelection } from "@/hooks/use-url-selection";
import type { GateIncident } from "@/interfaces/site-access";
import { useDateFormat } from "@/lib/dates";
import { absoluteUrl } from "@/lib/share";
import { recordPdfFile } from "@/services/contractor-ops.service";
import { exportGateIncidents, getGateIncidents } from "@/services/site-access.service";
import { LIST_FITS } from "@/lib/list-fits";

type Tab = "photos" | "issues";
const TABS: readonly Tab[] = ["photos", "issues"];

/** 列表 or 照片墙 (I33), on 日常拍照记录 only; kept in the address. */
type View = "list" | "wall";

type Row = GateIncident & { cover_photo_url: string | null };

export function GateRecordsOffice() {
  const t = useTranslations("siteControl.gateRecords");
  const tRoot = useTranslations();
  const df = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const asked = searchParams.get("tab") as Tab | null;
  const tab: Tab = asked && TABS.includes(asked) ? asked : "photos";
  const view: View = tab === "photos" && searchParams.get("view") === "wall" ? "wall" : "list";
  const list = useListQuery(["project", "guard_name", "issue_status", ...DATE_TIME_RANGE_KEYS]);
  const query = useMemo(() => ({ ...list.query, kind: tab }), [list.query, tab]);
  const rows = useQuery({
    queryKey: ["gate-incidents", "office", query],
    queryFn: () => getGateIncidents(query),
    enabled: view === "list",
  });
  const wall = useGateWall(query, view === "wall");
  const [viewing, setViewing] = useUrlSelection("gate_incident");
  const total = (view === "wall" ? wall.data?.pages[0]?.count : rows.data?.count) ?? 0;
  const title = t("officeTitle");

  const replaceParams = (change: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    change(params);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const chooseTab = (next: Tab) =>
    replaceParams((params) => {
      params.set("tab", next);
      params.delete("issue_status");
      params.delete("gate_incident");
      params.delete("view");
    });

  // 列表 ↔ 照片墙 keeps every filter and the search (I33: 「切回列表，筛选和搜索
  // 都还在」).
  const chooseView = (next: View) =>
    replaceParams((params) => {
      if (next === "wall") params.set("view", "wall");
      else params.delete("view");
    });

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => {
    const common: ColumnDef<Row, unknown>[] = [
      {
        accessorKey: "incident_no",
        // 记录编号 (I6); GT, split by the row's project code (ID35).
        meta: { label: tRoot("recordNo.column") },
        header: sortable(tRoot("recordNo.column")),
        cell: ({ row }) => (
          <RecordNo value={row.original.incident_no} projectCode={row.original.project_code} />
        ),
      },
      photoColumn<Row>({
        label: tRoot("moduleTable.photos"),
        icon: DoorOpen,
        reference: (row) => row.incident_no,
      }),
    ];
    const when: ColumnDef<Row, unknown>[] = [
      {
        accessorKey: "project_name",
        meta: { label: t("field.project") },
        header: () => <PlainHeader label={t("field.project")} />,
        cell: ({ row }) => row.original.project_name,
      },
      {
        accessorKey: "guard_name",
        meta: { label: t("field.photographer") },
        header: sortable(t("field.photographer")),
        cell: ({ row }) => row.original.guard_name,
      },
      {
        accessorKey: "occurred_at",
        meta: { label: t("field.time") },
        header: sortable(t("field.time")),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">{df.dateTime(row.original.occurred_at)}</span>
        ),
      },
    ];
    // 预览 · 打印 · 导出 · 发送 of the one record, from its row (I14, ID33).
    const single: ColumnDef<Row, unknown> = {
      id: "single_pdf",
      enableSorting: false,
      meta: { label: t("field.singlePdf") },
      header: () => <PlainHeader label={t("field.singlePdf")} />,
      cell: ({ row }) => <RowPdfButton row={row.original} />,
    };
    if (tab === "photos") {
      return [
        ...common,
        ...when,
        {
          id: "gps",
          meta: { label: t("field.gps") },
          header: () => <PlainHeader label={t("field.gps")} />,
          cell: ({ row }) =>
            row.original.latitude && row.original.longitude ? (
              <span className="tabular text-xs">
                {row.original.latitude}, {row.original.longitude}
              </span>
            ) : (
              <span className="text-muted-foreground">{t("gpsUnavailable")}</span>
            ),
        },
        single,
      ];
    }
    return [
      ...common,
      {
        accessorKey: "issue_note",
        meta: { label: t("field.note") },
        header: () => <PlainHeader label={t("field.note")} />,
        cell: ({ row }) => (
          <span className="line-clamp-2 max-w-72 whitespace-pre-wrap">{row.original.issue_note || "—"}</span>
        ),
      },
      {
        accessorKey: "member_names",
        meta: { label: t("field.assignees") },
        header: () => <PlainHeader label={t("field.assignees")} />,
        cell: ({ row }) => row.original.member_names || "—",
      },
      {
        id: "issue_status",
        meta: { label: t("field.status") },
        header: () => <PlainHeader label={t("field.status")} />,
        cell: ({ row }) => <GateIssueStatusBadge status={row.original.issue_status} />,
      },
      {
        id: "closed",
        meta: { label: t("field.closedBy") },
        header: () => <PlainHeader label={t("field.closedBy")} />,
        cell: ({ row }) =>
          row.original.closed_at ? (
            <span className="text-xs">
              {row.original.closed_by_name}
              <span className="block tabular text-muted-foreground">{df.dateTime(row.original.closed_at)}</span>
            </span>
          ) : (
            "—"
          ),
      },
      ...when,
      single,
    ];
  }, [t, tRoot, df, tab]);

  const runExport = (format: "xlsx" | "pdf") =>
    exportGateIncidents({
      format,
      title: `${title} · ${t(`tab.${tab}`)}`,
      subtitle: tRoot("moduleTable.count", { count: total }),
      emptyLabel: t("empty"),
      query,
      columns:
        tab === "photos"
          ? [
              { key: "incident_no", label: t("field.number") },
              { key: "project_name", label: t("field.project") },
              { key: "guard_name", label: t("field.photographer") },
              { key: "occurred_at", label: t("field.time") },
              { key: "latitude", label: t("field.latitude") },
              { key: "longitude", label: t("field.longitude") },
            ]
          : [
              { key: "incident_no", label: t("field.number") },
              { key: "project_name", label: t("field.project") },
              { key: "guard_name", label: t("field.photographer") },
              { key: "occurred_at", label: t("field.time") },
              { key: "issue_note", label: t("field.note") },
              { key: "member_names", label: t("field.assignees") },
              {
                key: "issue_status",
                label: t("field.status"),
                values: { OPEN: t("issueStatus.OPEN"), CLOSED: t("issueStatus.CLOSED") },
              },
              { key: "closed_by_name", label: t("field.closedBy") },
              { key: "closed_at", label: t("field.closedAt") },
              { key: "photo_count", label: t("field.photoCount") },
            ],
    });

  const above = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={(value) => chooseTab(value as Tab)}>
          <TabsList>
            {TABS.map((key) => (
              <TabsTrigger key={key} value={key}>
                {t(`tab.${key}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {tab === "photos" ? (
          <div className="flex items-center gap-1" role="group" aria-label={t("view.label")} data-gate-view={view}>
            {(["list", "wall"] as const).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={view === key ? "default" : "outline"}
                aria-pressed={view === key}
                onClick={() => chooseView(key)}
              >
                {key === "list" ? <List /> : <LayoutGrid />}
                {t(`view.${key}`)}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {view === "wall" ? t("tabHelp.wall") : t(`tabHelp.${tab}`)}
      </p>
    </div>
  );

  const toolbar = (
    <>
      <ProjectListFilter list={list} />
      <PhotographerFilter list={list} placeholder={t("field.photographer")} />
      <DateTimeRangeFilter list={list} />
      {tab === "issues" && (
        <FilterSelect
          list={list}
          param="issue_status"
          allLabel={tRoot("moduleTable.allStatuses")}
          options={(["OPEN", "CLOSED"] as const).map((status) => ({
            value: status,
            label: t(`issueStatus.${status}`),
          }))}
        />
      )}
      <ExportButton onExport={runExport} disabled={total === 0} title={`${title} · ${t(`tab.${tab}`)}`} />
    </>
  );

  return (
    <>
      {view === "wall" ? (
        <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
          <ListHeader
            title={title}
            // A failed wall says so in its body (GatePhotoWall's note), not
            // as 「0 条」 up here.
            subtitle={wall.isLoading || wall.isError ? "—" : tRoot("moduleTable.count", { count: total })}
          />
          {above}
          <div className="surface-panel flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden rounded-xl">
            <div
              data-slot="list-toolbar"
              className="flex shrink-0 flex-wrap items-center gap-2 border-b border-panel-border px-4 py-4 sm:px-6"
            >
              <WallSearch list={list} />
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
                {toolbar}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <GatePhotoWall wall={wall} suspended={Boolean(viewing)} onOpenRecord={setViewing} />
            </div>
          </div>
        </div>
      ) : (
        <ModuleRecordsTable<Row>
          title={title}
          countLabel={tRoot("moduleTable.count", { count: total })}
          above={above}
          list={list}
          columns={columns}
          rows={(rows.data?.results ?? []).map((row) => ({ ...row, cover_photo_url: row.cover_photo }))}
          totalCount={total}
          isLoading={rows.isLoading}
          isError={rows.isError}
          storageKey={LIST_FITS[tab === "photos" ? "gatePhotos" : "gateIssues"].storageKey}
          defaultHidden={LIST_FITS[tab === "photos" ? "gatePhotos" : "gateIssues"].hidden}
          toolbar={toolbar}
          onOpen={(row) => setViewing(row.id)}
        />
      )}
      {viewing && <GateIncidentDetailDialog id={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

/**
 * The wall's search box: the table's own search (the same `?search=`), so
 * switching between 列表 and 照片墙 keeps what was typed.
 */
function WallSearch({ list }: { list: ReturnType<typeof useListQuery> }) {
  const tRoot = useTranslations();
  const [draft, setDraft] = useState(list.search);
  const typed = useDebounce(draft, 300);
  const { search, setSearch } = list;
  useEffect(() => {
    if (typed !== search) setSearch(typed);
    // Only the typed draft pushes a change; reacting to `search` here would
    // fight the address when the back button restores it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);
  return (
    <div className="relative w-full min-w-0 flex-1 sm:w-auto sm:min-w-52 sm:max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={tRoot("common.searchPlaceholder")}
        aria-label={tRoot("common.searchPlaceholder")}
        className="bg-card pl-9"
      />
    </div>
  );
}

/**
 * 「单笔」 from a row (I14, ID33): this record's PDF in the viewer, where it
 * prints, saves and is sent (the phone's share sheet, WhatsApp included).
 * Clicks inside stay here - the row behind would otherwise open the record.
 */
function RowPdfButton({ row }: { row: GateIncident }) {
  const t = useTranslations("siteControl.gateRecords");
  const tFile = useTranslations("fileActions");
  const { busy, run, element } = useFileActions();
  return (
    <span
      className="inline-flex"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Button
        size="sm"
        variant="ghost"
        className="h-8 px-2 text-primary"
        title={t("singlePdfHint")}
        data-gate-row-pdf={row.id}
        onClick={() =>
          void run("preview", {
            load: () => recordPdfFile("GATE_INCIDENT", row.id, row.incident_no),
            title: tFile("completeEvidenceTitle", { reference: row.incident_no }),
            link: absoluteUrl(`/gate-records?gate_incident=${row.id}`),
          })
        }
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
        PDF
      </Button>
      {element}
    </span>
  );
}

/** 拍摄人: who took the photo, typed, written to the list when typing stops. */
function PhotographerFilter({
  list,
  placeholder,
}: {
  list: ReturnType<typeof useListQuery>;
  placeholder: string;
}) {
  const [value, setValue] = useState(list.filters.guard_name ?? "");
  const current = list.filters.guard_name ?? "";
  const { setFilter } = list;
  useEffect(() => {
    if (value === current) return;
    const timer = setTimeout(() => setFilter("guard_name", value.trim() || undefined), 400);
    return () => clearTimeout(timer);
  }, [value, current, setFilter]);
  return (
    <Input
      aria-label={placeholder}
      placeholder={placeholder}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      className="w-full sm:w-40"
    />
  );
}
