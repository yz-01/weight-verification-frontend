"use client";

/**
 * 访客进退场记录 / Visitor Records (batch H, HD9).
 *
 * 「所有进退场记录必须自动关联原 Visitor 申请记录，保存在所属项目后台 Visitor
 * Records…同一访客多次进退场，每次记录独立保存，不得覆盖历史」: one row per
 * confirmed entry or exit, each with the pass it belongs to, searched and
 * exported. Kept apart from the gate photographs (「不与门岗照片混合」).
 * Opening a row opens its pass on 工地门禁. Searched by 「开始日期 时间 – 结束
 * 日期 时间」 on a 24-hour clock, like the gate photos (I15, ID62).
 */

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { ExportButton } from "@/components/shared/export-button";
import {
  FilterSelect,
  ModuleRecordsTable,
  PlainHeader,
  ProjectListFilter,
  sortable,
} from "@/components/shared/module-records-table";
import { DATE_TIME_RANGE_KEYS, DateTimeRangeFilter } from "@/components/shared/date-time-range-filter";
import { StatusBadge } from "@/components/shared/page-primitives";
import { RecordNo } from "@/components/shared/record-no";
import { useListQuery } from "@/hooks/use-list-query";
import type { VisitorRecord } from "@/interfaces/site-access";
import { useDateFormat } from "@/lib/dates";
import { exportVisitorRecords, getVisitorRecords } from "@/services/site-access.service";

export function VisitorRecords() {
  const t = useTranslations("siteControl.visitorRecords");
  const tSite = useTranslations("siteControl");
  const tRoot = useTranslations();
  const df = useDateFormat();
  const router = useRouter();
  const list = useListQuery(["project", "direction", "subject_type", ...DATE_TIME_RANGE_KEYS]);
  const rows = useQuery({
    queryKey: ["visitor-records", list.query],
    queryFn: () => getVisitorRecords(list.query),
  });
  const total = rows.data?.count ?? 0;
  const title = t("title");

  const columns = useMemo<ColumnDef<VisitorRecord, unknown>[]>(
    () => [
      {
        accessorKey: "occurred_at",
        meta: { label: t("field.time") },
        header: sortable(t("field.time")),
        cell: ({ row }) => <span className="tabular">{df.dateTime(row.original.occurred_at)}</span>,
      },
      {
        accessorKey: "direction",
        meta: { label: t("field.direction") },
        header: sortable(t("field.direction")),
        cell: ({ row }) => (
          <StatusBadge
            label={tSite(`direction.${row.original.direction}`)}
            tone={row.original.direction === "ENTRY" ? "positive" : "neutral"}
          />
        ),
      },
      {
        accessorKey: "subject_name",
        meta: { label: t("field.person") },
        header: () => <PlainHeader label={t("field.person")} />,
        cell: ({ row }) => (
          <span>
            <span className="block font-medium">{row.original.subject_name}</span>
            <span className="block text-xs text-muted-foreground">
              {tSite(`subjectType.${row.original.subject_type}`)}
              {row.original.subject_company ? ` · ${row.original.subject_company}` : ""}
            </span>
          </span>
        ),
      },
      {
        accessorKey: "phone",
        meta: { label: t("field.phone") },
        header: () => <PlainHeader label={t("field.phone")} />,
        cell: ({ row }) => row.original.phone || "—",
      },
      {
        accessorKey: "vehicle_plate",
        meta: { label: t("field.vehicle") },
        header: () => <PlainHeader label={t("field.vehicle")} />,
        cell: ({ row }) => row.original.vehicle_plate || "—",
      },
      {
        accessorKey: "purpose",
        meta: { label: t("field.purpose") },
        header: () => <PlainHeader label={t("field.purpose")} />,
        cell: ({ row }) => <span className="line-clamp-2 max-w-60">{row.original.purpose || "—"}</span>,
      },
      {
        accessorKey: "pass_no",
        meta: { label: t("field.pass") },
        header: () => <PlainHeader label={t("field.pass")} />,
        cell: ({ row }) => <RecordNo value={row.original.pass_no} />,
      },
      {
        accessorKey: "project_name",
        meta: { label: t("field.project") },
        header: () => <PlainHeader label={t("field.project")} />,
        cell: ({ row }) => row.original.project_name,
      },
      {
        accessorKey: "approved_by_name",
        meta: { label: t("field.approvedBy") },
        header: () => <PlainHeader label={t("field.approvedBy")} />,
        cell: ({ row }) => row.original.approved_by_name || "—",
      },
      {
        accessorKey: "scanned_by_name",
        meta: { label: t("field.guard") },
        header: () => <PlainHeader label={t("field.guard")} />,
        cell: ({ row }) =>
          row.original.scanned_by_name ||
          (row.original.source === "THIRD_PARTY" ? t("device") : "—"),
      },
    ],
    [t, tSite, df],
  );

  const runExport = (format: "xlsx" | "pdf") =>
    exportVisitorRecords({
      format,
      title,
      subtitle: tRoot("moduleTable.count", { count: total }),
      emptyLabel: t("empty"),
      query: list.query,
      columns: [
        { key: "occurred_at", label: t("field.time") },
        {
          key: "direction",
          label: t("field.direction"),
          values: { ENTRY: tSite("direction.ENTRY"), EXIT: tSite("direction.EXIT") },
        },
        { key: "pass_no", label: t("field.pass") },
        {
          key: "subject_type",
          label: t("field.type"),
          values: {
            WORKER: tSite("subjectType.WORKER"),
            VISITOR: tSite("subjectType.VISITOR"),
            VEHICLE: tSite("subjectType.VEHICLE"),
          },
        },
        { key: "subject_name", label: t("field.person") },
        { key: "subject_company", label: t("field.company") },
        { key: "phone", label: t("field.phone") },
        { key: "vehicle_plate", label: t("field.vehicle") },
        { key: "purpose", label: t("field.purpose") },
        { key: "project_name", label: t("field.project") },
        { key: "approved_by_name", label: t("field.approvedBy") },
        { key: "valid_until", label: t("field.validUntil") },
        { key: "gate_name", label: t("field.gate") },
        { key: "scanned_by_name", label: t("field.guard") },
      ],
    });

  return (
    <ModuleRecordsTable<VisitorRecord>
      title={title}
      countLabel={tRoot("moduleTable.count", { count: total })}
      above={<p className="text-sm text-muted-foreground">{t("help")}</p>}
      list={list}
      columns={columns}
      rows={rows.data?.results ?? []}
      totalCount={total}
      isLoading={rows.isLoading}
      isError={rows.isError}
      storageKey="visitor-records.v1"
      toolbar={
        <>
          <ProjectListFilter list={list} />
          <FilterSelect
            list={list}
            param="direction"
            allLabel={t("allDirections")}
            options={(["ENTRY", "EXIT"] as const).map((value) => ({
              value,
              label: tSite(`direction.${value}`),
            }))}
          />
          <FilterSelect
            list={list}
            param="subject_type"
            allLabel={t("allTypes")}
            options={(["VISITOR", "WORKER", "VEHICLE"] as const).map((value) => ({
              value,
              label: tSite(`subjectType.${value}`),
            }))}
          />
          <DateTimeRangeFilter list={list} />
          <ExportButton onExport={runExport} disabled={total === 0} title={title} />
        </>
      }
      onOpen={(row) => router.push(`/site-access?pass=${row.pass_id}&project=${row.project}`)}
    />
  );
}
