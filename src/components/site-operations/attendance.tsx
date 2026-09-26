"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Camera,
  CheckCircle2,
  Eye,
  Loader2,
  LocateFixed,
  LogIn,
  LogOut,
  MapPin,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { LocationMap } from "@/components/shared/location-map";
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
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);

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
      setClockError(
        error instanceof ApiError
          ? error.errors.location || Object.values(error.errors)[0] || error.message
          : t("errors.generic"),
      );
    },
  });

  function locate() {
    setLocationError("");
    setClockError("");
    if (!navigator.geolocation) {
      setLocationError(t("attendance.clock.locationUnavailable"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft((value) => ({
          ...value,
          // The API stores coordinates at seven decimal places. Browsers can
          // return more precision, which would exceed the DecimalField digit
          // limit and turn a valid GPS fix into a 400 response.
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
          locationAccuracy: position.coords.accuracy.toFixed(2),
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
    // Automatic on opening the clock form, not on opening the page: a manager
    // reading the list is not asked for a position (「确保每个模块都是自动获取
    // GPS」). The button in the form stays as the retry.
    locate();
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
        cell: ({ row }) => {
          const record = row.original;
          const hasEvidence = Boolean(record.photo || record.latitude);
          return hasEvidence ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-primary"
              onClick={() => setSelectedRecord(record)}
            >
              {record.photo ? <Camera className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
              <span>{t("attendance.evidence.view")}</span>
              <Eye className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <span className="text-muted-foreground">{t("common.emptyValue")}</span>
          );
        },
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
            <p
              className={clockError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
              role={clockError ? "alert" : undefined}
            >
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

      <Dialog
        open={Boolean(selectedRecord)}
        onOpenChange={(value) => {
          if (!value) setSelectedRecord(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("attendance.evidence.title")}</DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-4">
                {selectedRecord.photo ? (
                  <div className="overflow-hidden rounded-lg border bg-muted/20">
                    <img
                      src={selectedRecord.watermarked_photo || selectedRecord.photo}
                      alt={t("attendance.evidence.photoAlt")}
                      className="max-h-[26rem] w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    {t("attendance.evidence.noPhoto")}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <EvidenceValue label={t("attendance.evidence.worker")} value={selectedRecord.user_name} />
                  <EvidenceValue label={t("attendance.evidence.project")} value={selectedRecord.project_name} />
                  <EvidenceValue
                    label={t("attendance.evidence.event")}
                    value={t(`attendance.event.${selectedRecord.event}`)}
                  />
                  <EvidenceValue
                    label={t("attendance.evidence.recordedAt")}
                    value={df.dateTime(selectedRecord.occurred_at)}
                  />
                  <EvidenceValue
                    label={t("attendance.evidence.originalAt")}
                    value={selectedRecord.original_occurred_at ? df.dateTime(selectedRecord.original_occurred_at) : t("common.emptyValue")}
                  />
                  <EvidenceValue
                    label={t("attendance.evidence.uploadedAt")}
                    value={df.dateTime(selectedRecord.uploaded_at)}
                  />
                </div>
                {selectedRecord.note && (
                  <EvidenceValue label={t("attendance.evidence.note")} value={selectedRecord.note} />
                )}
              </div>
              <div className="space-y-4">
                {selectedRecord.latitude && selectedRecord.longitude ? (
                  <LocationMap
                    center={[Number(selectedRecord.latitude), Number(selectedRecord.longitude)]}
                    markers={[
                      {
                        id: selectedRecord.id,
                        latitude: Number(selectedRecord.latitude),
                        longitude: Number(selectedRecord.longitude),
                        label: selectedRecord.user_name,
                        detail: `${selectedRecord.project_name} · ${t(`attendance.event.${selectedRecord.event}`)}`,
                        tone: selectedRecord.geofence_result === "OUTSIDE" ? "danger" : "positive",
                        icon: "person",
                      },
                    ]}
                    className="min-h-[18rem] rounded-lg"
                  />
                ) : (
                  <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    {t("attendance.evidence.noLocation")}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <EvidenceStatus
                    label={t("attendance.evidence.geofence")}
                    value={t(`attendance.evidence.geofenceStatus.${selectedRecord.geofence_result}`)}
                    positive={selectedRecord.geofence_result === "INSIDE"}
                    negative={selectedRecord.geofence_result === "OUTSIDE"}
                  />
                  <EvidenceValue
                    label={t("attendance.evidence.geofenceName")}
                    value={selectedRecord.matched_geofence_name || t("attendance.evidence.notMatched")}
                  />
                  <EvidenceValue
                    label={t("attendance.evidence.distance")}
                    value={selectedRecord.distance_m ? `${selectedRecord.distance_m} m` : t("common.emptyValue")}
                  />
                  <EvidenceValue
                    label={t("attendance.evidence.accuracy")}
                    value={selectedRecord.location_accuracy_m ? `${selectedRecord.location_accuracy_m} m` : t("common.emptyValue")}
                  />
                  <EvidenceValue label={t("attendance.evidence.latitude")} value={selectedRecord.latitude || t("common.emptyValue")} />
                  <EvidenceValue label={t("attendance.evidence.longitude")} value={selectedRecord.longitude || t("common.emptyValue")} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRecord(null)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EvidenceValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/20 p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-medium text-foreground">{value}</div>
    </div>
  );
}

function EvidenceStatus({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive: boolean;
  negative: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/20 p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-1.5 font-medium text-foreground">
        {positive ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
        {negative ? <XCircle className="h-4 w-4 text-destructive" /> : null}
        {value}
      </div>
    </div>
  );
}
