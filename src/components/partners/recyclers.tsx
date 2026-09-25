"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Check,
  FolderCog,
  Link2,
  Loader2,
  PauseCircle,
  Plus,
  Unlink,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  FieldWrapper,
  ListHeader,
  QueryFailedNote,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";
import { useListQuery } from "@/hooks/use-list-query";
import type {
  CompanyPartnership,
  PartnershipStatus,
} from "@/interfaces/partnership";
import { useDateFormat } from "@/lib/dates";
import {
  bindPartnershipProject,
  getAvailablePartnerCompanies,
  getAvailablePartnerProjects,
  getPartnerships,
  requestPartnership,
  respondPartnership,
  suspendPartnership,
  unbindPartnershipProject,
} from "@/services/partnership.service";

const STATUSES: PartnershipStatus[] = [
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "REJECTED",
];

const STATUS_TONE: Record<
  PartnershipStatus,
  "info" | "positive" | "warning" | "danger"
> = {
  PENDING: "info",
  ACTIVE: "positive",
  SUSPENDED: "warning",
  REJECTED: "danger",
};

type Confirmation =
  | { kind: "reject"; partnership: CompanyPartnership }
  | { kind: "suspend"; partnership: CompanyPartnership };

export function Recyclers() {
  const t = useTranslations();
  const df = useDateFormat();
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery(["status"]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [projectPartnership, setProjectPartnership] =
    useState<CompanyPartnership | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["partnerships", list.query],
    queryFn: () => getPartnerships(list.query),
  });

  const {
    mutate: acceptPartnership,
    isPending: isAccepting,
  } = useMutation({
    mutationFn: (id: string) => respondPartnership(id, "ACTIVE"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partnerships"] });
    },
  });

  const closeConfirmation = () => {
    setConfirmation(null);
    setReason("");
  };

  const changeStatus = useMutation({
    mutationFn: () => {
      if (!confirmation) throw new Error("Missing partnership action");
      return confirmation.kind === "reject"
        ? respondPartnership(
            confirmation.partnership.id,
            "REJECTED",
            reason.trim(),
          )
        : suspendPartnership(confirmation.partnership.id, reason.trim());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partnerships"] });
      closeConfirmation();
    },
  });

  const columns = useMemo<ColumnDef<CompanyPartnership, unknown>[]>(
    () => [
      {
        accessorKey: "recycler_name",
        meta: { label: t("recyclers.field.recycler") },
        header: () => t("recyclers.field.recycler"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-[240px] truncate font-medium text-foreground">
              {row.original.recycler_name}
            </p>
            <p className="tabular text-xs text-muted-foreground">
              {row.original.recycler_code}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        meta: { label: t("recyclers.field.status") },
        header: ({ column }) => (
          <SortableHeader
            label={t("recyclers.field.status")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`recyclers.status.${row.original.status}`)}
            tone={STATUS_TONE[row.original.status]}
          />
        ),
      },
      {
        id: "request",
        meta: { label: t("recyclers.field.request") },
        header: () => t("recyclers.field.request"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="text-sm">
              {row.original.requested_by_company === user?.company
                ? t("recyclers.request.outgoing")
                : t("recyclers.request.incoming")}
            </p>
            <p className="max-w-[180px] truncate text-xs text-muted-foreground">
              {row.original.requested_by_company_name}
            </p>
          </div>
        ),
      },
      {
        id: "projects",
        meta: { label: t("recyclers.field.projects") },
        header: () => t("recyclers.field.projects"),
        cell: ({ row }) => (
          <div className="flex max-w-[260px] flex-wrap gap-1">
            {row.original.project_bindings.length === 0 ? (
              <span className="text-muted-foreground">
                {t("common.emptyValue")}
              </span>
            ) : (
              row.original.project_bindings.slice(0, 2).map((binding) => (
                <TypeBadge key={binding.id} label={binding.project_code} />
              ))
            )}
            {row.original.project_bindings.length > 2 && (
              <TypeBadge
                label={t("recyclers.projects.more", {
                  count: row.original.project_bindings.length - 2,
                })}
              />
            )}
          </div>
        ),
      },
      {
        accessorKey: "updated_at",
        meta: { label: t("recyclers.field.updatedAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("recyclers.field.updatedAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {df.date(row.original.updated_at)}
          </span>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => {
          const partnership = row.original;
          const incoming = partnership.requested_by_company !== user?.company;
          return (
            <div className="flex items-center justify-end gap-0.5">
              {can("partnership.manage") &&
                partnership.status === "PENDING" &&
                incoming && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-success hover:bg-success/10"
                      title={t("recyclers.action.accept")}
                      disabled={isAccepting}
                      onClick={() => acceptPartnership(partnership.id)}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      title={t("recyclers.action.reject")}
                      onClick={() => setConfirmation({ kind: "reject", partnership })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              {partnership.status === "ACTIVE" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-primary hover:bg-primary/10"
                  title={t("recyclers.action.manageProjects")}
                  onClick={() => setProjectPartnership(partnership)}
                >
                  <FolderCog className="h-3.5 w-3.5" />
                </Button>
              )}
              {can("partnership.manage") && partnership.status === "ACTIVE" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-warning hover:bg-warning/10"
                  title={t("recyclers.action.suspend")}
                  onClick={() => setConfirmation({ kind: "suspend", partnership })}
                >
                  <PauseCircle className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [t, df, user?.company, can, isAccepting, acceptPartnership],
  );

  const total = data?.count ?? 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("recyclers.title")}
        subtitle={isLoading ? t("common.loading") : t("recyclers.count", { count: total })}
        action={
          can("partnership.manage") ? (
            <Button size="sm" onClick={() => setRequestOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("recyclers.request.action")}
            </Button>
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
        rows={data?.results ?? []}
        totalCount={total}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={isLoading}
        isError={isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey="trace-recyclers"
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active: !list.filters.status,
            onSelect: () => list.setFilter("status", undefined),
          },
          ...STATUSES.map((status) => ({
            key: status,
            label: t(`recyclers.status.${status}`),
            active: list.filters.status === status,
            onSelect: () => list.setFilter("status", status),
          })),
        ]}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />

      <RequestRecyclerDialog
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
      />
      {projectPartnership && (
        <PartnershipProjectsDialog
          partnership={projectPartnership}
          canManage={can("partnership.manage")}
          onClose={() => setProjectPartnership(null)}
        />
      )}
      {confirmation && (
        <ConfirmDialog
          open
          onOpenChange={closeConfirmation}
          title={t(`recyclers.${confirmation.kind}.title`)}
          description={t(`recyclers.${confirmation.kind}.description`, {
            name: confirmation.partnership.recycler_name,
          })}
          confirmLabel={t(`recyclers.${confirmation.kind}.confirm`)}
          confirmIcon={confirmation.kind === "reject" ? X : PauseCircle}
          isPending={changeStatus.isPending}
          reason={reason}
          onReasonChange={setReason}
          reasonRequired
          onConfirm={() => changeStatus.mutate()}
        />
      )}
    </div>
  );
}

function RequestRecyclerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [company, setCompany] = useState("");

  const options = useQuery({
    queryKey: ["partnerships", "available-companies", debouncedSearch],
    queryFn: () => getAvailablePartnerCompanies(debouncedSearch),
    enabled: open,
  });
  const request = useMutation({
    mutationFn: () => requestPartnership(company),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partnerships"] });
      setCompany("");
      setSearch("");
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("recyclers.request.title")}</DialogTitle>
          <DialogDescription>{t("recyclers.request.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FieldWrapper label={t("common.search")}>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("recyclers.request.searchPlaceholder")}
            />
          </FieldWrapper>
          <FieldWrapper label={t("recyclers.field.recycler")} required>
            <Select value={company || undefined} onValueChange={setCompany}>
              <SelectTrigger className="w-full" disabled={options.isLoading}>
                <SelectValue placeholder={t("recyclers.request.choose")} />
              </SelectTrigger>
              <SelectContent position="popper">
                {(options.data?.results ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.code} - {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <QueryFailedNote query={options} what={t("recyclers.what.available")} />
          </FieldWrapper>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            requires={[[company, t("recyclers.field.recycler")]]}
            disabled={request.isPending}
            onClick={() => request.mutate()}
          >
            {request.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            {t("recyclers.request.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PartnershipProjectsDialog({
  partnership,
  canManage,
  onClose,
}: {
  partnership: CompanyPartnership;
  canManage: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState(partnership);
  const [project, setProject] = useState("");

  const options = useQuery({
    queryKey: ["partnerships", current.id, "available-projects"],
    queryFn: () => getAvailablePartnerProjects(current.id),
  });
  const bind = useMutation({
    mutationFn: () => bindPartnershipProject(current.id, project),
    onSuccess: (updated) => {
      setCurrent(updated);
      setProject("");
      void queryClient.invalidateQueries({ queryKey: ["partnerships"] });
    },
  });
  const unbind = useMutation({
    mutationFn: (binding: string) =>
      unbindPartnershipProject(current.id, binding),
    onSuccess: (_, binding) => {
      setCurrent((value) => ({
        ...value,
        project_bindings: value.project_bindings.filter(
          (projectBinding) => projectBinding.id !== binding,
        ),
      }));
      void queryClient.invalidateQueries({ queryKey: ["partnerships"] });
    },
  });

  const boundProjects = new Set(
    current.project_bindings.map((binding) => binding.project),
  );
  const available = (options.data?.results ?? []).filter(
    (option) => !boundProjects.has(option.id),
  );

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("recyclers.projects.title")}</DialogTitle>
          <DialogDescription>
            {t("recyclers.projects.description", {
              name: current.recycler_name,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {canManage && (
            <FieldWrapper label={t("recyclers.projects.choose")} required>
              <div className="flex gap-2">
                <Select value={project || undefined} onValueChange={setProject}>
                  <SelectTrigger className="min-w-0 flex-1" disabled={options.isLoading}>
                    <SelectValue placeholder={t("recyclers.projects.choose")} />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {available.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.code} - {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  title={t("recyclers.projects.bind")}
                  requires={[[project, t("recyclers.projects.choose")]]}
                  disabled={bind.isPending}
                  onClick={() => bind.mutate()}
                >
                  {bind.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <QueryFailedNote query={options} what={t("recyclers.what.projects")} />
            </FieldWrapper>
          )}

          <div className="divide-y rounded-md border">
            {current.project_bindings.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {t("recyclers.projects.empty")}
              </p>
            ) : (
              current.project_bindings.map((binding) => (
                <div key={binding.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{binding.project_name}</p>
                    <p className="tabular text-xs text-muted-foreground">
                      {binding.project_code}
                    </p>
                  </div>
                  <StatusBadge
                    label={t(`projects.status.${binding.project_status}`)}
                    tone={binding.project_status === "ACTIVE" ? "positive" : "neutral"}
                  />
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10"
                      title={t("recyclers.projects.unbind")}
                      disabled={unbind.isPending}
                      onClick={() => unbind.mutate(binding.id)}
                    >
                      <Unlink className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
