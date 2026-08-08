"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, Eye, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  ListHeader,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import type { CompanyRow, CompanyStatus } from "@/interfaces/company";
import { useDateFormat } from "@/lib/dates";
import { MALAYSIA_STATES } from "@/lib/malaysia";
import {
  deleteCompany,
  getCompanies,
  getCompanySummary,
  getSubscriptionPlans,
  updateCompanyStatus,
} from "@/services/companies.service";

const FILTER_KEYS = ["type", "status", "state", "plan", "review_status"];
/** How each lifecycle state reads in the status pill. */
const STATUS_TONE: Record<
  CompanyStatus,
  "positive" | "info" | "warning" | "danger" | "neutral"
> = {
  ACTIVE: "positive",
  TRIAL: "info",
  OVERDUE: "warning",
  SUSPENDED: "danger",
  CLOSED: "neutral",
};

type PendingAction =
  | { kind: "remove"; company: CompanyRow }
  | { kind: "suspend"; company: CompanyRow }
  | { kind: "reinstate"; company: CompanyRow };

export type CompanyManagementSection =
  | "directory"
  | "review"
  | "status"
  | "subscriptions"
  | "projects"
  | "recyclers"
  | "search"
  | "statistics";

export function Companies({
  section = "directory",
}: {
  section?: CompanyManagementSection;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery(FILTER_KEYS);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const fixedQuery =
    section === "review"
      ? { review_status: "PENDING" }
      : section === "projects"
        ? { type: "CONTRACTOR" }
        : section === "recyclers"
          ? { type: "RECYCLER" }
          : {};

  const { data, isLoading, isError } = useQuery({
    queryKey: ["companies", section, list.query],
    queryFn: () => getCompanies({ ...list.query, ...fixedQuery }),
    enabled: section !== "statistics",
  });
  const summary = useQuery({
    queryKey: ["companies", "summary"],
    queryFn: getCompanySummary,
  });
  const plans = useQuery({
    queryKey: ["subscription-plans", "company-filter"],
    queryFn: () => getSubscriptionPlans(),
  });

  function closeDialog() {
    setPending(null);
    setReason("");
  }

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["companies"] });
    closeDialog();
  };

  const removal = useMutation({
    mutationFn: (id: string) => deleteCompany(id),
    onSuccess: invalidate,
  });

  const statusChange = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "ACTIVE" | "SUSPENDED";
    }) => updateCompanyStatus(id, { status, reason }),
    onSuccess: invalidate,
  });

  const columns = useMemo<ColumnDef<CompanyRow, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        meta: { label: t("companies.field.code") },
        header: ({ column }) => (
          <SortableHeader
            label={t("companies.field.code")}
            isSorted={column.getIsSorted()}
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          />
        ),
        cell: ({ row }) => (
          <span className="tabular font-medium text-foreground">
            {row.original.code}
          </span>
        ),
      },
      {
        accessorKey: "name",
        meta: { label: t("companies.field.name") },
        header: ({ column }) => (
          <SortableHeader
            label={t("companies.field.name")}
            isSorted={column.getIsSorted()}
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          />
        ),
        cell: ({ row }) => (
          <span
            className="block max-w-[240px] truncate font-medium text-foreground"
            title={row.original.name}
          >
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: "type",
        meta: { label: t("companies.field.type") },
        header: ({ column }) => (
          <SortableHeader
            label={t("companies.field.type")}
            isSorted={column.getIsSorted()}
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          />
        ),
        cell: ({ row }) => (
          <TypeBadge label={t(`companies.type.${row.original.type}`)} />
        ),
      },
      {
        accessorKey: "status",
        meta: { label: t("companies.field.status") },
        header: ({ column }) => (
          <SortableHeader
            label={t("companies.field.status")}
            isSorted={column.getIsSorted()}
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`companies.status.${row.original.status}`)}
            tone={STATUS_TONE[row.original.status]}
          />
        ),
      },
      {
        accessorKey: "state",
        meta: { label: t("companies.field.state") },
        header: () => t("companies.field.state"),
        cell: ({ row }) => row.original.state || t("common.emptyValue"),
      },
      {
        accessorKey: "plan_name",
        meta: { label: t("companies.field.plan") },
        header: () => t("companies.field.plan"),
        cell: ({ row }) => row.original.plan_name || t("common.emptyValue"),
      },
      {
        accessorKey: "review_status",
        meta: { label: t("companies.field.reviewStatus") },
        header: () => t("companies.field.reviewStatus"),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`companies.reviewStatus.${row.original.review_status}`)}
            tone={
              row.original.review_status === "APPROVED"
                ? "positive"
                : row.original.review_status === "REJECTED"
                  ? "danger"
                  : "warning"
            }
          />
        ),
      },
      {
        accessorKey: "contact_person",
        meta: { label: t("companies.field.contactPerson") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("companies.field.contactPerson")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">
              {row.original.contact_person || t("common.emptyValue")}
            </p>
            {row.original.contact_email && (
              <p className="truncate text-xs text-muted-foreground">
                {row.original.contact_email}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "user_count",
        meta: { label: t("companies.field.userCount") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("companies.field.userCount")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="tabular">{row.original.user_count}</span>
        ),
      },
      {
        accessorKey: "created_at",
        meta: { label: t("companies.field.createdAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("companies.field.createdAt")}
            isSorted={column.getIsSorted()}
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {df.date(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: "project_total",
        meta: { label: t("companies.projectStats.total") },
        header: () => t("companies.projectStats.total"),
        cell: ({ row }) => (
          <span className="tabular">{row.original.project_total}</span>
        ),
      },
      {
        accessorKey: "project_active",
        meta: { label: t("companies.projectStats.active") },
        header: () => t("companies.projectStats.active"),
        cell: ({ row }) => (
          <span className="tabular">{row.original.project_active}</span>
        ),
      },
      {
        accessorKey: "project_completed",
        meta: { label: t("companies.projectStats.completed") },
        header: () => t("companies.projectStats.completed"),
        cell: ({ row }) => (
          <span className="tabular">{row.original.project_completed}</span>
        ),
      },
      {
        accessorKey: "project_archived",
        meta: { label: t("companies.projectStats.archived") },
        header: () => t("companies.projectStats.archived"),
        cell: ({ row }) => (
          <span className="tabular">{row.original.project_archived}</span>
        ),
      },
      {
        accessorKey: "subscription_expires_on",
        meta: { label: t("companies.field.subscriptionExpiresOn") },
        header: () => t("companies.field.subscriptionExpiresOn"),
        cell: ({ row }) =>
          row.original.subscription_expires_on
            ? df.date(row.original.subscription_expires_on)
            : t("companies.noSubscriptionExpiry"),
      },
      {
        accessorKey: "subscription_months",
        meta: { label: t("companies.field.subscriptionMonths") },
        header: () => t("companies.field.subscriptionMonths"),
        cell: ({ row }) =>
          row.original.subscription_months
            ? t("companies.subscriptionPeriod", {
                months: row.original.subscription_months,
              })
            : t("common.emptyValue"),
      },
      {
        accessorKey: "remaining_user_seats",
        meta: { label: t("companies.field.remainingUserSeats") },
        header: () => t("companies.field.remainingUserSeats"),
        cell: ({ row }) =>
          row.original.remaining_user_seats === null ? (
            t("companies.unlimitedUsers")
          ) : (
            <span className="tabular">{row.original.remaining_user_seats}</span>
          ),
      },
      {
        id: "recycler_service_contractors",
        meta: { label: t("companies.recyclerStats.serviceContractors") },
        header: () => t("companies.recyclerStats.serviceContractors"),
        cell: ({ row }) => (
          <span className="tabular">
            {row.original.recycler_statistics?.service_contractors ?? "-"}
          </span>
        ),
      },
      {
        id: "recycler_platform_weight",
        meta: { label: t("companies.recyclerStats.platformWeight") },
        header: () => t("companies.recyclerStats.platformWeight"),
        cell: ({ row }) =>
          row.original.recycler_statistics
            ? t("companies.weightKg", {
                value: Number(
                  row.original.recycler_statistics.platform_weight_kg,
                ).toFixed(2),
              })
            : "-",
      },
      {
        id: "recycler_private_weight",
        meta: { label: t("companies.recyclerStats.privateWeight") },
        header: () => t("companies.recyclerStats.privateWeight"),
        cell: ({ row }) =>
          row.original.recycler_statistics
            ? t("companies.weightKg", {
                value: Number(
                  row.original.recycler_statistics.private_weight_kg,
                ).toFixed(2),
              })
            : "-",
      },
      {
        id: "recycler_total_weight",
        meta: { label: t("companies.recyclerStats.totalWeight") },
        header: () => t("companies.recyclerStats.totalWeight"),
        cell: ({ row }) =>
          row.original.recycler_statistics
            ? t("companies.weightKg", {
                value: Number(
                  row.original.recycler_statistics.total_weight_kg,
                ).toFixed(2),
              })
            : "-",
      },
      {
        id: "recycler_commission_status",
        meta: { label: t("companies.recyclerStats.commissionStatus") },
        header: () => t("companies.recyclerStats.commissionStatus"),
        cell: ({ row }) =>
          row.original.recycler_statistics
            ? t(
                `companies.commissionStatus.${row.original.recycler_statistics.commission_status}`,
              )
            : "-",
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => {
          const company = row.original;
          const suspended =
            company.status === "SUSPENDED" || company.status === "CLOSED";
          return (
            <div className="flex items-center justify-end gap-0.5">
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary hover:bg-primary/10"
                title={t("common.view")}
              >
                <Link href={`/companies/${company.id}`}>
                  <Eye className="h-3.5 w-3.5" />
                </Link>
              </Button>

              {can("company.update") && (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-info hover:bg-info/10"
                  title={t("common.edit")}
                >
                  <Link href={`/companies/${company.id}/edit`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}

              {can("company.suspend") &&
                (suspended ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-success hover:bg-success/10"
                    title={t("companies.reinstate.confirm")}
                    onClick={() => setPending({ kind: "reinstate", company })}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-warning hover:bg-warning/10"
                    title={t("companies.suspend.confirm")}
                    onClick={() => setPending({ kind: "suspend", company })}
                  >
                    <Ban className="h-3.5 w-3.5" />
                  </Button>
                ))}

              {can("company.update") && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  title={t("common.remove")}
                  onClick={() => setPending({ kind: "remove", company })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [t, can, df],
  );

  const filterPills = [
    {
      key: "all",
      label: t("companies.filter.all"),
      active:
        !list.filters.type &&
        !list.filters.status &&
        !list.filters.state &&
        !list.filters.plan,
      onSelect: () => {
        list.setFilter("type", undefined);
        list.setFilter("status", undefined);
        list.setFilter("state", undefined);
        list.setFilter("plan", undefined);
      },
    },
    {
      key: "contractors",
      label: t("companies.filter.contractors"),
      active: list.filters.type === "CONTRACTOR",
      onSelect: () => list.setFilter("type", "CONTRACTOR"),
    },
    {
      key: "recyclers",
      label: t("companies.filter.recyclers"),
      active: list.filters.type === "RECYCLER",
      onSelect: () => list.setFilter("type", "RECYCLER"),
    },
    {
      key: "suspended",
      label: t("companies.filter.suspended"),
      active: list.filters.status === "SUSPENDED",
      onSelect: () => list.setFilter("status", "SUSPENDED"),
    },
  ];

  const totalCount =
    section === "statistics" ? (summary.data?.total ?? 0) : (data?.count ?? 0);
  const isPending = removal.isPending || statusChange.isPending;
  const sectionColumnIds = useMemo<Record<CompanyManagementSection, string[]>>(
    () => ({
      directory: [
        "code",
        "name",
        "type",
        "status",
        "state",
        "plan_name",
        "review_status",
        "contact_person",
        "user_count",
        "created_at",
        "actions",
      ],
      review: [
        "code",
        "name",
        "type",
        "review_status",
        "contact_person",
        "created_at",
        "actions",
      ],
      status: [
        "code",
        "name",
        "type",
        "status",
        "subscription_expires_on",
        "review_status",
        "actions",
      ],
      subscriptions: [
        "code",
        "name",
        "type",
        "plan_name",
        "subscription_months",
        "subscription_expires_on",
        "user_count",
        "remaining_user_seats",
        "status",
        "actions",
      ],
      projects: [
        "code",
        "name",
        "status",
        "state",
        "project_total",
        "project_active",
        "project_completed",
        "project_archived",
        "actions",
      ],
      recyclers: [
        "code",
        "name",
        "status",
        "state",
        "plan_name",
        "recycler_service_contractors",
        "recycler_platform_weight",
        "recycler_private_weight",
        "recycler_total_weight",
        "recycler_commission_status",
        "actions",
      ],
      search: [
        "code",
        "name",
        "type",
        "status",
        "state",
        "plan_name",
        "review_status",
        "contact_person",
        "created_at",
        "actions",
      ],
      statistics: [
        "code",
        "name",
        "type",
        "status",
        "project_total",
        "project_active",
        "project_completed",
        "project_archived",
        "user_count",
        "created_at",
        "actions",
      ],
    }),
    [],
  );
  const sectionColumns = useMemo(
    () =>
      columns.filter((column) => {
        const id =
          column.id ??
          ("accessorKey" in column ? String(column.accessorKey) : "");
        return sectionColumnIds[section].includes(id);
      }),
    [columns, section, sectionColumnIds],
  );

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t(`companies.module.${section}.title`)}
        subtitle={
          isLoading
            ? "—"
            : t(`companies.module.${section}.subtitle`, { count: totalCount })
        }
        action={
          can("company.create") && section === "directory" ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href="/companies/create">
                <Plus className="h-4 w-4" />
                {t("companies.new")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      {section === "statistics" && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3 xl:grid-cols-6">
          {(
            [
              "total",
              "contractors",
              "recyclers",
              "active",
              "inactive",
              "newThisMonth",
            ] as const
          ).map((key) => {
            const value =
              key === "contractors"
                ? summary.data?.by_type.CONTRACTOR
                : key === "recyclers"
                  ? summary.data?.by_type.RECYCLER
                  : key === "inactive"
                    ? summary.data?.inactive
                    : key === "newThisMonth"
                      ? summary.data?.new_this_month
                      : summary.data?.[key];
            return (
              <div key={key} className="bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {t(`companies.summary.${key}`)}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {value ?? 0}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {section !== "statistics" && (
        <>
          <div className="flex flex-wrap gap-2">
            <select
              value={list.filters.state ?? ""}
              onChange={(event) =>
                list.setFilter("state", event.target.value || undefined)
              }
              className="h-8 rounded-md border bg-background px-2 text-sm"
              aria-label={t("companies.filter.state")}
            >
              <option value="">{t("companies.filter.allStates")}</option>
              {MALAYSIA_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
            <select
              value={list.filters.plan ?? ""}
              onChange={(event) =>
                list.setFilter("plan", event.target.value || undefined)
              }
              className="h-8 rounded-md border bg-background px-2 text-sm"
              aria-label={t("companies.filter.plan")}
            >
              <option value="">{t("companies.filter.allPlans")}</option>
              {(plans.data?.results ?? []).map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>

          <DataTable
            columns={sectionColumns}
            rows={data?.results ?? []}
            totalCount={totalCount}
            page={list.page}
            pageSize={list.pageSize}
            isLoading={isLoading}
            isError={isError}
            hasFilters={list.hasFilters}
            search={list.search}
            sortBy={list.sortBy}
            sortOrder={list.sortOrder}
            storageKey={`companies-${section}`}
            filterPills={filterPills}
            onSearchChange={list.setSearch}
            onSortChange={list.setSort}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
            onClearFilters={list.clearFilters}
          />
        </>
      )}

      {pending?.kind === "remove" && (
        <ConfirmDialog
          open
          onOpenChange={closeDialog}
          title={t("companies.remove.title", { name: pending.company.name })}
          description={t("companies.remove.description")}
          confirmLabel={t("companies.remove.confirm")}
          isPending={isPending}
          onConfirm={() => removal.mutate(pending.company.id)}
        />
      )}

      {pending?.kind === "suspend" && (
        <ConfirmDialog
          open
          onOpenChange={closeDialog}
          title={t("companies.suspend.title", { name: pending.company.name })}
          description={t("companies.suspend.description")}
          confirmLabel={t("companies.suspend.confirm")}
          isPending={isPending}
          reason={reason}
          onReasonChange={setReason}
          reasonRequired
          onConfirm={() =>
            statusChange.mutate({
              id: pending.company.id,
              status: "SUSPENDED",
            })
          }
        />
      )}

      {pending?.kind === "reinstate" && (
        <ConfirmDialog
          open
          onOpenChange={closeDialog}
          variant="default"
          title={t("companies.reinstate.title", { name: pending.company.name })}
          description={t("companies.reinstate.description")}
          confirmLabel={t("companies.reinstate.confirm")}
          isPending={isPending}
          onConfirm={() =>
            statusChange.mutate({ id: pending.company.id, status: "ACTIVE" })
          }
        />
      )}
    </div>
  );
}
