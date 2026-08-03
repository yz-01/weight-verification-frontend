"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { BadgeCheck, Eye, Plus, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  ListHeader,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/hooks/use-list-query";
import type {
  CompanyReviewStatus,
  CompanyRow,
  CompanyStatus,
} from "@/interfaces/company";
import { useDateFormat } from "@/lib/dates";
import { getCompanies, reviewCompany } from "@/services/companies.service";

const COMPANY_STATUS_TONE: Record<
  CompanyStatus,
  "positive" | "info" | "warning" | "danger" | "neutral"
> = {
  ACTIVE: "positive",
  TRIAL: "info",
  OVERDUE: "warning",
  SUSPENDED: "danger",
  CLOSED: "neutral",
};

const REVIEW_STATUS_TONE: Record<
  CompanyReviewStatus,
  "positive" | "warning" | "danger"
> = {
  PENDING: "warning",
  APPROVED: "positive",
  REJECTED: "danger",
};

type ReviewDecision = {
  company: CompanyRow;
  status: "APPROVED" | "REJECTED";
};

export function RecyclerReview() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery(["review_status"]);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [note, setNote] = useState("");

  const activeReview = list.filters.review_status ?? "PENDING";
  const query = useMemo(
    () => ({
      ...list.query,
      type: "RECYCLER" as const,
      review_status: activeReview === "ALL" ? undefined : activeReview,
    }),
    [activeReview, list.query],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ["companies", "recycler-review", query],
    queryFn: () => getCompanies(query),
  });

  function closeDecision() {
    setDecision(null);
    setNote("");
  }

  const review = useMutation({
    mutationFn: ({ company, status }: ReviewDecision) =>
      reviewCompany(company.id, { status, note: note.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
      closeDecision();
    },
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
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
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
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p
              className="max-w-[240px] truncate font-medium text-foreground"
              title={row.original.name}
            >
              {row.original.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {[row.original.city, row.original.state]
                .filter(Boolean)
                .join(", ") || t("common.emptyValue")}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "review_status",
        meta: { label: t("recyclerReview.field.reviewStatus") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("recyclerReview.field.reviewStatus")}
          </span>
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`recyclerReview.status.${row.original.review_status}`)}
            tone={REVIEW_STATUS_TONE[row.original.review_status]}
          />
        ),
      },
      {
        accessorKey: "status",
        meta: { label: t("companies.field.status") },
        header: ({ column }) => (
          <SortableHeader
            label={t("companies.field.status")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`companies.status.${row.original.status}`)}
            tone={COMPANY_STATUS_TONE[row.original.status]}
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
              <p className="max-w-[220px] truncate text-xs text-muted-foreground">
                {row.original.contact_email}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "created_at",
        meta: { label: t("companies.field.createdAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("companies.field.createdAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {df.date(row.original.created_at)}
          </span>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary hover:bg-primary/10"
              title={t("common.view")}
            >
              <Link href={`/companies/${row.original.id}`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
            {can("company.review") &&
              row.original.review_status !== "APPROVED" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-success hover:bg-success/10"
                  title={t("recyclerReview.approve.confirm")}
                  onClick={() =>
                    setDecision({ company: row.original, status: "APPROVED" })
                  }
                >
                  <BadgeCheck className="h-3.5 w-3.5" />
                </Button>
              )}
            {can("company.review") &&
              row.original.review_status !== "REJECTED" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  title={t("recyclerReview.reject.confirm")}
                  onClick={() =>
                    setDecision({ company: row.original, status: "REJECTED" })
                  }
                >
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              )}
          </div>
        ),
      },
    ],
    [can, df, t],
  );

  const totalCount = data?.count ?? 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("recyclerReview.title")}
        subtitle={
          isLoading
            ? t("common.loading")
            : t("recyclerReview.count", { count: totalCount })
        }
        action={
          can("company.create") ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href="/companies/create?type=RECYCLER">
                <Plus className="h-4 w-4" />
                {t("recyclerReview.new")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
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
        storageKey="recycler-review"
        filterPills={[
          ...(["PENDING", "APPROVED", "REJECTED"] as const).map((status) => ({
            key: status,
            label: t(`recyclerReview.status.${status}`),
            active: activeReview === status,
            onSelect: () => list.setFilter("review_status", status),
          })),
          {
            key: "ALL",
            label: t("common.all"),
            active: activeReview === "ALL",
            onSelect: () => list.setFilter("review_status", "ALL"),
          },
        ]}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />

      {decision && (
        <ConfirmDialog
          open
          onOpenChange={closeDecision}
          variant={decision.status === "APPROVED" ? "default" : "destructive"}
          title={t(
            decision.status === "APPROVED"
              ? "recyclerReview.approve.title"
              : "recyclerReview.reject.title",
            { name: decision.company.name },
          )}
          description={t(
            decision.status === "APPROVED"
              ? "recyclerReview.approve.description"
              : "recyclerReview.reject.description",
          )}
          confirmLabel={t(
            decision.status === "APPROVED"
              ? "recyclerReview.approve.confirm"
              : "recyclerReview.reject.confirm",
          )}
          confirmIcon={decision.status === "APPROVED" ? BadgeCheck : XCircle}
          isPending={review.isPending}
          reason={note}
          onReasonChange={setNote}
          reasonRequired={decision.status === "REJECTED"}
          reasonLabel={t("recyclerReview.field.note")}
          onConfirm={() => review.mutate(decision)}
        />
      )}
    </div>
  );
}
