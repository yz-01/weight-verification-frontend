"use client";

/**
 * 施工准证 in the office (2026-10-10): every permit, found by project, date,
 * applicant and status (client point 7), each row's form one tap from its
 * preview, print or download, and 新申请 top right.
 */

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { FilePlus2, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { FieldDraft } from "@/components/field-staff/field-draft";
import {
  PermitApplyForm,
  PermitDetail,
  PermitFileActions,
  PermitStatusBadge,
} from "@/components/permits/permit-parts";
import { useAuth } from "@/components/providers/auth-provider";
import { ExportButton } from "@/components/shared/export-button";
import {
  FilterSelect,
  ModuleRecordsTable,
  PlainHeader,
  ProjectListFilter,
  sortable,
} from "@/components/shared/module-records-table";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { RecordNo } from "@/components/shared/record-no";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useListQuery } from "@/hooks/use-list-query";
import { useUrlSelection } from "@/hooks/use-url-selection";
import { PERMIT_STATUSES, type Permit } from "@/interfaces/permit";
import { useDateFormat } from "@/lib/dates";
import { exportPermits, getPermitApplicants, getPermits } from "@/services/permit.service";

export function PermitsOffice() {
  const t = useTranslations("permits");
  const tRoot = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const list = useListQuery(["project", "status", "applicant", "date_from", "date_to"]);
  const rows = useQuery({
    queryKey: ["permits", "office", list.query],
    queryFn: () => getPermits(list.query),
  });
  const applicants = useQuery({
    queryKey: ["permits", "applicants"],
    queryFn: getPermitApplicants,
  });
  const [viewing, setViewing] = useUrlSelection("permit");
  const [creating, setCreating] = useState(false);
  const total = rows.data?.count ?? 0;
  const title = t("title");

  const columns = useMemo<ColumnDef<Permit, unknown>[]>(
    () => [
      {
        accessorKey: "incident_no",
        meta: { label: t("field.no") },
        header: sortable(t("field.no")),
        cell: ({ row }) => <RecordNo value={row.original.incident_no} />,
      },
      {
        accessorKey: "project_name",
        meta: { label: t("field.project") },
        header: () => <PlainHeader label={t("field.project")} />,
        cell: ({ row }) => row.original.project_name,
      },
      {
        id: "files",
        meta: { label: t("field.files") },
        header: () => <PlainHeader label={t("field.files")} />,
        cell: ({ row }) => {
          const current = row.original.files.filter((file) => file.is_current);
          const first = current[0];
          if (!first) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="flex min-w-0 max-w-72 items-center gap-1">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate" title={first.original_name}>
                {first.original_name}
                {current.length > 1 && (
                  <span className="ml-1 text-xs text-muted-foreground">+{current.length - 1}</span>
                )}
              </span>
              <PermitFileActions permitId={row.original.id} file={first} compact />
            </div>
          );
        },
      },
      {
        accessorKey: "applicant_name",
        meta: { label: t("field.applicant") },
        header: () => <PlainHeader label={t("field.applicant")} />,
        cell: ({ row }) => row.original.applicant_name || "—",
      },
      {
        // The column id is the `sort_by` the API reads: the application time.
        id: "occurred_at",
        accessorFn: (row) => row.applied_at,
        meta: { label: t("field.appliedAt") },
        header: sortable(t("field.appliedAt")),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">{df.dateTime(row.original.applied_at)}</span>
        ),
      },
      {
        accessorKey: "approver_name",
        meta: { label: t("field.approver") },
        header: () => <PlainHeader label={t("field.approver")} />,
        cell: ({ row }) => row.original.approver_name || t("legacyApprover"),
      },
      {
        accessorKey: "status",
        meta: { label: t("field.status") },
        header: sortable(t("field.status")),
        cell: ({ row }) => <PermitStatusBadge status={row.original.status} />,
      },
      {
        id: "verified_at",
        accessorFn: (row) => row.decided_at,
        meta: { label: t("field.decidedAt") },
        header: sortable(t("field.decidedAt")),
        cell: ({ row }) =>
          row.original.decided_at ? (
            <span className="tabular text-muted-foreground">{df.dateTime(row.original.decided_at)}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    [t, df],
  );

  const runExport = (format: "xlsx" | "pdf") =>
    exportPermits({
      format,
      title,
      subtitle: tRoot("moduleTable.count", { count: total }),
      emptyLabel: t("empty"),
      query: list.query,
      columns: [
        { key: "incident_no", label: t("field.no") },
        { key: "project_name", label: t("field.project") },
        { key: "applicant_name", label: t("field.applicant") },
        { key: "applicant_title", label: t("field.position") },
        { key: "applied_at", label: t("field.appliedAt") },
        { key: "approver_name", label: t("field.approver") },
        {
          key: "status",
          label: t("field.status"),
          values: {
            RECTIFICATION_SUBMITTED: t("status.RECTIFICATION_SUBMITTED"),
            RETURNED: t("status.RETURNED"),
            VERIFIED: t("status.VERIFIED"),
            RESOLVED: t("status.RESOLVED"),
          },
        },
        { key: "decided_by_name", label: t("field.decidedBy") },
        { key: "decided_by_title", label: t("field.position") },
        { key: "decided_at", label: t("field.decidedAt") },
        { key: "review_note", label: t("field.reviewNote") },
        { key: "note", label: t("field.note") },
        { key: "file_names", label: t("field.files") },
      ],
    });

  return (
    <>
      <ModuleRecordsTable
        title={title}
        countLabel={tRoot("moduleTable.count", { count: total })}
        headerAction={
          can("safety.manage") ? (
            <Button onClick={() => setCreating(true)}>
              <FilePlus2 className="size-4" />
              {t("new")}
            </Button>
          ) : undefined
        }
        above={<p className="text-sm text-muted-foreground">{t("subtitle")}</p>}
        list={list}
        columns={columns}
        rows={rows.data?.results ?? []}
        totalCount={total}
        needsActionCount={rows.data?.needs_action_count}
        isLoading={rows.isLoading}
        isError={rows.isError}
        storageKey="permits.v1"
        pack="HAZARD"
        toolbar={
          <>
            <ProjectListFilter list={list} />
            <FilterSelect
              list={list}
              param="status"
              allLabel={t("filter.allStatuses")}
              options={PERMIT_STATUSES.map((status) => ({ value: status, label: t(`status.${status}`) }))}
            />
            <FilterSelect
              list={list}
              param="applicant"
              allLabel={t("filter.allApplicants")}
              options={(applicants.data ?? []).map((person) => ({ value: person.id, label: person.full_name }))}
            />
            <QueryFailedNote query={applicants} what={t("what.applicants")} />
            <Input
              type="date"
              aria-label={t("filter.dateFrom")}
              value={list.filters.date_from ?? ""}
              onChange={(event) => list.setFilter("date_from", event.target.value || undefined)}
              className="w-full sm:w-41.25"
            />
            <Input
              type="date"
              aria-label={t("filter.dateTo")}
              value={list.filters.date_to ?? ""}
              onChange={(event) => list.setFilter("date_to", event.target.value || undefined)}
              className="w-full sm:w-41.25"
            />
            <ExportButton onExport={runExport} disabled={total === 0} title={title} />
          </>
        }
        onOpen={(row) => setViewing(row.id)}
      />
      {viewing && (
        <PermitDetail id={viewing} presentation="dialog" onClose={() => setViewing(null)} />
      )}
      {creating && (
        <Dialog open onOpenChange={(open) => !open && setCreating(false)}>
          <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{t("newTitle")}</DialogTitle>
              <DialogDescription>{t("subtitle")}</DialogDescription>
            </DialogHeader>
            <FieldDraft scope="permit:new">
              <PermitApplyForm
                initialProject={list.filters.project ?? ""}
                onCancel={() => setCreating(false)}
                onSaved={(permit) => {
                  setCreating(false);
                  setViewing(permit.id);
                }}
              />
            </FieldDraft>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
