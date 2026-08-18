"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Camera,
  CheckCircle2,
  Loader2,
  LocateFixed,
  Plus,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  RotateCcw,
  UserCheck,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  completedFieldEvidence,
  createEmptyFieldEvidence,
  FIELD_EVIDENCE_PHOTO_COUNT,
  FieldEvidenceGrid,
  hasRequiredFieldEvidence,
} from "@/components/field-staff/field-evidence-grid";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import { FieldCamera } from "@/components/shared/field-camera";
import {
  FieldWrapper,
  ListHeader,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { submitSafetyIncidentOfflineAware } from "@/services/offline-sync.service";
import { getProjectCategories } from "@/services/contractor-ops.service";
import { getProjectAssignments } from "@/services/contractor.service";
import {
  assignSafetyRectification,
  exportSafetyIncidents,
  getSafetyIncident,
  getSafetyIncidents,
  getIncidentRecipientOptions,
  reviewSafetyRectification,
  submitSafetyRectification,
  updateSafetyStatus,
} from "@/services/site-operations.service";
import { getOrCreateFieldDeviceId } from "@/services/field-access.service";

const SEVERITIES: IncidentSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES: IncidentStatus[] = [
  "OPEN", "ASSIGNED", "RECTIFICATION_SUBMITTED", "RETURNED", "VERIFIED",
];

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
  "danger" | "warning" | "positive" | "info" | "neutral"
> = {
  OPEN: "danger",
  INVESTIGATING: "warning",
  ASSIGNED: "info",
  RECTIFICATION_SUBMITTED: "warning",
  RETURNED: "danger",
  VERIFIED: "positive",
  RESOLVED: "positive",
};

interface SafetyDraft {
  project: string;
  category: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  occurredAt: string;
  latitude?: string;
  longitude?: string;
  photos: Array<File | undefined>;
  notifyUsers: string[];
}

const EMPTY_DRAFT: SafetyDraft = {
  project: "",
  category: "",
  title: "",
  description: "",
  severity: "MEDIUM",
  occurredAt: "",
  photos: createEmptyFieldEvidence(),
  notifyUsers: [],
};

export function Safety({
  mode = "incidents",
  fieldMode = false,
  initialProject = "",
  fieldTaskId,
  onRecordSaved,
}: {
  mode?: "incidents" | "rectification";
  fieldMode?: boolean;
  initialProject?: string;
  fieldTaskId?: string;
  onRecordSaved?: () => void;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  const { can, user } = useAuth();
  const list = useListQuery([
    "project",
    "category",
    "severity",
    "status",
    "responsible_person",
    "date_from",
    "date_to",
  ]);
  const searchParams = useSearchParams();
  const requestedIncidentId = searchParams.get("incident");
  const [createOpen, setCreateOpen] = useState(Boolean(fieldTaskId) || searchParams.get("create") === "1");
  const [updating, setUpdating] = useState<SafetyIncident | null>(null);
  const [assigning, setAssigning] = useState<SafetyIncident | null>(null);
  const [submitting, setSubmitting] = useState<SafetyIncident | null>(null);
  const [reviewing, setReviewing] = useState<SafetyIncident | null>(null);
  const openedIncidentRef = useRef("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["safety", mode, list.query],
    queryFn: () => getSafetyIncidents({
      ...list.query,
      workflow: mode === "rectification" ? "rectification" : undefined,
    }),
  });
  const focusedIncident = useQuery({
    queryKey: ["safety-incident", requestedIncidentId],
    queryFn: () => getSafetyIncident(requestedIncidentId!),
    enabled: Boolean(requestedIncidentId),
  });
  const selectedProject = list.filters.project ?? "all";
  const selectedSeverity = list.filters.severity ?? "all";
  const selectedCategory = list.filters.category ?? "all";
  const selectedResponsible = list.filters.responsible_person ?? "all";
  const filterCategories = useQuery({
    queryKey: ["safety-categories", selectedProject],
    queryFn: () =>
      getProjectCategories({
        project: selectedProject === "all" ? undefined : selectedProject,
        is_active: true,
        page_size: 200,
      }),
  });
  const responsiblePeople = useQuery({
    queryKey: ["safety-responsible-people", selectedProject],
    queryFn: () => getProjectAssignments(selectedProject),
    enabled: selectedProject !== "all",
  });

  useEffect(() => {
    const incident = focusedIncident.data;
    if (!incident || openedIncidentRef.current === incident.id) return;
    openedIncidentRef.current = incident.id;
    const timer = window.setTimeout(() => {
      if (
        can("safety.verify") &&
        incident.status === "RECTIFICATION_SUBMITTED"
      ) {
        setReviewing(incident);
      } else if (
        can("safety.manage") &&
        incident.responsible_person === user?.id &&
        ["ASSIGNED", "RETURNED"].includes(incident.status)
      ) {
        setSubmitting(incident);
      } else if (
        can("safety.manage") &&
        ["OPEN", "RETURNED"].includes(incident.status)
      ) {
        setAssigning(incident);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [can, focusedIncident.data, user?.id]);

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
        accessorKey: "category_name",
        meta: { label: t("safety.field.category") },
        header: () => t("safety.field.category"),
        cell: ({ row }) => (
          <span className="block max-w-[180px] truncate">
            {row.original.category_name || t("common.emptyValue")}
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
            label={t(`safetyRectification.status.${row.original.status}`)}
            tone={STATUS_TONE[row.original.status]}
          />
        ),
      },
      {
        id: "evidence",
        meta: { label: t("safety.field.evidence") },
        header: () => t("safety.field.evidence"),
        cell: ({ row }) => (
          <div className="flex max-w-[18rem] items-center gap-1 overflow-x-auto py-1 [scrollbar-width:thin]">
            {row.original.latitude && (
              <LocateFixed
                className="h-4 w-4 shrink-0 text-success"
                aria-label={t("safety.evidence.location")}
              />
            )}
            {(row.original.initial_evidence ?? []).map((item, index) => (
              <a
                key={item.id}
                href={item.watermarked || item.image}
                target="_blank"
                rel="noreferrer"
                className="relative shrink-0 overflow-hidden rounded-md border"
                title={`${t("safety.evidence.photo")} ${index + 1}`}
              >
                <Image
                  src={item.watermarked || item.image}
                  alt={`${t("safety.evidence.photo")} ${index + 1}`}
                  width={32}
                  height={32}
                  unoptimized
                  className="size-7 object-cover"
                />
              </a>
            ))}
            {!row.original.latitude && !(row.original.initial_evidence?.length ?? 0) && (
              <span className="text-muted-foreground">{t("common.emptyValue")}</span>
            )}
          </div>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {can("safety.manage") && ["OPEN", "RETURNED"].includes(row.original.status) && (
              <Button variant="ghost" size="icon" className="h-7 w-7" title={t("safetyRectification.action.assign")} onClick={() => setAssigning(row.original)}><UserCheck className="h-4 w-4" /></Button>
            )}
            {can("safety.manage") && row.original.responsible_person === user?.id && ["ASSIGNED", "RETURNED"].includes(row.original.status) && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" title={t("safetyRectification.action.submit")} onClick={() => setSubmitting(row.original)}><Camera className="h-4 w-4" /></Button>
            )}
            {can("safety.verify") && row.original.status === "RECTIFICATION_SUBMITTED" && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-success" title={t("safetyRectification.action.review")} onClick={() => setReviewing(row.original)}><CheckCircle2 className="h-4 w-4" /></Button>
            )}
            {can("safety.manage") && ["OPEN", "INVESTIGATING"].includes(row.original.status) && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title={t("safety.action.updateStatus")} onClick={() => setUpdating(row.original)}><SlidersHorizontal className="h-3.5 w-3.5" /></Button>
            )}
          </div>
        ),
      },
    ],
    [t, df, can, user?.id],
  );

  const total = data?.count ?? 0;
  const runExport = (format: "xlsx" | "pdf") =>
    exportSafetyIncidents({
      format,
      title: t("safety.title"),
      subtitle: t("safety.form.description"),
      emptyLabel: t("common.emptyValue"),
      query: {
        ...list.query,
        workflow: mode === "rectification" ? "rectification" : undefined,
      },
      columns: [
        { key: "incident_no", label: t("safety.field.incidentNo") },
        { key: "occurred_at", label: t("safety.field.occurredAt") },
        { key: "project_name", label: t("safety.field.project") },
        { key: "category_name", label: t("safety.field.category") },
        { key: "title", label: t("safety.field.title") },
        { key: "description", label: t("safety.field.description") },
        { key: "severity", label: t("safety.field.severity") },
        { key: "status", label: t("safety.field.status") },
        { key: "responsible_person_name", label: t("safety.field.responsible") },
        { key: "rectification_due_at", label: t("safety.field.dueAt") },
        { key: "photographer_name", label: t("safety.field.photographer") },
        { key: "latitude", label: t("safety.field.latitude") },
        { key: "longitude", label: t("safety.field.longitude") },
      ],
    });

  return (
    <div className={fieldMode ? "flex min-h-0 flex-col gap-4" : "flex h-[calc(100dvh-5rem)] flex-col gap-4"}>
      <ListHeader
        title={t(fieldMode ? "safety.fieldReport.title" : mode === "rectification" ? "safetyRectification.title" : "safety.title")}
        subtitle={fieldMode ? t("safety.fieldReport.subtitle") : isLoading ? t("common.loading") : t(mode === "rectification" ? "safetyRectification.count" : "safety.count", { count: total })}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {can("report.export") && !fieldMode && (
              <ExportButton onExport={runExport} disabled={!total} />
            )}
            {mode === "incidents" && can("safety.manage") && (
            <Button size={fieldMode ? "lg" : "sm"} className={fieldMode ? "min-h-12 px-5 text-base" : undefined} onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {t(fieldMode ? "safety.fieldReport.new" : "safety.new")}
            </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-y bg-card/50 py-3">
        <ProjectPicker
          value={selectedProject}
          onValueChange={(value) => {
            list.setFilters({
              project: value === "all" ? undefined : value,
              category: undefined,
              responsible_person: undefined,
            });
          }}
          placeholder={t("safety.filter.project")}
          allowAll
          allLabel={t("safety.filter.allProjects")}
          className="w-full sm:w-[260px]"
        />
        {!fieldMode && <Select
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
        </Select>}
        {!fieldMode && (
          <Select
            value={selectedCategory}
            onValueChange={(value) =>
              list.setFilter("category", value === "all" ? undefined : value)
            }
          >
            <SelectTrigger className="w-full sm:w-[210px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("safety.filter.allCategories")}</SelectItem>
              {(filterCategories.data?.results ?? []).map((category) => (
                <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!fieldMode && selectedProject !== "all" && (
          <Select
            value={selectedResponsible}
            onValueChange={(value) =>
              list.setFilter("responsible_person", value === "all" ? undefined : value)
            }
          >
            <SelectTrigger className="w-full sm:w-[210px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("safety.filter.allResponsible")}</SelectItem>
              {(responsiblePeople.data?.results ?? []).map((person) => (
                <SelectItem key={person.user} value={person.user}>{person.user_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!fieldMode && (
          <Input
            type="date"
            aria-label={t("safety.filter.dateFrom")}
            value={list.filters.date_from ?? ""}
            onChange={(event) => list.setFilter("date_from", event.target.value || undefined)}
            className="w-full sm:w-[165px]"
          />
        )}
        {!fieldMode && (
          <Input
            type="date"
            aria-label={t("safety.filter.dateTo")}
            value={list.filters.date_to ?? ""}
            onChange={(event) => list.setFilter("date_to", event.target.value || undefined)}
            className="w-full sm:w-[165px]"
          />
        )}
      </div>

      {fieldMode ? (
        <div className="grid gap-3">
          {isLoading && <div className="grid min-h-32 place-items-center"><Loader2 className="animate-spin text-primary" /></div>}
          {isError && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">{t("safety.fieldReport.loadError")}</div>}
          {!isLoading && !isError && (data?.results ?? []).length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{t("safety.fieldReport.empty")}</div>
          )}
          {(data?.results ?? []).map((incident) => (
            <article key={incident.id} className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning"><ShieldAlert /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{incident.title}</p>
                    <StatusBadge label={t(`safetyRectification.status.${incident.status}`)} tone={STATUS_TONE[incident.status]} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{incident.project_name} · {df.dateTime(incident.occurred_at)}</p>
                  {incident.notified_user_names.length > 0 && <p className="mt-2 text-sm">{t("safety.fieldReport.sentTo", { names: incident.notified_user_names.join(", ") })}</p>}
                </div>
              </div>
              {incident.responsible_person === user?.id && ["ASSIGNED", "RETURNED"].includes(incident.status) && (
                <Button className="mt-4 w-full min-h-11" onClick={() => setSubmitting(incident)}><Camera />{t("safetyRectification.action.submit")}</Button>
              )}
            </article>
          ))}
        </div>
      ) : <DataTable
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
            label: t(`safetyRectification.status.${status}`),
            active: list.filters.status === status,
            onSelect: () => list.setFilter("status", status),
          })),
        ]}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />}

      {createOpen && <SafetyCreateDialog fieldMode={fieldMode} initialProject={initialProject} fieldTaskId={fieldTaskId} onSaved={onRecordSaved} onClose={() => setCreateOpen(false)} />}
      {updating && (
        <SafetyStatusDialog incident={updating} onClose={() => setUpdating(null)} />
      )}
      {assigning && <SafetyAssignDialog incident={assigning} onClose={() => setAssigning(null)} />}
      {submitting && <SafetySubmitDialog incident={submitting} onClose={() => setSubmitting(null)} />}
      {reviewing && <SafetyReviewDialog incident={reviewing} onClose={() => setReviewing(null)} />}
    </div>
  );
}

function SafetyAssignDialog({ incident, onClose }: { incident: SafetyIncident; onClose: () => void }) {
  const t = useTranslations("safetyRectification");
  const qc = useQueryClient();
  const team = useQuery({ queryKey: ["project-assignments", incident.project, "safety"], queryFn: () => getProjectAssignments(incident.project) });
  const [person, setPerson] = useState(incident.responsible_person ?? "");
  const [dueAt, setDueAt] = useState(incident.rectification_due_at ? incident.rectification_due_at.slice(0, 16) : "");
  const [note, setNote] = useState(incident.rectification_note);
  const save = useMutation({ mutationFn: () => assignSafetyRectification(incident.id, { responsible_person: person, due_at: new Date(dueAt).toISOString(), note }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["safety"] }); onClose(); } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("assign.title")}</DialogTitle><DialogDescription>{t("assign.description", { incident: incident.incident_no })}</DialogDescription></DialogHeader><FieldWrapper label={t("field.responsible")} required><Select value={person || undefined} onValueChange={setPerson}><SelectTrigger className="w-full"><SelectValue placeholder={t("field.selectResponsible")} /></SelectTrigger><SelectContent>{(team.data?.results ?? []).map((row) => <SelectItem key={row.user} value={row.user}>{row.user_name}</SelectItem>)}</SelectContent></Select></FieldWrapper><FieldWrapper label={t("field.dueAt")} required><Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.instructions")}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></FieldWrapper><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button disabled={!person || !dueAt || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <UserCheck />}{t("action.assign")}</Button></DialogFooter></DialogContent></Dialog>;
}

function SafetySubmitDialog({ incident, onClose }: { incident: SafetyIncident; onClose: () => void }) {
  const t = useTranslations("safetyRectification");
  const qc = useQueryClient();
  const { user } = useAuth();
  const fieldMode = Boolean(user?.is_field_staff);
  const [fieldEvidence, setFieldEvidence] = useState(createEmptyFieldEvidence);
  const [officeImages, setOfficeImages] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [location, setLocation] = useState<{ latitude: string; longitude: string; accuracy: string } | null>(null);
  const [locationError, setLocationError] = useState("");
  const images = fieldMode ? completedFieldEvidence(fieldEvidence) : officeImages;
  const evidenceLabels = [
    t("evidence.before"),
    t("evidence.completed"),
    t("evidence.detail"),
    t("evidence.surroundings"),
  ];
  const getLocation = () => { setLocationError(""); navigator.geolocation.getCurrentPosition((position) => setLocation({ latitude: position.coords.latitude.toFixed(7), longitude: position.coords.longitude.toFixed(7), accuracy: position.coords.accuracy.toFixed(2) }), () => setLocationError(t("error.location")), { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }); };
  const save = useMutation({ mutationFn: () => submitSafetyRectification(incident.id, { images, note, captured_at: new Date().toISOString(), latitude: location?.latitude, longitude: location?.longitude, accuracy_m: location?.accuracy, device_id: fieldMode ? getOrCreateFieldDeviceId() : undefined, client_event_id: crypto.randomUUID() }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["safety"] }); onClose(); } });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("submit.title")}</DialogTitle>
          <DialogDescription>{incident.rectification_note || t("submit.description")}</DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("field.photo")} required>
          {fieldMode ? (
            <FieldEvidenceGrid
              labels={evidenceLabels}
              files={fieldEvidence}
              progressLabel={t("evidence.progress", {
                current: images.length,
                required: FIELD_EVIDENCE_PHOTO_COUNT,
              })}
              onChange={setFieldEvidence}
            />
          ) : (
            <FieldCamera
              label={t("field.photo")}
              fileCount={officeImages.length}
              onCapture={(image) => setOfficeImages((current) => [...current, image])}
              onClear={() => setOfficeImages([])}
            />
          )}
        </FieldWrapper>
        <FieldWrapper label={t("field.location")} required error={locationError}>
          <Button className="w-full" variant="outline" onClick={getLocation}>
            <LocateFixed />
            {location ? t("action.locationReady") : t("action.getLocation")}
          </Button>
        </FieldWrapper>
        <FieldWrapper label={t("field.workDone")} optional={fieldMode ? t("action.optional") : undefined} required={!fieldMode}>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </FieldWrapper>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button>
          <Button disabled={images.length < (fieldMode ? FIELD_EVIDENCE_PHOTO_COUNT : 1) || (fieldMode && !hasRequiredFieldEvidence(fieldEvidence)) || !location || (!fieldMode && !note.trim()) || save.isPending} onClick={() => save.mutate()}>
            <Camera />
            {t("action.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SafetyReviewDialog({ incident, onClose }: { incident: SafetyIncident; onClose: () => void }) {
  const t = useTranslations("safetyRectification");
  const qc = useQueryClient();
  const [decision, setDecision] = useState<"VERIFIED" | "RETURNED">("VERIFIED");
  const [note, setNote] = useState("");
  const [image, setImage] = useState<File>();
  const [location, setLocation] = useState<{ latitude: string; longitude: string; accuracy: string } | null>(null);
  const [locationError, setLocationError] = useState("");
  const getLocation = () => {
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (position) => setLocation({
        latitude: position.coords.latitude.toFixed(7),
        longitude: position.coords.longitude.toFixed(7),
        accuracy: position.coords.accuracy.toFixed(2),
      }),
      () => setLocationError(t("error.location")),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };
  const save = useMutation({ mutationFn: () => reviewSafetyRectification(incident.id, { decision, note, image, latitude: location?.latitude, longitude: location?.longitude, accuracy_m: location?.accuracy }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["safety"] }); onClose(); } });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("review.title")}</DialogTitle>
          <DialogDescription>{t("review.description", { incident: incident.incident_no })}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {incident.rectification_evidence.filter((item) => item.kind === "RECTIFICATION").map((item) => (
            <a key={item.id} href={item.watermarked || item.image} target="_blank" rel="noreferrer">
              <Image src={item.watermarked || item.image} alt="" width={320} height={320} unoptimized className="aspect-square w-full rounded-lg object-cover" />
            </a>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant={decision === "VERIFIED" ? "default" : "outline"} onClick={() => setDecision("VERIFIED")}><CheckCircle2 />{t("action.verify")}</Button>
          <Button variant={decision === "RETURNED" ? "destructive" : "outline"} onClick={() => setDecision("RETURNED")}><RotateCcw />{t("action.return")}</Button>
        </div>
        <FieldWrapper label={t("field.reviewNote")} required={decision === "RETURNED"}>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("field.verificationPhoto")} optional={t("action.optional")}>
          <FieldCamera label={t("field.verificationPhoto")} fileCount={image ? 1 : 0} onCapture={setImage} onClear={() => { setImage(undefined); setLocation(null); }} />
        </FieldWrapper>
        {image && (
          <FieldWrapper label={t("field.location")} required error={locationError}>
            <Button className="w-full" variant="outline" onClick={getLocation}>
              <LocateFixed />
              {location ? t("action.locationReady") : t("action.getLocation")}
            </Button>
          </FieldWrapper>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button>
          <Button disabled={(decision === "RETURNED" && !note.trim()) || Boolean(image && !location) || save.isPending} onClick={() => save.mutate()}>
            {decision === "VERIFIED" ? <CheckCircle2 /> : <RotateCcw />}
            {t(decision === "VERIFIED" ? "action.verify" : "action.return")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SafetyCreateDialog({
  onClose,
  fieldMode = false,
  initialProject = "",
  fieldTaskId,
  onSaved,
}: {
  onClose: () => void;
  fieldMode?: boolean;
  initialProject?: string;
  fieldTaskId?: string;
  onSaved?: () => void;
}) {
  const t = useTranslations();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SafetyDraft>({
    ...EMPTY_DRAFT,
    project: initialProject,
  });
  const [locating, setLocating] = useState(false);
  const categories = useQuery({
    queryKey: ["safety-create-categories", draft.project],
    queryFn: () =>
      getProjectCategories({
        project: draft.project,
        is_active: true,
        page_size: 200,
      }),
    enabled: Boolean(draft.project),
  });
  const team = useQuery({
    queryKey: ["incident-recipient-options", draft.project],
    queryFn: () => getIncidentRecipientOptions(draft.project),
    enabled: Boolean(draft.project),
  });
  const selectableWorkers = team.data ?? [];
  const completedPhotos = completedFieldEvidence(draft.photos);
  const fieldEvidenceLabels = [
    t("safety.fieldEvidence.overview"),
    t("safety.fieldEvidence.detail"),
    t("safety.fieldEvidence.risk"),
    t("safety.fieldEvidence.surroundings"),
  ];

  function toggleRecipient(userId: string, checked: boolean) {
    setDraft((value) => ({
      ...value,
      notifyUsers: checked
        ? [...new Set([...value.notifyUsers, userId])]
        : value.notifyUsers.filter((id) => id !== userId),
    }));
  }

  const create = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Authentication required.");
      const payload: SafetyIncidentPayload & { client_event_id: string } = {
        project: draft.project,
        category: draft.category,
        title: draft.title.trim(),
        description: draft.description.trim(),
        severity: draft.severity,
        occurred_at: draft.occurredAt
          ? new Date(draft.occurredAt).toISOString()
          : undefined,
        latitude: draft.latitude,
        longitude: draft.longitude,
        photos: completedPhotos,
        notify_users: draft.notifyUsers,
        client_event_id: crypto.randomUUID(),
        field_task: fieldTaskId,
      };
      return submitSafetyIncidentOfflineAware(user.id, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["safety"] });
      onClose();
      onSaved?.();
    },
  });

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft((value) => ({
          ...value,
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
        }));
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const valid =
    draft.project !== "" &&
    draft.category !== "" &&
    draft.title.trim() !== "" &&
    completedPhotos.length >= (fieldMode ? FIELD_EVIDENCE_PHOTO_COUNT : 1) &&
    (!fieldMode || hasRequiredFieldEvidence(draft.photos)) &&
    Boolean(draft.latitude && draft.longitude) &&
    (!fieldMode || draft.notifyUsers.length > 0);

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
              onValueChange={(project) =>
                setDraft((value) => ({
                  ...value,
                  project,
                  category: "",
                  notifyUsers: [],
                }))
              }
              placeholder={t("safety.filter.project")}
              className="w-full"
            />
          </FieldWrapper>
          <FieldWrapper label={t("safety.field.category")} required className="sm:col-span-2">
            <Select
              value={draft.category || undefined}
              onValueChange={(categoryId) => {
                const category = categories.data?.results.find(
                  (item) => item.id === categoryId,
                );
                setDraft((value) => ({
                  ...value,
                  category: categoryId,
                  title: value.title.trim() || category?.name || "",
                }));
              }}
              disabled={!draft.project}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("safety.filter.selectCategory")} />
              </SelectTrigger>
              <SelectContent>
                {(categories.data?.results ?? []).map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("safety.field.title")} required className="sm:col-span-2">
            {fieldMode && (
              <div className="mb-3 grid grid-cols-2 gap-2">
                {["accident", "hazard", "damage", "other"].map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant={draft.title === t(`safety.fieldReport.preset.${preset}`) ? "default" : "outline"}
                    className="min-h-12"
                    onClick={() => setDraft((value) => ({ ...value, title: t(`safety.fieldReport.preset.${preset}`) }))}
                  >
                    {t(`safety.fieldReport.preset.${preset}`)}
                  </Button>
                ))}
              </div>
            )}
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
          <FieldWrapper label={t("safety.field.description")} optional={t("common.optional")} className="sm:col-span-2">
            <Textarea
              rows={4}
              value={draft.description}
              onChange={(event) =>
                setDraft((value) => ({ ...value, description: event.target.value }))
              }
            />
          </FieldWrapper>
          <FieldWrapper label={t("safety.field.photo")} required className="sm:col-span-2">
            {fieldMode ? (
              <FieldEvidenceGrid
                labels={fieldEvidenceLabels}
                files={draft.photos}
                progressLabel={t("safety.fieldEvidence.progress", {
                  current: completedPhotos.length,
                  required: FIELD_EVIDENCE_PHOTO_COUNT,
                })}
                onChange={(photos) => setDraft((value) => ({ ...value, photos }))}
              />
            ) : (
              <FieldCamera
                label={t("safety.field.photo")}
                fileCount={completedPhotos.length}
                onCapture={(photo) =>
                  setDraft((value) => ({
                    ...value,
                    photos: [photo],
                  }))
                }
                onClear={() => setDraft((value) => ({ ...value, photos: [] }))}
              />
            )}
          </FieldWrapper>
          <FieldWrapper label={t("safety.fieldReport.notifyPeople")} required={fieldMode} className="sm:col-span-2">
            <p className="mb-2 text-xs text-muted-foreground">{t("safety.fieldReport.supervisorAutomatic")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {selectableWorkers.map((row) => (
                <label key={row.id} className="flex min-h-12 items-center gap-3 rounded-lg border p-3">
                  <Checkbox checked={draft.notifyUsers.includes(row.id)} onCheckedChange={(checked) => toggleRecipient(row.id, checked === true)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.full_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.is_supervisor
                        ? `${row.role_name} / ${t("incidentReporting.supervisor")}`
                        : row.role_name}
                    </span>
                  </span>
                </label>
              ))}
              {!team.isLoading && selectableWorkers.length === 0 && <p className="text-sm text-muted-foreground">{t("safety.fieldReport.noWorkers")}</p>}
            </div>
          </FieldWrapper>
          <FieldWrapper label={t("safety.field.location")} required>
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
