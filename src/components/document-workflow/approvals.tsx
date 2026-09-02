"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useOrderRealtime } from "@/hooks/use-order-realtime";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CheckCircle2,
  Eye,
  FileCheck2,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  ScanEye,
  Send,
  Undo2,
  Workflow,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { ApprovalWorkflowDialog } from "@/components/document-workflow/approval-workflow-dialog";
import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { AdvancedTechnicalSettings } from "@/components/shared/advanced-technical-settings";
import {
  FieldWrapper,
  ListHeader,
  ReadField,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import { ApiError } from "@/interfaces/api";
import type { CurrentUser, UserRow } from "@/interfaces/auth";
import type { Project } from "@/interfaces/contractor";
import type {
  ApprovalAction,
  ApprovalActionType,
  ApprovalDetail,
  ApprovalPayload,
  ApprovalRecord,
  ApprovalStatus,
} from "@/interfaces/document-workflow";
import { useDateFormat } from "@/lib/dates";
import { getProjects } from "@/services/contractor.service";
import {
  actOnApproval,
  createApproval,
  getApproval,
  getApprovalHistory,
  getApprovals,
  updateApproval,
} from "@/services/document-workflow.service";
import { getRoles, getUsers } from "@/services/users.service";

const STATUS_TONE: Record<
  ApprovalStatus,
  "neutral" | "info" | "warning" | "positive" | "danger"
> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  IN_REVIEW: "warning",
  APPROVED: "positive",
  REJECTED: "danger",
  RETURNED: "warning",
  CLOSED: "neutral",
};

const RESOURCE_TYPES = [
  "document",
  "settlement",
  "deduction",
  "dispatch",
  "receipt",
  "other",
] as const;

/** Stable identity: a fresh array each render would resubscribe forever. */
const REALTIME_KEYS = [["approvals"]];

export function Approvals() {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  // A decision made by somebody else has to land here without a refresh.
  useOrderRealtime(REALTIME_KEYS);
  const { user, can } = useAuth();
  const searchParams = useSearchParams();
  const list = useListQuery(["status", "mine", "resource_type"]);
  const [editing, setEditing] = useState<ApprovalRecord | null | "new">(
    searchParams.get("create") === "1" && can("approval.submit") ? "new" : null,
  );
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [configuringWorkflow, setConfiguringWorkflow] = useState(false);
  const [acting, setActing] = useState<{
    approval: ApprovalRecord;
    action: ApprovalActionType;
  } | null>(null);

  const approvals = useQuery({
    queryKey: ["approvals", list.query],
    queryFn: () => getApprovals(list.query),
  });
  const projects = useQuery({
    queryKey: ["projects", "approval-options"],
    queryFn: () => getProjects({ page_size: 100, sort_by: "name" }),
    enabled: can("project.view"),
  });
  const users = useQuery({
    queryKey: ["users", "approval-reviewer-options"],
    queryFn: () => getUsers({ page_size: 100, status: "ACTIVE", sort_by: "full_name" }),
    enabled: can("user.view") && can("approval.submit"),
  });
  const roles = useQuery({
    queryKey: ["roles", "approval-reviewer-options"],
    queryFn: () => getRoles({ page_size: 100, sort_by: "name" }),
    enabled: can("role.view") && can("approval.submit"),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
  };

  const columns = useMemo<ColumnDef<ApprovalRecord, unknown>[]>(
    () => [
      {
        accessorKey: "approval_no",
        meta: { label: t("approvals.field.number") },
        header: ({ column }) => (
          <SortableHeader
            label={t("approvals.field.number")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="font-medium tabular-nums text-foreground">
            {row.original.approval_no}
          </span>
        ),
      },
      {
        accessorKey: "title",
        meta: { label: t("approvals.field.title") },
        header: ({ column }) => (
          <SortableHeader
            label={t("approvals.field.title")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p
              className="max-w-[270px] truncate font-medium text-foreground"
              title={row.original.title}
            >
              {row.original.title}
            </p>
            <p className="max-w-[270px] truncate text-xs text-muted-foreground">
              {row.original.resource_label || row.original.resource_id}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "resource_type",
        meta: { label: t("approvals.field.resourceType") },
        header: () => t("approvals.field.resourceType"),
        cell: ({ row }) => (
          <TypeBadge label={resourceLabel(row.original.resource_type, t)} />
        ),
      },
      {
        accessorKey: "project_name",
        meta: { label: t("approvals.field.project") },
        header: () => t("approvals.field.project"),
        cell: ({ row }) =>
          row.original.project_name || t("approvals.companyWide"),
      },
      {
        accessorKey: "requested_by_name",
        meta: { label: t("approvals.field.requester") },
        header: () => t("approvals.field.requester"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">{row.original.requested_by_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.assigned_to_name
                ? t("approvals.assignedTo", {
                    name: row.original.assigned_to_name,
                  })
                : t("approvals.unassigned")}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        meta: { label: t("approvals.field.status") },
        header: ({ column }) => (
          <SortableHeader
            label={t("approvals.field.status")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`approvals.status.${row.original.status}`)}
            tone={STATUS_TONE[row.original.status]}
          />
        ),
      },
      {
        accessorKey: "created_at",
        meta: { label: t("approvals.field.createdAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("approvals.field.createdAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground tabular-nums">
            {df.date(row.original.created_at)}
          </span>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => {
          const record = row.original;
          const canEdit =
            can("approval.submit") &&
            record.requested_by === user?.id &&
            (record.status === "DRAFT" || record.status === "RETURNED");
          const actions = availableActions(record, user, can);
          const primary = actions.length === 1 ? actions[0] : null;
          return (
            <div className="flex items-center justify-end gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={t("common.view")}
                onClick={() => setViewingId(record.id)}
              >
                <Eye className="h-4 w-4" />
              </Button>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title={t("common.edit")}
                  onClick={() => setEditing(record)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {primary && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-primary hover:bg-primary/10"
                  title={t(`approvals.action.${primary}`)}
                  onClick={() => setActing({ approval: record, action: primary })}
                >
                  <ApprovalActionIcon action={primary} />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [can, df, t, user],
  );

  const rows = approvals.data?.results ?? [];
  const totalCount = approvals.data?.count ?? 0;
  const reviewerRoleIds = new Set(
    (roles.data?.results ?? [])
      .filter((role) => role.permissions.includes("approval.review"))
      .map((role) => role.id),
  );
  const eligibleReviewers = (users.data?.results ?? []).filter(
    (candidate) =>
      candidate.role !== null && reviewerRoleIds.has(candidate.role),
  );
  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("approvals.title")}
        subtitle={
          approvals.isLoading
            ? t("common.loading")
            : t("approvals.count", { count: totalCount })
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {can("workflow.manage") ? (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full px-4"
                onClick={() => setConfiguringWorkflow(true)}
              >
                <Workflow className="h-4 w-4" />
                {t("approvals.workflow.action")}
              </Button>
            ) : null}
            {can("approval.submit") ? (
              <Button
                size="sm"
                className="rounded-full px-4 shadow-sm"
                onClick={() => setEditing("new")}
              >
                <Plus className="h-4 w-4" />
                {t("approvals.create.action")}
              </Button>
            ) : null}
          </div>
        }
      />

      {configuringWorkflow ? (
        <ApprovalWorkflowDialog
          users={users.data?.results ?? []}
          roles={roles.data?.results ?? []}
          onClose={() => setConfiguringWorkflow(false)}
        />
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        totalCount={totalCount}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={approvals.isLoading}
        isError={approvals.isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey="approvals"
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active: !list.filters.status,
            onSelect: () => list.setFilter("status", undefined),
          },
          ...(
            [
              "DRAFT",
              "SUBMITTED",
              "IN_REVIEW",
              "APPROVED",
              "REJECTED",
              "RETURNED",
              "CLOSED",
            ] as const
          ).map((status) => ({
            key: status,
            label: t(`approvals.status.${status}`),
            active: list.filters.status === status,
            onSelect: () => list.setFilter("status", status),
          })),
        ]}
        toolbarActions={
          <div className="flex items-center gap-2">
            <Select
              value={list.filters.mine ?? "all"}
              onValueChange={(value) =>
                list.setFilter("mine", value === "all" ? undefined : "true")
              }
            >
              <SelectTrigger size="sm" className="h-9 w-[145px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("approvals.scope.all")}</SelectItem>
                <SelectItem value="true">{t("approvals.scope.mine")}</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={list.filters.resource_type ?? "all"}
              onValueChange={(value) =>
                list.setFilter(
                  "resource_type",
                  value === "all" ? undefined : value,
                )
              }
            >
              <SelectTrigger size="sm" className="h-9 w-[155px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("approvals.resource.all")}</SelectItem>
                {RESOURCE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {resourceLabel(type, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />

      {editing && (
        <ApprovalEditorDialog
          approval={editing === "new" ? null : editing}
          projects={projects.data?.results ?? []}
          reviewers={eligibleReviewers}
          showProject={can("project.view")}
          showReviewer={can("user.view") && can("role.view")}
          currentUserId={user?.id ?? ""}
          onClose={() => setEditing(null)}
          onDone={refresh}
        />
      )}

      {viewingId && (
        <ApprovalDetailDialog
          approvalId={viewingId}
          user={user}
          can={can}
          onClose={() => setViewingId(null)}
          onEdit={(record) => {
            setViewingId(null);
            setEditing(record);
          }}
          onAct={(record, action) => {
            setViewingId(null);
            setActing({ approval: record, action });
          }}
        />
      )}

      {acting && (
        <ApprovalActionDialog
          approval={acting.approval}
          action={acting.action}
          onClose={() => setActing(null)}
          onDone={() => {
            refresh();
            setActing(null);
          }}
        />
      )}
    </div>
  );
}

function ApprovalEditorDialog({
  approval,
  projects,
  reviewers,
  showProject,
  showReviewer,
  currentUserId,
  onClose,
  onDone,
}: {
  approval: ApprovalRecord | null;
  projects: Project[];
  reviewers: UserRow[];
  showProject: boolean;
  showReviewer: boolean;
  currentUserId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [resourceType, setResourceType] = useState(approval?.resource_type ?? "document");
  const [resourceId, setResourceId] = useState(approval?.resource_id ?? "");
  const [resourceLabel, setResourceLabel] = useState(approval?.resource_label ?? "");
  const [title, setTitle] = useState(approval?.title ?? "");
  const [description, setDescription] = useState(approval?.description ?? "");
  const [project, setProject] = useState(approval?.project ?? "none");
  const [reviewer, setReviewer] = useState(approval?.assigned_to ?? "none");
  const [metadataText, setMetadataText] = useState(
    JSON.stringify(approval?.metadata ?? {}, null, 2),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: () => {
      let metadata: Record<string, unknown>;
      try {
        const parsed = JSON.parse(metadataText || "{}") as unknown;
        if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
          throw new Error("metadata");
        }
        metadata = parsed as Record<string, unknown>;
      } catch {
        setErrors((current) => ({
          ...current,
          metadata: t("approvals.validation.metadata"),
        }));
        throw new LocalValidationError();
      }

      const payload: ApprovalPayload = {
        resource_type: resourceType.trim(),
        resource_id: resourceId.trim(),
        resource_label: resourceLabel.trim(),
        title: title.trim(),
        description: description.trim(),
        metadata,
        project: showProject ? (project === "none" ? null : project) : undefined,
        assigned_to: showReviewer
          ? reviewer === "none"
            ? null
            : reviewer
          : undefined,
      };
      return approval
        ? updateApproval(approval.id, payload)
        : createApproval(payload);
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (error) => {
      if (error instanceof LocalValidationError) return;
      setErrors(error instanceof ApiError ? error.errors : {});
    },
  });

  const resourceOptions = RESOURCE_TYPES.includes(
    resourceType as (typeof RESOURCE_TYPES)[number],
  )
    ? RESOURCE_TYPES
    : ([...RESOURCE_TYPES, resourceType] as const);
  const reviewerOptions = reviewers.filter(
    (item) => item.id !== currentUserId && item.status === "ACTIVE",
  );

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[760px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>
            {t(approval ? "approvals.edit.title" : "approvals.create.title")}
          </DialogTitle>
          <DialogDescription>
            {t(approval ? "approvals.edit.description" : "approvals.create.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper
            label={t("approvals.field.title")}
            required
            error={errors.title}
            className="sm:col-span-2"
          >
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper
            label={t("approvals.field.resourceType")}
            required
            error={errors.resource_type}
          >
            <Select value={resourceType} onValueChange={setResourceType}>
              <SelectTrigger className="w-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {resourceOptions.map((type) => (
                  <SelectItem key={type} value={type}>
                    {resourceLabelForForm(type, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper
            label={t("approvals.field.resourceId")}
            required
            error={errors.resource_id}
          >
            <Input
              value={resourceId}
              onChange={(event) => setResourceId(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("approvals.field.resourceLabel")}
            optional={t("common.optional")}
            error={errors.resource_label}
          >
            <Input
              value={resourceLabel}
              onChange={(event) => setResourceLabel(event.target.value)}
            />
          </FieldWrapper>
          {showProject && (
            <FieldWrapper
              label={t("approvals.field.project")}
              optional={t("common.optional")}
              error={errors.project}
            >
              <Select
                value={project}
                onValueChange={setProject}
                disabled={approval !== null}
              >
                <SelectTrigger className="w-full bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("approvals.companyWide")}</SelectItem>
                  {projects.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ({item.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
          )}
          {showReviewer && (
            <FieldWrapper
              label={t("approvals.field.reviewer")}
              optional={t("common.optional")}
              error={errors.assigned_to}
              hint={t("approvals.reviewerHint")}
              className="sm:col-span-2"
            >
              <Select value={reviewer} onValueChange={setReviewer}>
                <SelectTrigger className="w-full bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("approvals.anyReviewer")}</SelectItem>
                  {reviewerOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.full_name} - {item.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
          )}
          <FieldWrapper
            label={t("approvals.field.description")}
            optional={t("common.optional")}
            error={errors.description}
            className="sm:col-span-2"
          >
            <Textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FieldWrapper>
          <AdvancedTechnicalSettings>
            <FieldWrapper
              label={t("approvals.field.metadata")}
              optional={t("common.optional")}
              error={errors.metadata}
              hint={t("approvals.metadataHint")}
              className="sm:col-span-2"
            >
              <Textarea
                rows={5}
                className="font-mono text-xs"
                spellCheck={false}
                value={metadataText}
                onChange={(event) => setMetadataText(event.target.value)}
              />
            </FieldWrapper>
          </AdvancedTechnicalSettings>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            className="rounded-full px-4 shadow-sm"
            disabled={
              !title.trim() ||
              !resourceType.trim() ||
              !resourceId.trim() ||
              mutation.isPending
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : approval ? (
              <Pencil className="h-4 w-4" />
            ) : (
              <FileCheck2 className="h-4 w-4" />
            )}
            {t(approval ? "common.save" : "common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApprovalDetailDialog({
  approvalId,
  user,
  can,
  onClose,
  onEdit,
  onAct,
}: {
  approvalId: string;
  user: CurrentUser | null;
  can: (code: string) => boolean;
  onClose: () => void;
  onEdit: (approval: ApprovalRecord) => void;
  onAct: (approval: ApprovalRecord, action: ApprovalActionType) => void;
}) {
  const t = useTranslations();
  const detail = useQuery({
    queryKey: ["approvals", "detail", approvalId],
    queryFn: () => getApproval(approvalId),
  });
  const history = useQuery({
    queryKey: ["approvals", "history", approvalId],
    queryFn: () => getApprovalHistory(approvalId),
  });
  const record = detail.data;
  const actions = record ? availableActions(record, user, can) : [];
  const canEdit =
    Boolean(record) &&
    can("approval.submit") &&
    record?.requested_by === user?.id &&
    (record?.status === "DRAFT" || record?.status === "RETURNED");

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[980px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{t("approvals.detail.title")}</DialogTitle>
          <DialogDescription>
            {record?.approval_no ?? t("common.loading")}
          </DialogDescription>
        </DialogHeader>

        {detail.isError ? (
          <p className="py-10 text-center text-sm text-destructive">
            {t("table.errorBody")}
          </p>
        ) : !record ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("common.loading")}
          </p>
        ) : (
          <ApprovalDetailBody
            approval={record}
            history={history.data?.results ?? record.actions}
            isHistoryLoading={history.isLoading}
          />
        )}

        <DialogFooter className="flex-wrap gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            {t("common.close")}
          </Button>
          {record && canEdit && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full px-4"
              onClick={() => onEdit(record)}
            >
              <Pencil className="h-4 w-4" />
              {t("common.edit")}
            </Button>
          )}
          {record &&
            actions.map((action) => (
              <Button
                key={action}
                variant={
                  action === "REJECT" ? "destructive" : "default"
                }
                size="sm"
                className="rounded-full px-4"
                onClick={() => onAct(record, action)}
              >
                <ApprovalActionIcon action={action} />
                {t(`approvals.action.${action}`)}
              </Button>
            ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApprovalDetailBody({
  approval,
  history,
  isHistoryLoading,
}: {
  approval: ApprovalDetail;
  history: ApprovalAction[];
  isHistoryLoading: boolean;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ReadField label={t("approvals.field.title")} value={approval.title} />
        <ReadField
          label={t("approvals.field.status")}
          value={
            <StatusBadge
              label={t(`approvals.status.${approval.status}`)}
              tone={STATUS_TONE[approval.status]}
            />
          }
        />
        <ReadField
          label={t("approvals.field.project")}
          value={approval.project_name ?? t("approvals.companyWide")}
        />
        <ReadField
          label={t("approvals.field.resourceType")}
          value={resourceLabel(approval.resource_type, t)}
        />
        <ReadField label={t("approvals.field.resourceId")} value={approval.resource_id} />
        <ReadField
          label={t("approvals.field.resourceLabel")}
          value={approval.resource_label}
        />
        <ReadField
          label={t("approvals.field.requester")}
          value={approval.requested_by_name}
        />
        <ReadField
          label={t("approvals.field.reviewer")}
          value={approval.assigned_to_name ?? t("approvals.anyReviewer")}
        />
        <ReadField
          label={t("approvals.field.createdAt")}
          value={df.dateTime(approval.created_at)}
        />
        {approval.description && (
          <ReadField
            label={t("approvals.field.description")}
            value={approval.description}
            className="sm:col-span-2 lg:col-span-3"
          />
        )}
        {Object.keys(approval.metadata).length > 0 && (
          <div className="sm:col-span-2 lg:col-span-3">
            <AdvancedTechnicalSettings>
              <ReadField
                label={t("approvals.field.metadata")}
                value={
                  <pre className="max-h-40 w-full overflow-auto whitespace-pre-wrap font-mono text-xs">
                    {JSON.stringify(approval.metadata, null, 2)}
                  </pre>
                }
                className="sm:col-span-2"
              />
            </AdvancedTechnicalSettings>
          </div>
        )}
      </div>

      <section className="space-y-2 border-t pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">
            {t("approvals.history.title")}
          </h3>
          <TypeBadge label={String(history.length)} />
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("approvals.history.sequence")}</TableHead>
                <TableHead>{t("approvals.history.action")}</TableHead>
                <TableHead>{t("approvals.history.transition")}</TableHead>
                <TableHead>{t("approvals.history.actor")}</TableHead>
                <TableHead>{t("approvals.history.comment")}</TableHead>
                <TableHead>{t("approvals.history.time")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isHistoryLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              ) : history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {t("approvals.history.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                history.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium tabular-nums">
                      #{entry.sequence}
                    </TableCell>
                    <TableCell>
                      <TypeBadge label={t(`approvals.action.${entry.action}`)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <StatusBadge
                          label={t(`approvals.status.${entry.from_status}`)}
                          tone={STATUS_TONE[entry.from_status]}
                        />
                        <span className="text-muted-foreground">-&gt;</span>
                        <StatusBadge
                          label={t(`approvals.status.${entry.to_status}`)}
                          tone={STATUS_TONE[entry.to_status]}
                        />
                      </div>
                    </TableCell>
                    <TableCell>{entry.acted_by_name}</TableCell>
                    <TableCell>
                      <p className="max-w-[240px] whitespace-pre-wrap text-muted-foreground">
                        {entry.comment || t("common.emptyValue")}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {df.dateTime(entry.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function ApprovalActionDialog({
  approval,
  action,
  onClose,
  onDone,
}: {
  approval: ApprovalRecord;
  action: ApprovalActionType;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const commentRequired = action === "REJECT" || action === "RETURN";
  const mutation = useMutation({
    mutationFn: () =>
      actOnApproval(approval.id, { action, comment: comment.trim() }),
    onSuccess: onDone,
    onError: (error) => setErrors(error instanceof ApiError ? error.errors : {}),
  });
  const ActionIcon = ACTION_PRESENTATION[action].icon;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[500px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>
            {t(`approvals.actionDialog.${action}.title`, { name: approval.title })}
          </DialogTitle>
          <DialogDescription>
            {t(`approvals.actionDialog.${action}.description`)}
          </DialogDescription>
        </DialogHeader>
        <FieldWrapper
          label={t("approvals.field.comment")}
          required={commentRequired}
          optional={commentRequired ? undefined : t("common.optional")}
          error={errors.comment}
        >
          <Textarea
            rows={4}
            value={comment}
            placeholder={t("approvals.commentPlaceholder")}
            onChange={(event) => setComment(event.target.value)}
          />
        </FieldWrapper>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            {t("common.cancel")}
          </Button>
          <Button
            variant={action === "REJECT" ? "destructive" : "default"}
            size="sm"
            className="rounded-full px-4 shadow-sm"
            disabled={
              mutation.isPending || (commentRequired && !comment.trim())
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ActionIcon className="h-4 w-4" />
            )}
            {t(`approvals.action.${action}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ACTION_PRESENTATION: Record<ApprovalActionType, { icon: LucideIcon }> = {
  SUBMIT: { icon: Send },
  REVIEW: { icon: ScanEye },
  APPROVE: { icon: CheckCircle2 },
  REJECT: { icon: XCircle },
  RETURN: { icon: Undo2 },
  CLOSE: { icon: LockKeyhole },
};

function ApprovalActionIcon({ action }: { action: ApprovalActionType }) {
  const Icon = ACTION_PRESENTATION[action].icon;
  return <Icon className="h-4 w-4" />;
}

function availableActions(
  approval: ApprovalRecord,
  user: CurrentUser | null,
  can: (code: string) => boolean,
): ApprovalActionType[] {
  if (!user) return [];
  const requester = approval.requested_by === user.id;
  const reviewer =
    can("approval.review") &&
    !requester &&
    (approval.assigned_to === null || approval.assigned_to === user.id);
  const submitter = can("approval.submit") && requester;

  switch (approval.status) {
    case "DRAFT":
      return submitter ? ["SUBMIT"] : [];
    case "SUBMITTED":
      return reviewer ? ["REVIEW", "APPROVE", "RETURN", "REJECT"] : [];
    case "IN_REVIEW":
      return reviewer ? ["APPROVE", "RETURN", "REJECT"] : [];
    case "RETURNED":
      if (submitter) return ["SUBMIT", "CLOSE"];
      return reviewer ? ["CLOSE"] : [];
    case "APPROVED":
    case "REJECTED":
      return submitter || reviewer ? ["CLOSE"] : [];
    case "CLOSED":
      return [];
  }
}

function resourceLabel(
  type: string,
  t: ReturnType<typeof useTranslations>,
): string {
  if (!RESOURCE_TYPES.includes(type as (typeof RESOURCE_TYPES)[number])) {
    return type;
  }
  return t(`approvals.resource.${type}`);
}

function resourceLabelForForm(
  type: string,
  t: ReturnType<typeof useTranslations>,
): string {
  return resourceLabel(type, t);
}

class LocalValidationError extends Error {}
