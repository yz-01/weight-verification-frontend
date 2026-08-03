"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Camera,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  FieldWrapper,
  ListHeader,
} from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
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
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import type {
  ProgressPayload,
  ProgressUpdate,
} from "@/interfaces/site-operations";
import { useDateFormat } from "@/lib/dates";
import {
  createProgressUpdate,
  deleteProgressUpdate,
  getProgressUpdates,
  updateProgressUpdate,
} from "@/services/site-operations.service";

interface ProgressDraft {
  project: string;
  title: string;
  description: string;
  percentComplete: string;
  reportedAt: string;
  photo?: File;
}

const EMPTY_DRAFT: ProgressDraft = {
  project: "",
  title: "",
  description: "",
  percentComplete: "0",
  reportedAt: "",
};

function dateTimeInput(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function Progress() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery(["project"]);
  const [editing, setEditing] = useState<ProgressUpdate | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<ProgressUpdate | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["progress", list.query],
    queryFn: () => getProgressUpdates(list.query),
  });

  const removal = useMutation({
    mutationFn: (id: string) => deleteProgressUpdate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["progress"] });
      setRemoving(null);
    },
  });

  const columns = useMemo<ColumnDef<ProgressUpdate, unknown>[]>(
    () => [
      {
        accessorKey: "reported_at",
        meta: { label: t("progress.field.reportedAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("progress.field.reportedAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {df.dateTime(row.original.reported_at)}
          </span>
        ),
      },
      {
        accessorKey: "project_name",
        meta: { label: t("progress.field.project") },
        header: () => t("progress.field.project"),
        cell: ({ row }) => (
          <span className="block max-w-[200px] truncate">
            {row.original.project_name}
          </span>
        ),
      },
      {
        accessorKey: "title",
        meta: { label: t("progress.field.title") },
        header: () => t("progress.field.title"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-[260px] truncate font-medium text-foreground">
              {row.original.title}
            </p>
            <p className="max-w-[260px] truncate text-xs text-muted-foreground">
              {row.original.description || t("common.emptyValue")}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "percent_complete",
        meta: { label: t("progress.field.percentComplete") },
        header: ({ column }) => (
          <SortableHeader
            label={t("progress.field.percentComplete")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => {
          const percent = Math.max(0, Math.min(100, Number(row.original.percent_complete)));
          return (
            <div className="w-32 space-y-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="tabular text-xs text-muted-foreground">
                {percent}%
              </span>
            </div>
          );
        },
      },
      {
        id: "photo",
        meta: { label: t("progress.field.photo") },
        header: () => t("progress.field.photo"),
        cell: ({ row }) =>
          row.original.photo ? (
            <Button asChild variant="ghost" size="icon" title={t("progress.action.viewPhoto")}>
              <a href={row.original.photo} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          ) : (
            <span className="text-muted-foreground">{t("common.emptyValue")}</span>
          ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) =>
          can("progress.manage") ? (
            <div className="flex items-center justify-end gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-info hover:bg-info/10"
                title={t("common.edit")}
                onClick={() => {
                  setEditing(row.original);
                  setFormOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                title={t("common.remove")}
                onClick={() => setRemoving(row.original)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, df, can],
  );

  const total = data?.count ?? 0;
  const selectedProject = list.filters.project ?? "all";

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("progress.title")}
        subtitle={isLoading ? t("common.loading") : t("progress.count", { count: total })}
        action={
          can("progress.manage") ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              {t("progress.new")}
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-y bg-card/50 py-3">
        <ProjectPicker
          value={selectedProject}
          onValueChange={(value) =>
            list.setFilter("project", value === "all" ? undefined : value)
          }
          placeholder={t("progress.filter.project")}
          allowAll
          allLabel={t("progress.filter.allProjects")}
          className="w-full sm:w-[260px]"
        />
      </div>

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
        storageKey="trace-progress"
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />

      {formOpen && (
        <ProgressDialog
          update={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={() => setRemoving(null)}
          title={t("progress.remove.title", { name: removing.title })}
          description={t("progress.remove.description")}
          confirmLabel={t("progress.remove.confirm")}
          confirmIcon={Trash2}
          isPending={removal.isPending}
          onConfirm={() => removal.mutate(removing.id)}
        />
      )}
    </div>
  );
}

function ProgressDialog({
  update,
  onClose,
}: {
  update: ProgressUpdate | null;
  onClose: () => void;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ProgressDraft>(() =>
    update
      ? {
          project: update.project,
          title: update.title,
          description: update.description,
          percentComplete: update.percent_complete,
          reportedAt: dateTimeInput(update.reported_at),
        }
      : EMPTY_DRAFT,
  );

  const save = useMutation({
    mutationFn: () => {
      const payload: ProgressPayload = {
        project: draft.project,
        title: draft.title.trim(),
        description: draft.description.trim(),
        percent_complete: draft.percentComplete,
        reported_at: draft.reportedAt
          ? new Date(draft.reportedAt).toISOString()
          : undefined,
        photo: draft.photo,
      };
      return update
        ? updateProgressUpdate(update.id, payload)
        : createProgressUpdate(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["progress"] });
      onClose();
    },
  });

  const percentage = Number(draft.percentComplete);
  const valid =
    draft.project !== "" &&
    draft.title.trim() !== "" &&
    Number.isFinite(percentage) &&
    percentage >= 0 &&
    percentage <= 100;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t(update ? "progress.editTitle" : "progress.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("progress.form.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper
            label={t("progress.field.project")}
            required
            className="sm:col-span-2"
          >
            <ProjectPicker
              value={draft.project}
              onValueChange={(project) => setDraft((value) => ({ ...value, project }))}
              placeholder={t("progress.filter.project")}
              className="w-full"
              disabled={update !== null}
            />
          </FieldWrapper>
          <FieldWrapper label={t("progress.field.title")} required className="sm:col-span-2">
            <Input
              value={draft.title}
              onChange={(event) =>
                setDraft((value) => ({ ...value, title: event.target.value }))
              }
            />
          </FieldWrapper>
          <FieldWrapper label={t("progress.field.percentComplete")} required>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={draft.percentComplete}
              onChange={(event) =>
                setDraft((value) => ({
                  ...value,
                  percentComplete: event.target.value,
                }))
              }
            />
          </FieldWrapper>
          <FieldWrapper label={t("progress.field.reportedAt")} optional={t("common.optional")}>
            <Input
              type="datetime-local"
              value={draft.reportedAt}
              onChange={(event) =>
                setDraft((value) => ({ ...value, reportedAt: event.target.value }))
              }
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("progress.field.description")}
            optional={t("common.optional")}
            className="sm:col-span-2"
          >
            <Textarea
              rows={4}
              value={draft.description}
              onChange={(event) =>
                setDraft((value) => ({ ...value, description: event.target.value }))
              }
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("progress.field.photo")}
            optional={t("common.optional")}
            className="sm:col-span-2"
          >
            <Input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) =>
                setDraft((value) => ({ ...value, photo: event.target.files?.[0] }))
              }
            />
          </FieldWrapper>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
