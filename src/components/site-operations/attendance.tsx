"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Camera, Loader2, LocateFixed, LogIn, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { FieldWrapper, ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import { ApiError } from "@/interfaces/api";
import type {
  AttendanceEvent,
  AttendanceRecord,
} from "@/interfaces/site-operations";
import { useDateFormat } from "@/lib/dates";
import { submitAttendanceOfflineAware } from "@/services/offline-sync.service";
import { getAttendance } from "@/services/site-operations.service";

interface ClockDraft {
  project: string;
  event: AttendanceEvent;
  note: string;
  photo?: File;
  latitude?: string;
  longitude?: string;
  locationAccuracy?: string;
}

const EMPTY_DRAFT: ClockDraft = {
  project: "",
  event: "CLOCK_IN",
  note: "",
};

export function Attendance() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery(["project", "event"]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ClockDraft>(EMPTY_DRAFT);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [clockError, setClockError] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["attendance", list.query],
    queryFn: () => getAttendance(list.query),
  });

  const clock = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("A signed-in user is required.");
      return submitAttendanceOfflineAware(user.id, {
        project: draft.project,
        event: draft.event,
        note: draft.note,
        photo: draft.photo,
        latitude: draft.latitude,
        longitude: draft.longitude,
        locationAccuracyM: draft.locationAccuracy,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
      setOpen(false);
      setDraft(EMPTY_DRAFT);
      setLocationError("");
      setClockError("");
    },
    onError: (error) => {
      setClockError(error instanceof ApiError ? error.message : t("errors.generic"));
    },
  });

  function locate() {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError(t("attendance.clock.locationUnavailable"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft((value) => ({
          ...value,
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
          locationAccuracy: String(position.coords.accuracy),
        }));
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocationError(t("attendance.clock.locationError"));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  function openClockDialog() {
    setDraft(EMPTY_DRAFT);
    setLocationError("");
    setClockError("");
    setOpen(true);
  }

  const columns = useMemo<ColumnDef<AttendanceRecord, unknown>[]>(
    () => [
      {
        accessorKey: "occurred_at",
        meta: { label: t("attendance.field.time") },
        header: ({ column }) => (
          <SortableHeader
            label={t("attendance.field.time")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {df.dateTime(row.original.occurred_at)}
          </span>
        ),
      },
      {
        accessorKey: "user_name",
        meta: { label: t("attendance.field.worker") },
        header: () => t("attendance.field.worker"),
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.user_name}
          </span>
        ),
      },
      {
        accessorKey: "project_name",
        meta: { label: t("attendance.field.project") },
        header: () => t("attendance.field.project"),
      },
      {
        accessorKey: "event",
        meta: { label: t("attendance.field.event") },
        header: () => t("attendance.field.event"),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`attendance.event.${row.original.event}`)}
            tone={row.original.event === "CLOCK_IN" ? "positive" : "neutral"}
          />
        ),
      },
      {
        id: "evidence",
        meta: { label: t("attendance.field.evidence") },
        header: () => t("attendance.field.evidence"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2 text-muted-foreground">
            {row.original.photo && <Camera className="h-4 w-4" />}
            {row.original.latitude && <LocateFixed className="h-4 w-4" />}
            {!row.original.photo && !row.original.latitude
              ? t("common.emptyValue")
              : null}
          </div>
        ),
      },
    ],
    [t, df],
  );

  const total = data?.count ?? 0;
  const selectedProject = list.filters.project ?? "all";

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("attendance.title")}
        subtitle={isLoading ? t("common.loading") : t("attendance.count", { count: total })}
        action={
          <div className="flex items-center gap-2">
            <ProjectPicker
              value={selectedProject}
              onValueChange={(value) =>
                list.setFilter("project", value === "all" ? undefined : value)
              }
              placeholder={t("attendance.filter.project")}
              allowAll
              allLabel={t("attendance.filter.allProjects")}
              className="hidden w-[220px] sm:flex"
            />
            {can("attendance.clock") && (
              <Button size="sm" onClick={openClockDialog}>
                <LogIn className="h-4 w-4" />
                {t("attendance.clock.action")}
              </Button>
            )}
          </div>
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
        storageKey="attendance"
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active: !list.filters.event,
            onSelect: () => list.setFilter("event", undefined),
          },
          ...(["CLOCK_IN", "CLOCK_OUT"] as const).map((event) => ({
            key: event,
            label: t(`attendance.event.${event}`),
            active: list.filters.event === event,
            onSelect: () => list.setFilter("event", event),
          })),
        ]}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("attendance.clock.title")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
              <FieldWrapper label={t("attendance.field.project")} required className="sm:col-span-2">
                <ProjectPicker
                  value={draft.project}
                  onValueChange={(project) => {
                    setClockError("");
                    setDraft((value) => ({ ...value, project }));
                  }}
                  placeholder={t("attendance.filter.project")}
                />
              </FieldWrapper>
            <Button
              type="button"
              variant={draft.event === "CLOCK_IN" ? "default" : "outline"}
              onClick={() => setDraft((value) => ({ ...value, event: "CLOCK_IN" }))}
            >
              <LogIn className="h-4 w-4" />
              {t("attendance.event.CLOCK_IN")}
            </Button>
            <Button
              type="button"
              variant={draft.event === "CLOCK_OUT" ? "default" : "outline"}
              onClick={() => setDraft((value) => ({ ...value, event: "CLOCK_OUT" }))}
            >
              <LogOut className="h-4 w-4" />
              {t("attendance.event.CLOCK_OUT")}
            </Button>
            <FieldWrapper label={t("attendance.field.photo")} optional={t("common.optional")}>
              <Input
                type="file"
                accept="image/*"
                capture="user"
                onChange={(event) =>
                  setDraft((value) => ({ ...value, photo: event.target.files?.[0] }))
                }
              />
            </FieldWrapper>
              <FieldWrapper label={t("attendance.field.location")} required>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={locate}
                disabled={locating}
              >
                {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                {draft.latitude ? t("attendance.clock.locationCaptured") : t("attendance.clock.captureLocation")}
              </Button>
              {locationError && (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {locationError}
                </p>
              )}
            </FieldWrapper>
            <FieldWrapper label={t("attendance.field.note")} optional={t("common.optional")} className="sm:col-span-2">
              <Textarea value={draft.note} onChange={(event) => setDraft((value) => ({ ...value, note: event.target.value }))} />
            </FieldWrapper>
          </div>
          {(clockError || !draft.project || (!draft.latitude && !locating)) && (
            <p className="text-xs text-muted-foreground" role={clockError ? "alert" : undefined}>
              {clockError ||
                (!draft.project
                  ? t("attendance.clock.projectRequired")
                  : t("attendance.clock.locationRequired"))}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={() => clock.mutate()}
              disabled={!draft.project || !draft.latitude || clock.isPending}
            >
              {clock.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("attendance.clock.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
