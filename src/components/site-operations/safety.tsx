"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ExternalLink,
  Loader2,
  LocateFixed,
  Plus,
  Save,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  FieldWrapper,
  ListHeader,
  StatusBadge,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import type {
  IncidentSeverity,
  IncidentStatus,
  SafetyIncident,
  SafetyIncidentPayload,
} from "@/interfaces/site-operations";
import { useDateFormat } from "@/lib/dates";
import {
  createSafetyIncident,
  getSafetyIncidents,
  updateSafetyStatus,
} from "@/services/site-operations.service";

const SEVERITIES: IncidentSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES: IncidentStatus[] = ["OPEN", "INVESTIGATING", "RESOLVED"];

const SEVERITY_TONE: Record<
  IncidentSeverity,
  "neutral" | "info" | "warning" | "danger"
> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  CRITICAL: "danger",
};

const STATUS_TONE: Record<
  IncidentStatus,
  "danger" | "warning" | "positive"
> = {
  OPEN: "danger",
  INVESTIGATING: "warning",
  RESOLVED: "positive",
};

interface SafetyDraft {
  project: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  occurredAt: string;
  latitude?: string;
  longitude?: string;
  photo?: File;
}

const EMPTY_DRAFT: SafetyDraft = {
  project: "",
  title: "",
  description: "",
  severity: "MEDIUM",
  occurredAt: "",
};

export function Safety() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const list = useListQuery(["project", "severity", "status"]);
  const [createOpen, setCreateOpen] = useState(false);
  const [updating, setUpdating] = useState<SafetyIncident | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["safety", list.query],
    queryFn: () => getSafetyIncidents(list.query),
  });

  const columns = useMemo<ColumnDef<SafetyIncident, unknown>[]>(
    () => [
      {
        accessorKey: "occurred_at",
        meta: { label: t("safety.field.occurredAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("safety.field.occurredAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div>
            <p className="tabular text-muted-foreground">
              {df.dateTime(row.original.occurred_at)}
            </p>
            <p className="tabular text-xs text-muted-foreground">
              {row.original.incident_no}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "title",
        meta: { label: t("safety.field.title") },
        header: () => t("safety.field.title"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-[260px] truncate font-medium text-foreground">
              {row.original.title}
            </p>
            <p className="max-w-[260px] truncate text-xs text-muted-foreground">
              {row.original.description}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "project_name",
        meta: { label: t("safety.field.project") },
        header: () => t("safety.field.project"),
        cell: ({ row }) => (
          <span className="block max-w-[200px] truncate">
            {row.original.project_name}
          </span>
        ),
      },
      {
        accessorKey: "severity",
        meta: { label: t("safety.field.severity") },
        header: ({ column }) => (
          <SortableHeader
            label={t("safety.field.severity")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`safety.severity.${row.original.severity}`)}
            tone={SEVERITY_TONE[row.original.severity]}
          />
        ),
      },
      {
        accessorKey: "status",
        meta: { label: t("safety.field.status") },
        header: ({ column }) => (
          <SortableHeader
            label={t("safety.field.status")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`safety.status.${row.original.status}`)}
            tone={STATUS_TONE[row.original.status]}
          />
        ),
      },
      {
        id: "evidence",
        meta: { label: t("safety.field.evidence") },
        header: () => t("safety.field.evidence"),
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {row.original.latitude && (
              <LocateFixed
                className="h-4 w-4 text-success"
                aria-label={t("safety.evidence.location")}
              />
            )}
            {row.original.photo && (
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title={t("safety.evidence.photo")}
              >
                <a href={row.original.photo} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
            {!row.original.latitude && !row.original.photo && (
              <span className="text-muted-foreground">{t("common.emptyValue")}</span>
            )}
          </div>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) =>
          can("safety.manage") ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary hover:bg-primary/10"
              title={t("safety.action.updateStatus")}
              onClick={() => setUpdating(row.original)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Button>
          ) : null,
      },
    ],
    [t, df, can],
  );

  const total = data?.count ?? 0;
  const selectedProject = list.filters.project ?? "all";
  const selectedSeverity = list.filters.severity ?? "all";

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("safety.title")}
        subtitle={isLoading ? t("common.loading") : t("safety.count", { count: total })}
        action={
          can("safety.manage") ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("safety.new")}
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
          placeholder={t("safety.filter.project")}
          allowAll
          allLabel={t("safety.filter.allProjects")}
          className="w-full sm:w-[260px]"
        />
        <Select
          value={selectedSeverity}
          onValueChange={(value) =>
            list.setFilter("severity", value === "all" ? undefined : value)
          }
        >
          <SelectTrigger className="w-full sm:w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("safety.filter.allSeverities")}</SelectItem>
            {SEVERITIES.map((severity) => (
              <SelectItem key={severity} value={severity}>
                {t(`safety.severity.${severity}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        storageKey="trace-safety"
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active: !list.filters.status,
            onSelect: () => list.setFilter("status", undefined),
          },
          ...STATUSES.map((status) => ({
            key: status,
            label: t(`safety.status.${status}`),
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

      {createOpen && <SafetyCreateDialog onClose={() => setCreateOpen(false)} />}
      {updating && (
        <SafetyStatusDialog incident={updating} onClose={() => setUpdating(null)} />
      )}
    </div>
  );
}

function SafetyCreateDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SafetyDraft>(EMPTY_DRAFT);
  const [locating, setLocating] = useState(false);

  const create = useMutation({
    mutationFn: () => {
      const payload: SafetyIncidentPayload = {
        project: draft.project,
        title: draft.title.trim(),
        description: draft.description.trim(),
        severity: draft.severity,
        occurred_at: draft.occurredAt
          ? new Date(draft.occurredAt).toISOString()
          : undefined,
        latitude: draft.latitude,
        longitude: draft.longitude,
        photo: draft.photo,
      };
      return createSafetyIncident(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["safety"] });
      onClose();
    },
  });

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft((value) => ({
          ...value,
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
        }));
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const valid =
    draft.project !== "" &&
    draft.title.trim() !== "" &&
    draft.description.trim() !== "";

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("safety.createTitle")}</DialogTitle>
          <DialogDescription>{t("safety.form.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("safety.field.project")} required className="sm:col-span-2">
            <ProjectPicker
              value={draft.project}
              onValueChange={(project) => setDraft((value) => ({ ...value, project }))}
              placeholder={t("safety.filter.project")}
              className="w-full"
            />
          </FieldWrapper>
          <FieldWrapper label={t("safety.field.title")} required className="sm:col-span-2">
            <Input
              value={draft.title}
              onChange={(event) =>
                setDraft((value) => ({ ...value, title: event.target.value }))
              }
            />
          </FieldWrapper>
          <FieldWrapper label={t("safety.field.severity")} required>
            <Select
              value={draft.severity}
              onValueChange={(severity) =>
                setDraft((value) => ({
                  ...value,
                  severity: severity as IncidentSeverity,
                }))
              }
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((severity) => (
                  <SelectItem key={severity} value={severity}>
                    {t(`safety.severity.${severity}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("safety.field.occurredAt")} optional={t("common.optional")}>
            <Input
              type="datetime-local"
              value={draft.occurredAt}
              onChange={(event) =>
                setDraft((value) => ({ ...value, occurredAt: event.target.value }))
              }
            />
          </FieldWrapper>
          <FieldWrapper label={t("safety.field.description")} required className="sm:col-span-2">
            <Textarea
              rows={4}
              value={draft.description}
              onChange={(event) =>
                setDraft((value) => ({ ...value, description: event.target.value }))
              }
            />
          </FieldWrapper>
          <FieldWrapper label={t("safety.field.photo")} optional={t("common.optional")}>
            <Input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) =>
                setDraft((value) => ({ ...value, photo: event.target.files?.[0] }))
              }
            />
          </FieldWrapper>
          <FieldWrapper label={t("safety.field.location")} optional={t("common.optional")}>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={locating}
              onClick={locate}
            >
              {locating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed className="h-4 w-4" />
              )}
              {draft.latitude
                ? t("safety.form.locationCaptured")
                : t("safety.form.captureLocation")}
            </Button>
          </FieldWrapper>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldAlert className="h-4 w-4" />
            )}
            {t("safety.form.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SafetyStatusDialog({
  incident,
  onClose,
}: {
  incident: SafetyIncident;
  onClose: () => void;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<IncidentStatus>(incident.status);
  const [note, setNote] = useState(incident.resolution_note);

  const update = useMutation({
    mutationFn: () => updateSafetyStatus(incident.id, status, note.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["safety"] });
      onClose();
    },
  });

  const valid = status !== "RESOLVED" || note.trim() !== "";

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("safety.update.title")}</DialogTitle>
          <DialogDescription>
            {t("safety.update.description", { incident: incident.incident_no })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FieldWrapper label={t("safety.field.status")} required>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as IncidentStatus)}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`safety.status.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper
            label={t("safety.field.resolutionNote")}
            required={status === "RESOLVED"}
            optional={status === "RESOLVED" ? undefined : t("common.optional")}
          >
            <Textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} />
          </FieldWrapper>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!valid || update.isPending} onClick={() => update.mutate()}>
            {update.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
