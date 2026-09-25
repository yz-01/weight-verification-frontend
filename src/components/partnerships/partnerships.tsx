"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  BadgeCheck,
  Ban,
  FolderCog,
  Handshake,
  Link2,
  Loader2,
  Plus,
  Unlink,
  X,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  FieldWrapper,
  ListHeader,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListQuery } from "@/hooks/use-list-query";
import { useDebounce } from "@/hooks/use-debounce";
import type {
  CompanyPartnership,
  PartnershipProjectBinding,
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

const STATUS_TONE: Record<
  PartnershipStatus,
  "positive" | "warning" | "danger" | "neutral"
> = {
  PENDING: "warning",
  ACTIVE: "positive",
  REJECTED: "danger",
  SUSPENDED: "neutral",
};

type ResponseDecision = {
  partnership: CompanyPartnership;
  status: "ACTIVE" | "REJECTED";
};

export function Partnerships() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery(["status"]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [response, setResponse] = useState<ResponseDecision | null>(null);
  const [suspending, setSuspending] = useState<CompanyPartnership | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["partnerships", list.query],
    queryFn: () => getPartnerships(list.query),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["partnerships"] });
  };

  function closeAction() {
    setResponse(null);
    setSuspending(null);
    setNote("");
  }

  const responseMutation = useMutation({
    mutationFn: ({ partnership, status }: ResponseDecision) =>
      respondPartnership(partnership.id, { status, note: note.trim() }),
    onSuccess: () => {
      refresh();
      closeAction();
    },
  });

  const suspensionMutation = useMutation({
    mutationFn: (partnership: CompanyPartnership) =>
      suspendPartnership(partnership.id, note.trim()),
    onSuccess: () => {
      refresh();
      closeAction();
    },
  });

  const canManage = can("partnership.manage");
  const currentCompanyId = user?.company ?? null;
  const columns = useMemo<ColumnDef<CompanyPartnership, unknown>[]>(
    () => [
      {
        accessorKey: "contractor_name",
        meta: { label: t("partnerships.field.contractor") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("partnerships.field.contractor")}
          </span>
        ),
        cell: ({ row }) => (
          <CompanyIdentity
            name={row.original.contractor_name}
            code={row.original.contractor_code}
          />
        ),
      },
      {
        accessorKey: "recycler_name",
        meta: { label: t("partnerships.field.recycler") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("partnerships.field.recycler")}
          </span>
        ),
        cell: ({ row }) => (
          <CompanyIdentity
            name={row.original.recycler_name}
            code={row.original.recycler_code}
          />
        ),
      },
      {
        accessorKey: "status",
        meta: { label: t("partnerships.field.status") },
        header: ({ column }) => (
          <SortableHeader
            label={t("partnerships.field.status")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`partnerships.status.${row.original.status}`)}
            tone={STATUS_TONE[row.original.status]}
          />
        ),
      },
      {
        accessorKey: "requested_by_company_name",
        meta: { label: t("partnerships.field.requestedBy") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("partnerships.field.requestedBy")}
          </span>
        ),
        cell: ({ row }) => (
          <span className="block max-w-[180px] truncate">
            {row.original.requested_by_company_name}
          </span>
        ),
      },
      {
        id: "projects",
        meta: { label: t("partnerships.field.projects") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("partnerships.field.projects")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <TypeBadge label={String(row.original.project_bindings.length)} />
            {row.original.project_bindings[0] && (
              <span
                className="max-w-[150px] truncate text-xs text-muted-foreground"
                title={row.original.project_bindings
                  .map((binding) => binding.project_name)
                  .join(", ")}
              >
                {row.original.project_bindings[0].project_name}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "response_note",
        meta: { label: t("partnerships.field.note") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("partnerships.field.note")}
          </span>
        ),
        cell: ({ row }) => (
          <span
            className="block max-w-[200px] truncate text-muted-foreground"
            title={row.original.response_note}
          >
            {row.original.response_note || t("common.emptyValue")}
          </span>
        ),
      },
      {
        accessorKey: "updated_at",
        meta: { label: t("partnerships.field.updatedAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("partnerships.field.updatedAt")}
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
          const canRespond =
            canManage &&
            partnership.status === "PENDING" &&
            currentCompanyId !== null &&
            partnership.requested_by_company !== currentCompanyId;

          return (
            <div className="flex items-center justify-end gap-0.5">
              {canRespond && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-success hover:bg-success/10"
                    title={t("partnerships.respond.accept")}
                    onClick={() =>
                      setResponse({ partnership, status: "ACTIVE" })
                    }
                  >
                    <BadgeCheck className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                    title={t("partnerships.respond.reject")}
                    onClick={() =>
                      setResponse({ partnership, status: "REJECTED" })
                    }
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}

              {partnership.status === "ACTIVE" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-info hover:bg-info/10"
                  title={t("partnerships.projects.manage")}
                  onClick={() => setManagingId(partnership.id)}
                >
                  <FolderCog className="h-3.5 w-3.5" />
                </Button>
              )}

              {canManage && partnership.status === "ACTIVE" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-warning hover:bg-warning/10"
                  title={t("partnerships.suspend.confirm")}
                  onClick={() => setSuspending(partnership)}
                >
                  <Ban className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [canManage, currentCompanyId, df, t],
  );

  const totalCount = data?.count ?? 0;
  const activeStatus = list.filters.status ?? "";
  const managing =
    data?.results.find((partnership) => partnership.id === managingId) ?? null;
  const excludedCompanyIds = new Set(
    (data?.results ?? []).map((partnership) =>
      user?.company_type === "RECYCLER"
        ? partnership.contractor
        : partnership.recycler,
    ),
  );

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("partnerships.title")}
        subtitle={
          isLoading
            ? t("common.loading")
            : t("partnerships.count", { count: totalCount })
        }
        action={
          canManage && currentCompanyId ? (
            <Button
              size="sm"
              className="rounded-full px-4 shadow-sm"
              onClick={() => setRequestOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {t("partnerships.request.action")}
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
        storageKey="partnerships"
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active: activeStatus === "",
            onSelect: () => list.setFilter("status", undefined),
          },
          ...(["PENDING", "ACTIVE", "REJECTED", "SUSPENDED"] as const).map(
            (status) => ({
              key: status,
              label: t(`partnerships.status.${status}`),
              active: activeStatus === status,
              onSelect: () => list.setFilter("status", status),
            }),
          ),
        ]}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />

      {requestOpen && (
        <RequestPartnershipDialog
          excludedCompanyIds={excludedCompanyIds}
          onClose={() => setRequestOpen(false)}
          onDone={refresh}
        />
      )}

      {managing && (
        <ManageProjectsDialog
          partnership={managing}
          canManage={canManage}
          onClose={() => setManagingId(null)}
        />
      )}

      {response && (
        <ConfirmDialog
          open
          onOpenChange={closeAction}
          variant={response.status === "ACTIVE" ? "default" : "destructive"}
          title={t(
            response.status === "ACTIVE"
              ? "partnerships.respond.acceptTitle"
              : "partnerships.respond.rejectTitle",
            {
              name:
                user?.company_type === "RECYCLER"
                  ? response.partnership.contractor_name
                  : response.partnership.recycler_name,
            },
          )}
          description={t(
            response.status === "ACTIVE"
              ? "partnerships.respond.acceptDescription"
              : "partnerships.respond.rejectDescription",
          )}
          confirmLabel={t(
            response.status === "ACTIVE"
              ? "partnerships.respond.accept"
              : "partnerships.respond.reject",
          )}
          confirmIcon={response.status === "ACTIVE" ? BadgeCheck : XCircle}
          isPending={responseMutation.isPending}
          reason={note}
          onReasonChange={setNote}
          reasonRequired={response.status === "REJECTED"}
          reasonLabel={t("partnerships.field.note")}
          onConfirm={() => responseMutation.mutate(response)}
        />
      )}

      {suspending && (
        <ConfirmDialog
          open
          onOpenChange={closeAction}
          title={t("partnerships.suspend.title")}
          description={t("partnerships.suspend.description")}
          confirmLabel={t("partnerships.suspend.confirm")}
          confirmIcon={Ban}
          isPending={suspensionMutation.isPending}
          reason={note}
          onReasonChange={setNote}
          reasonRequired
          onConfirm={() => suspensionMutation.mutate(suspending)}
        />
      )}
    </div>
  );
}

function CompanyIdentity({ name, code }: { name: string; code: string }) {
  return (
    <div className="min-w-0">
      <p className="max-w-[210px] truncate font-medium text-foreground" title={name}>
        {name}
      </p>
      <p className="tabular truncate text-xs text-muted-foreground">{code}</p>
    </div>
  );
}

function RequestPartnershipDialog({
  excludedCompanyIds,
  onClose,
  onDone,
}: {
  excludedCompanyIds: Set<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [company, setCompany] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["partnerships", "available-companies", debouncedSearch.trim()],
    queryFn: () =>
      getAvailablePartnerCompanies({
        search: debouncedSearch.trim() || undefined,
      }),
  });

  const options = (data?.results ?? []).filter(
    (option) => !excludedCompanyIds.has(option.id),
  );
  const request = useMutation({
    mutationFn: () => requestPartnership(company),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[520px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{t("partnerships.request.title")}</DialogTitle>
          <DialogDescription>
            {t("partnerships.request.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("common.search")}</Label>
            <Input
              value={search}
              placeholder={t("common.searchPlaceholder")}
              onChange={(event) => {
                setSearch(event.target.value);
                setCompany("");
              }}
            />
          </div>

          <FieldWrapper label={t("partnerships.request.company")} required>
            <Select value={company} onValueChange={setCompany}>
              <SelectTrigger className="w-full bg-card" disabled={isLoading}>
                <SelectValue placeholder={t("common.selectPlaceholder")} />
              </SelectTrigger>
              <SelectContent position="popper">
                {options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name} ({option.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isLoading && !isError && options.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {t("partnerships.request.noCompanies")}
              </p>
            )}
            {isError && (
              <p className="text-xs font-medium text-destructive">
                {t("partnerships.request.loadError")}
              </p>
            )}
          </FieldWrapper>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            disabled={request.isPending}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            className="rounded-full px-4 shadow-sm"
            requires={[[company, t("partnerships.request.company")]]}
            disabled={request.isPending}
            onClick={() => request.mutate()}
          >
            {request.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Handshake className="h-4 w-4" />
            )}
            {t("partnerships.request.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageProjectsDialog({
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
  const [project, setProject] = useState("");
  const [removing, setRemoving] = useState<PartnershipProjectBinding | null>(
    null,
  );
  const [reason, setReason] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["partnerships", partnership.id, "available-projects"],
    queryFn: () => getAvailablePartnerProjects(partnership.id),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["partnerships"] });
  };

  const binding = useMutation({
    mutationFn: () => bindPartnershipProject(partnership.id, project),
    onSuccess: () => {
      setProject("");
      refresh();
    },
  });

  const unbinding = useMutation({
    mutationFn: (target: PartnershipProjectBinding) =>
      unbindPartnershipProject(partnership.id, target.id, reason.trim()),
    onSuccess: () => {
      setRemoving(null);
      setReason("");
      refresh();
    },
  });

  const boundProjectIds = new Set(
    partnership.project_bindings.map((item) => item.project),
  );
  const availableProjects = (data?.results ?? []).filter(
    (option) => !boundProjectIds.has(option.id),
  );

  return (
    <>
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="max-h-[90dvh] overflow-hidden sm:max-w-[680px] [&>button]:hidden">
          <DialogHeader>
            <DialogTitle>{t("partnerships.projects.title")}</DialogTitle>
            <DialogDescription>
              {t("partnerships.projects.description", {
                contractor: partnership.contractor_name,
                recycler: partnership.recycler_name,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {t("partnerships.projects.bound")}
                </h3>
                <TypeBadge
                  label={String(partnership.project_bindings.length)}
                />
              </div>

              {partnership.project_bindings.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  {t("partnerships.projects.noneBound")}
                </p>
              ) : (
                <div className="divide-y rounded-md border">
                  {partnership.project_bindings.map((item) => (
                    <div
                      key={item.id}
                      className="flex min-h-14 items-center justify-between gap-3 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {item.project_name}
                        </p>
                        <p className="tabular truncate text-xs text-muted-foreground">
                          {item.project_code} - {t(`projects.status.${item.project_status}`)}
                        </p>
                      </div>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10"
                          title={t("partnerships.projects.unbind")}
                          onClick={() => setRemoving(item)}
                        >
                          <Unlink className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {canManage && (
              <section className="space-y-2 border-t pt-5">
                <Label>{t("partnerships.projects.add")}</Label>
                {isError ? (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                    <p className="text-sm text-destructive">
                      {t("partnerships.projects.loadError")}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void refetch()}
                    >
                      {t("common.retry")}
                    </Button>
                  </div>
                ) : (
                  <FieldWrapper label={t("partnerships.projects.project")} required>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Select value={project} onValueChange={setProject}>
                        <SelectTrigger
                          className="w-full bg-card"
                          disabled={isLoading || availableProjects.length === 0}
                        >
                          <SelectValue
                            placeholder={
                              isLoading
                                ? t("common.loading")
                                : t("common.selectPlaceholder")
                            }
                          />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {availableProjects.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.name} ({option.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        className="shrink-0"
                        requires={[[project, t("partnerships.projects.project")]]}
                        disabled={binding.isPending}
                        onClick={() => binding.mutate()}
                      >
                        {binding.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Link2 className="h-4 w-4" />
                        )}
                        {t("partnerships.projects.bind")}
                      </Button>
                    </div>
                  </FieldWrapper>
                )}
                {!isLoading && !isError && availableProjects.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("partnerships.projects.noneAvailable")}
                  </p>
                )}
              </section>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full px-4"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {removing && (
        <ConfirmDialog
          open
          onOpenChange={() => {
            setRemoving(null);
            setReason("");
          }}
          title={t("partnerships.projects.unbindTitle", {
            name: removing.project_name,
          })}
          description={t("partnerships.projects.unbindDescription")}
          confirmLabel={t("partnerships.projects.unbind")}
          confirmIcon={Unlink}
          isPending={unbinding.isPending}
          reason={reason}
          onReasonChange={setReason}
          onConfirm={() => unbinding.mutate(removing)}
        />
      )}
    </>
  );
}
