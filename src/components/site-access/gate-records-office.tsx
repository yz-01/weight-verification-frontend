"use client";

/**
 * EHS / Safety → 门岗记录 (batch H, HD9).
 *
 * 「门岗拍照记录可以归入 安全部（EHS / Safety）→ 门岗记录（Gate Records），方便
 * 后台查看、搜索及导出」, in the client's two parts:
 *
 * - **日常拍照记录 (Photo Records)**: lorries in and out and ordinary gate
 *   photos, each one photo with its time, GPS, project and photographer -
 *   searched by date, project and photographer, and exported;
 * - **门岗事项 (Gate Issues)**: the special matters - photo, note, the people
 *   asked in, their conversation, status, and who confirmed it finished and
 *   when - searched, opened and exported.
 *
 * Visitor entries and exits are not here: they are 访客进退场记录, a list of
 * their own (`visitor-records.tsx`).
 */

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { DoorOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ExportButton } from "@/components/shared/export-button";
import {
  FilterSelect,
  ModuleRecordsTable,
  PlainHeader,
  ProjectListFilter,
  sortable,
} from "@/components/shared/module-records-table";
import { photoColumn } from "@/components/shared/photo-thumb";
import { RecordNo } from "@/components/shared/record-no";
import { SupplierDateFilter } from "@/components/shared/supplier-date-filter";
import {
  GateIncidentDetailDialog,
  GateIssueStatusBadge,
} from "@/components/site-access/gate-records";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useListQuery } from "@/hooks/use-list-query";
import { useUrlSelection } from "@/hooks/use-url-selection";
import type { GateIncident } from "@/interfaces/site-access";
import { useDateFormat } from "@/lib/dates";
import { exportGateIncidents, getGateIncidents } from "@/services/site-access.service";

type Tab = "photos" | "issues";
const TABS: readonly Tab[] = ["photos", "issues"];

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
  const list = useListQuery(["project", "guard_name", "date_from", "date_to", "issue_status"]);
  const query = useMemo(() => ({ ...list.query, kind: tab }), [list.query, tab]);
  const rows = useQuery({
    queryKey: ["gate-incidents", "office", query],
    queryFn: () => getGateIncidents(query),
  });
  const [viewing, setViewing] = useUrlSelection("gate_incident");
  const total = rows.data?.count ?? 0;
  const title = t("officeTitle");

  const chooseTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    params.delete("page");
    params.delete("issue_status");
    params.delete("gate_incident");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => {
    const common: ColumnDef<Row, unknown>[] = [
      {
        accessorKey: "incident_no",
        meta: { label: t("field.number") },
        header: sortable(t("field.number")),
        cell: ({ row }) => <RecordNo value={row.original.incident_no} />,
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

  return (
    <>
      <ModuleRecordsTable<Row>
        title={title}
        countLabel={tRoot("moduleTable.count", { count: total })}
        above={
          <div className="space-y-2">
            <Tabs value={tab} onValueChange={(value) => chooseTab(value as Tab)}>
              <TabsList>
                {TABS.map((key) => (
                  <TabsTrigger key={key} value={key}>
                    {t(`tab.${key}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <p className="text-sm text-muted-foreground">{t(`tabHelp.${tab}`)}</p>
          </div>
        }
        list={list}
        columns={columns}
        rows={(rows.data?.results ?? []).map((row) => ({ ...row, cover_photo_url: row.cover_photo }))}
        totalCount={total}
        isLoading={rows.isLoading}
        isError={rows.isError}
        storageKey={`gate-records.${tab}.v1`}
        toolbar={
          <>
            <ProjectListFilter list={list} />
            <PhotographerFilter list={list} placeholder={t("field.photographer")} />
            <SupplierDateFilter
              showSupplier={false}
              value={{ date_from: list.filters.date_from, date_to: list.filters.date_to }}
              onChange={(next) => list.setFilters(next as Record<string, string | undefined>)}
            />
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
        }
        onOpen={(row) => setViewing(row.id)}
      />
      {viewing && <GateIncidentDetailDialog id={viewing} onClose={() => setViewing(null)} />}
    </>
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
