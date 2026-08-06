"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CalendarPlus,
  CirclePause,
  CirclePlay,
  EllipsisVertical,
  Filter,
  SlidersHorizontal,
  SquarePen,
  UserRoundCog,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import { StatusBadge, TypeBadge } from "@/components/shared/page-primitives";
import {
  SubscriptionActionDialog,
  type SubscriptionActionMode,
} from "@/components/subscriptions/subscription-action-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useListQuery } from "@/hooks/use-list-query";
import type {
  CompanySubscription,
  SubscriptionState,
} from "@/interfaces/subscription";
import { useDateFormat } from "@/lib/dates";
import {
  exportSubscriptions,
  getSubscriptionPlans,
  getSubscriptions,
} from "@/services/subscription.service";

const FILTER_KEYS = ["state", "company_type", "plan", "expires_after", "expires_before"];
const STATES: SubscriptionState[] = [
  "NOT_STARTED",
  "ACTIVE",
  "EXPIRING_SOON",
  "EXPIRED",
  "PAUSED",
];
const TONES: Record<SubscriptionState, "positive" | "warning" | "danger" | "neutral" | "info"> = {
  NOT_STARTED: "neutral",
  ACTIVE: "positive",
  EXPIRING_SOON: "warning",
  EXPIRED: "danger",
  PAUSED: "info",
};

export function CompanySubscriptions() {
  const t = useTranslations("subscriptions");
  const common = useTranslations("common");
  const df = useDateFormat();
  const { can } = useAuth();
  const list = useListQuery(FILTER_KEYS);
  const [selected, setSelected] = useState<CompanySubscription | null>(null);
  const [action, setAction] = useState<SubscriptionActionMode>("plan");

  const subscriptions = useQuery({
    queryKey: ["subscriptions", "list", list.query],
    queryFn: () => getSubscriptions(list.query),
  });
  const plans = useQuery({
    queryKey: ["subscription-plans", "options"],
    queryFn: () => getSubscriptionPlans({ page_size: 100, sort_by: "sort_order" }),
  });

  function openAction(row: CompanySubscription, mode: SubscriptionActionMode) {
    setSelected(row);
    setAction(mode);
  }

  const columns = useMemo<ColumnDef<CompanySubscription, unknown>[]>(() => {
    const result: ColumnDef<CompanySubscription, unknown>[] = [
      {
        accessorKey: "company_code",
        meta: { label: t("field.code") },
        header: ({ column }) => <SortableHeader label={t("field.code")} isSorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.company_code}</span>,
      },
      {
        accessorKey: "company_name",
        meta: { label: t("field.company") },
        header: ({ column }) => <SortableHeader label={t("field.company")} isSorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
        cell: ({ row }) => <span className="block max-w-56 truncate font-medium" title={row.original.company_name}>{row.original.company_name}</span>,
      },
      {
        accessorKey: "company_type",
        meta: { label: t("field.audience") },
        header: () => t("field.audience"),
        cell: ({ row }) => <TypeBadge label={t(`audience.${row.original.company_type}`)} />,
      },
      {
        accessorKey: "plan_name",
        meta: { label: t("field.plan") },
        header: () => t("field.plan"),
        cell: ({ row }) => row.original.plan_name ? (
          <div><p className="font-medium">{row.original.plan_name}</p><p className="text-xs text-muted-foreground">{row.original.plan_code}</p></div>
        ) : <span className="text-muted-foreground">{common("emptyValue")}</span>,
      },
      {
        accessorKey: "subscription_state",
        meta: { label: t("field.state") },
        header: () => t("field.state"),
        cell: ({ row }) => <StatusBadge label={t(`state.${row.original.subscription_state}`)} tone={TONES[row.original.subscription_state]} />,
      },
      {
        accessorKey: "subscription_started_on",
        meta: { label: t("field.startsOn") },
        header: ({ column }) => <SortableHeader label={t("field.startsOn")} isSorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.subscription_started_on ? df.date(row.original.subscription_started_on) : common("emptyValue")}</span>,
      },
      {
        accessorKey: "subscription_expires_on",
        meta: { label: t("field.expiresOn") },
        header: ({ column }) => <SortableHeader label={t("field.expiresOn")} isSorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
        cell: ({ row }) => (
          <div className="tabular-nums"><p>{row.original.subscription_expires_on ? df.date(row.original.subscription_expires_on) : common("emptyValue")}</p>{row.original.days_to_expiry !== null && <p className="text-xs text-muted-foreground">{t("daysRemaining", { count: row.original.days_to_expiry })}</p>}</div>
        ),
      },
      {
        id: "seats",
        meta: { label: t("field.seats") },
        header: () => t("field.seats"),
        cell: ({ row }) => <span className="tabular-nums">{t("seatUsage", { used: row.original.used_user_seats, limit: row.original.user_limit ?? t("value.unlimited") })}</span>,
      },
    ];
    if (can("subscription.manage")) {
      result.push({
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{common("actions")}</span>,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" title={common("actions")}><EllipsisVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => openAction(row.original, "plan")}><SquarePen className="h-4 w-4" />{t("action.plan.menu")}</DropdownMenuItem>
              {row.original.plan && <DropdownMenuItem onSelect={() => openAction(row.original, "extend")}><CalendarPlus className="h-4 w-4" />{t("action.extend.menu")}</DropdownMenuItem>}
              {row.original.plan && <DropdownMenuItem onSelect={() => openAction(row.original, "seats")}><UserRoundCog className="h-4 w-4" />{t("action.seats.menu")}</DropdownMenuItem>}
              <DropdownMenuSeparator />
              {row.original.subscription_state === "PAUSED" ? (
                <DropdownMenuItem onSelect={() => openAction(row.original, "resume")}><CirclePlay className="h-4 w-4" />{t("action.resume.menu")}</DropdownMenuItem>
              ) : row.original.subscription_state !== "EXPIRED" && row.original.subscription_state !== "NOT_STARTED" ? (
                <DropdownMenuItem onSelect={() => openAction(row.original, "pause")}><CirclePause className="h-4 w-4" />{t("action.pause.menu")}</DropdownMenuItem>
              ) : null}
              {row.original.subscription_state !== "EXPIRED" && row.original.subscription_state !== "NOT_STARTED" && (
                <DropdownMenuItem className="text-destructive" onSelect={() => openAction(row.original, "terminate")}><CirclePause className="h-4 w-4" />{t("action.terminate.menu")}</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      });
    }
    return result;
  }, [can, common, df, t]);

  const rows = subscriptions.data?.results ?? [];
  const totalCount = subscriptions.data?.count ?? 0;
  const planRows = plans.data?.results ?? [];
  const extraFilterCount = ["company_type", "plan", "expires_after", "expires_before"].filter((key) => list.filters[key]).length;

  async function runExport(format: "xlsx" | "pdf") {
    await exportSubscriptions({
      format,
      title: t("export.title"),
      subtitle: t("export.subtitle"),
      emptyLabel: common("emptyValue"),
      query: list.query,
      columns: [
        { key: "company_code", label: t("field.code") },
        { key: "company_name", label: t("field.company") },
        { key: "company_type", label: t("field.audience"), values: { CONTRACTOR: t("audience.CONTRACTOR"), RECYCLER: t("audience.RECYCLER") } },
        { key: "plan_name", label: t("field.plan") },
        { key: "subscription_state", label: t("field.state"), values: Object.fromEntries(STATES.map((state) => [state, t(`state.${state}`)])) },
        { key: "subscription_started_on", label: t("field.startsOn") },
        { key: "subscription_expires_on", label: t("field.expiresOn") },
        { key: "user_limit", label: t("field.userLimit") },
        { key: "used_user_seats", label: t("field.usedSeats") },
      ],
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DataTable
        columns={columns}
        rows={rows}
        totalCount={totalCount}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={subscriptions.isLoading}
        isError={subscriptions.isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey="admin-subscriptions"
        filterPills={[
          { key: "ALL", label: common("all"), active: !list.filters.state, onSelect: () => list.setFilter("state", undefined) },
          ...STATES.map((state) => ({ key: state, label: t(`state.${state}`), active: list.filters.state === state, onSelect: () => list.setFilter("state", state) })),
        ]}
        toolbarActions={
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 rounded-full bg-card px-4">
                  <Filter className="h-4 w-4" />
                  {t("filters.title")}{extraFilterCount > 0 && <span className="tabular-nums">({extraFilterCount})</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 space-y-3">
                <FilterSelect label={t("field.audience")} value={list.filters.company_type ?? ""} onChange={(value) => list.setFilter("company_type", value || undefined)} options={[{ value: "", label: common("all") }, { value: "CONTRACTOR", label: t("audience.CONTRACTOR") }, { value: "RECYCLER", label: t("audience.RECYCLER") }]} />
                <FilterSelect label={t("field.plan")} value={list.filters.plan ?? ""} onChange={(value) => list.setFilter("plan", value || undefined)} options={[{ value: "", label: common("all") }, ...planRows.map((plan) => ({ value: plan.id, label: plan.name }))]} />
                <label className="block space-y-1 text-xs font-medium"><span>{t("filters.expiresAfter")}</span><Input type="date" value={list.filters.expires_after ?? ""} onChange={(event) => list.setFilter("expires_after", event.target.value || undefined)} /></label>
                <label className="block space-y-1 text-xs font-medium"><span>{t("filters.expiresBefore")}</span><Input type="date" value={list.filters.expires_before ?? ""} onChange={(event) => list.setFilter("expires_before", event.target.value || undefined)} /></label>
                <Button variant="ghost" size="sm" className="w-full" onClick={list.clearFilters}><SlidersHorizontal className="h-4 w-4" />{t("filters.clear")}</Button>
              </PopoverContent>
            </Popover>
            <ExportButton onExport={runExport} disabled={totalCount === 0} />
          </>
        }
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />

      <SubscriptionActionDialog
        key={`${selected?.id ?? "none"}-${action}`}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        mode={action}
        subscription={selected}
        plans={planRows}
      />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="block space-y-1 text-xs font-medium">
      <span>{label}</span>
      <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value || "ALL"} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
