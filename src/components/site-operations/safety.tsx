"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Camera,
  CheckCircle2,
  Loader2,
  LocateFixed,
  MessageSquare,
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
import { useClearDraft, useDraftState } from "@/components/field-staff/field-draft";
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
import { HazardConversationPanel } from "@/components/site-operations/hazard-conversation";
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
  submitSafetyIncidentOfflineAware,
  type SafetyIncidentSubmission,
} from "@/services/offline-sync.service";
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

const STATUSES: IncidentStatus[] = [
  "OPEN", "ASSIGNED", "RECTIFICATION_SUBMITTED", "RETURNED", "VERIFIED",
];

// SEVERITIES and SEVERITY_TONE removed with the grading (T-189). Left behind
// they would have been the kind of constant a later reader assumes is used.

/**
 * Why the browser could not place the worker, in a form they can act on.
 *
 * `GeolocationPositionError` has three codes and they need three different
 * responses: switch the permission back on, move somewhere a fix can arrive,
 * or simply try again. Collapsing them - or, as this screen used to, saying
 * nothing at all - leaves the worker pressing the same button forever.
 */
function locationFailure(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return "locationDenied";
  if (error.code === error.POSITION_UNAVAILABLE) return "locationUnavailable";
  return "locationTimeout";
}

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
  onRecordSaved?: (result: SafetyIncidentSubmission) => void;
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
  // Arrived from the home page's red 逾期 figure (U-029). Read from the URL and
  // passed straight to the API, which applies the same definition the figure
  // is counted with - a link that opened the whole list would make the number
  // above it decorative.
  const overdueOnly = searchParams.get("overdue") === "1";
  const [createOpen, setCreateOpen] = useState(Boolean(fieldTaskId) || searchParams.get("create") === "1");
  const [updating, setUpdating] = useState<SafetyIncident | null>(null);
  const [assigning, setAssigning] = useState<SafetyIncident | null>(null);
  const [submitting, setSubmitting] = useState<SafetyIncident | null>(null);
  const [reviewing, setReviewing] = useState<SafetyIncident | null>(null);
  // 「建筑商后台也是需要改」: the console takes part in the same conversation
  // the field app uses, rather than reading a summary of it.
  const [talking, setTalking] = useState<SafetyIncident | null>(null);
  const openedIncidentRef = useRef("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["safety", mode, list.query, overdueOnly],
    queryFn: () => getSafetyIncidents({
      ...list.query,
      workflow: mode === "rectification" ? "rectification" : undefined,
      overdue: overdueOnly ? "1" : undefined,
    }),
  });
  const focusedIncident = useQuery({
    queryKey: ["safety-incident", requestedIncidentId],
    queryFn: () => getSafetyIncident(requestedIncidentId!),
    enabled: Boolean(requestedIncidentId),
  });
  const selectedProject = list.filters.project ?? "all";
  const selectedCategory = list.filters.category ?? "all";
  const selectedResponsible = list.filters.responsible_person ?? "all";
  const filterCategories = useQuery({
    queryKey: ["safety-categories", selectedProject],
    /*
     * Both schemes, because this list shows history (D-172).
     *
     * Hazards reported from now on are filed under EHS columns. The ones
     * reported before it point at site-record columns and are still counted
     * there, so a filter offering only EHS would quietly make every older
     * hazard unfilterable by the column it is actually in.
     *
     * Some column filter is still required either way: with none at all the
     * screen offered the material columns, and the customer photographed a
     * hazard picker listing 钢筋, 混凝土, 洋灰 and the rest of the delivery
     * tree (F-236). The server reads FIELD as `kind__in=[FIELD, BOTH]`, so
     * the second call also picks up columns nobody has assigned yet.
     */
    queryFn: async () => {
      const project = selectedProject === "all" ? undefined : selectedProject;
      const [safety, legacy] = await Promise.all([
        getProjectCategories({
          project,
          is_active: true,
          kind: "EHS",
          page_size: 200,
        }),
        getProjectCategories({
          project,
          is_active: true,
          kind: "FIELD",
          page_size: 200,
        }),
      ]);
      return { ...safety, results: [...safety.results, ...legacy.results] };
    },
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
      // The severity column is gone: 「那些严重程度啊中等啊，高，低呀那些都不
      // 要」. The database column stays - hazards already filed carry a grade
      // and dropping it would rewrite history - and the export keeps it for
      // the same reason. What goes is asking for it and ranking by it.
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
          <div className="flex items-center justify-end gap-0.5">
            {can("safety.manage") && ["OPEN", "RETURNED"].includes(row.original.status) && (
              <Button variant="ghost" size="icon" className="h-7 w-7" title={t("safetyRectification.action.assign")} onClick={() => setAssigning(row.original)}><UserCheck className="h-4 w-4" /></Button>
            )}
            {can("safety.manage") && row.original.responsible_person === user?.id && ["ASSIGNED", "RETURNED"].includes(row.original.status) && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" title={t("safetyRectification.action.submit")} onClick={() => setSubmitting(row.original)}><Camera className="h-4 w-4" /></Button>
            )}
            {can("safety.verify") && row.original.status === "RECTIFICATION_SUBMITTED" && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-success" title={t("safetyRectification.action.review")} onClick={() => setReviewing(row.original)}><CheckCircle2 className="h-4 w-4" /></Button>
            )}
            {/* Always offered, including on an archived hazard: the record
                stays readable after closure - 「记录全部都要留着」 - and the
                panel itself is what refuses a new message. */}
            <Button variant="ghost" size="icon" className="h-7 w-7" title={t("hazard.conversationTitle")} onClick={() => setTalking(row.original)}><MessageSquare className="h-4 w-4" /></Button>
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
            {/* No longer gated on the mode. 安全事故 is being removed from
                the console at the customer's request, which makes this screen
                the only place a hazard can be raised - and the button lived
                on the half being deleted (F-240). */}
            {can("safety.manage") && (
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
        {/* Severity filter removed with the column (T-189). */}
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
            <article key={incident.id} className="rounded-lg border bg-card shadow-sm">
              {/*
                The whole card opens the room (D-167). It used to be a plain
                block with one button on it, and that button only appeared for
                the person assigned to fix the hazard - so the worker who
                reported it could look at their own card and had no way in
                (F-375). A real button rather than a click handler on the
                article: it has to be reachable from the keyboard and announce
                itself, and the 提交整改 action stays outside it because a
                button cannot be nested inside a button.
              */}
              <button
                type="button"
                onClick={() => setTalking(incident)}
                aria-label={t("hazard.conversationTitle")}
                className="flex w-full items-start gap-3 rounded-lg p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning"><ShieldAlert /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{incident.title}</p>
                    <StatusBadge label={t(`safetyRectification.status.${incident.status}`)} tone={STATUS_TONE[incident.status]} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{incident.project_name} · {df.dateTime(incident.occurred_at)}</p>
                  {incident.notified_user_names.length > 0 && <p className="mt-2 text-sm">{t("safety.fieldReport.sentTo", { names: incident.notified_user_names.join(", ") })}</p>}
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary"><MessageSquare className="size-4" />{t("hazard.conversationTitle")}</p>
                </div>
              </button>
              {incident.responsible_person === user?.id && ["ASSIGNED", "RETURNED"].includes(incident.status) && (
                <div className="px-4 pb-4">
                  <Button className="w-full min-h-11" onClick={() => setSubmitting(incident)}><Camera />{t("safetyRectification.action.submit")}</Button>
                </div>
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

      {createOpen && <SafetyCreateDialog fieldMode={fieldMode} initialProject={initialProject} fieldTaskId={fieldTaskId} onSaved={(result) => {
        if (result.status === "uploaded" && !fieldMode) setTalking(result.incident);
        onRecordSaved?.(result);
      }} onClose={() => setCreateOpen(false)} />}
      {updating && (
        <SafetyStatusDialog incident={updating} onClose={() => setUpdating(null)} />
      )}
      {assigning && <SafetyAssignDialog incident={assigning} onClose={() => setAssigning(null)} />}
      {submitting && <SafetySubmitDialog incident={submitting} onClose={() => setSubmitting(null)} />}
      {reviewing && <SafetyReviewDialog incident={reviewing} onClose={() => setReviewing(null)} />}
      {talking && (
        <Dialog open onOpenChange={(open) => !open && setTalking(null)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{talking.incident_no}</DialogTitle>
              <DialogDescription>
                {talking.responsible_person_name || t("hazard.unassigned")}
              </DialogDescription>
            </DialogHeader>
            <HazardConversationPanel incidentId={talking.id} />
          </DialogContent>
        </Dialog>
      )}
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
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("assign.title")}</DialogTitle><DialogDescription>{t("assign.description", { incident: incident.incident_no })}</DialogDescription></DialogHeader><FieldWrapper label={t("field.responsible")} required><Select value={person || undefined} onValueChange={setPerson}><SelectTrigger className="w-full"><SelectValue placeholder={t("field.selectResponsible")} /></SelectTrigger><SelectContent>{(team.data?.results ?? []).map((row) => <SelectItem key={row.user} value={row.user}>{row.user_name}</SelectItem>)}</SelectContent></Select></FieldWrapper><FieldWrapper label={t("field.dueAt")} required><Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.instructions")}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></FieldWrapper><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[person, t("field.responsible")], [dueAt, t("field.dueAt")]]} disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <UserCheck />}{t("action.assign")}</Button></DialogFooter></DialogContent></Dialog>;
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
          <Button requires={[[images.length >= (fieldMode ? FIELD_EVIDENCE_PHOTO_COUNT : 1) && (!fieldMode || hasRequiredFieldEvidence(fieldEvidence)), t("field.verificationPhoto")], [location, t("field.location")], [fieldMode || note, t("field.workDone")]]} disabled={save.isPending} onClick={() => save.mutate()}>
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
          <FieldCamera label={t("field.verificationPhoto")} file={image} fileCount={image ? 1 : 0} onCapture={setImage} onClear={() => { setImage(undefined); setLocation(null); }} />
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
          <Button requires={[[decision !== "RETURNED" || note, t("field.reviewNote")], [!image || location, t("field.location")]]} disabled={save.isPending} onClick={() => save.mutate()}>
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
  onSaved?: (result: SafetyIncidentSubmission) => void;
}) {
  const t = useTranslations();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useDraftState<SafetyDraft>("draft", {
    ...EMPTY_DRAFT,
    project: initialProject,
  });
  const clearDraft = useClearDraft();
  /*
   * Whether this device can place the worker at all.
   *
   * Read during render rather than written from the effect below: React
   * refuses a synchronous setState in an effect body, and rightly - the
   * answer never changes while the form is open, so storing it would be a
   * second copy of a constant. Unknown counts as supported, because on the
   * server there is no `navigator` and the honest default is not to accuse
   * the device of something before it has had a chance to answer.
   */
  const supportsLocation =
    typeof navigator === "undefined" || Boolean(navigator.geolocation);
  const [locating, setLocating] = useState(fieldMode && supportsLocation);
  const [locationError, setLocationError] = useState("");
  const categories = useQuery({
    queryKey: ["safety-create-categories", draft.project],
    queryFn: () =>
      getProjectCategories({
        project: draft.project,
        is_active: true,
        // Safety columns, and only those (D-172). This read is what makes the
        // EHS module exist at all: it was declared in the backend's
        // `CATEGORY_RECORD_RELATIONS`, listed in category management, and
        // consumed by nothing, so a site could create a safety column that was
        // guaranteed to stay at zero records for ever (F-380). New hazards go
        // here; the filter above still offers the old site-record columns so
        // the ones already filed there stay findable.
        kind: "EHS",
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
        // Omitted rather than sent blank: "" reaches the serializer as a
        // malformed UUID, so a hazard with no column would be refused for
        // having one.
        category: draft.category || undefined,
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
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["safety"] });
      clearDraft();
      onClose();
      onSaved?.(result);
    },
  });

  function locate() {
    if (!navigator.geolocation) {
      setLocationError(t("safety.form.locationUnsupported"));
      return;
    }
    setLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft((value) => ({
          ...value,
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
        }));
        setLocating(false);
        setLocationError("");
      },
      (error) => {
        setLocating(false);
        setLocationError(t(`safety.form.${locationFailure(error)}`));
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  useEffect(() => {
    if (!fieldMode || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft((value) => ({
          ...value,
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
        }));
        setLocating(false);
        setLocationError("");
      },
      // The automatic attempt says why it failed, exactly as the button does.
      // This callback used to be `() => setLocating(false)`: the grey line
      // vanished, the submit button went on requiring coordinates, and
      // nothing on the screen connected the two (F-376).
      (error) => {
        setLocating(false);
        setLocationError(t(`safety.form.${locationFailure(error)}`));
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldMode]);

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
          {/* The column is the back office's filing scheme, and asking a
              worker which one a loose scaffold board belongs to is the same
              question the customer objected to on the 拍照 screen. The console
              still files hazards into columns; the phone no longer asks. */}
          {!fieldMode && (
          <FieldWrapper label={t("safety.field.category")} optional={t("common.optional")} className="sm:col-span-2">
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
            {/* An empty picker that does not say why it is empty is the shell
                this task exists to remove: until D-172 nothing in the product
                read EHS columns, so a site would have none. Say where they
                come from rather than showing a dropdown with nothing in it. */}
            {draft.project &&
              !categories.isLoading &&
              (categories.data?.results ?? []).length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("safety.form.noSafetyColumns")}
                </p>
              )}
          </FieldWrapper>
          )}

          {/* Title, the four presets, severity and the time: all off the
              phone. The presets were 发生事故／发现危险／设备损坏／其他事项 and
              the customer's answer to the first two was 「不需要」; the title is
              written by the server; and asking somebody to grade a hazard
              高／中／低 before they can report it was the thing standing between
              them and reporting it at all. Every one of them stays here for
              the console, which is where they are actually used. */}
          {!fieldMode && (
          <FieldWrapper label={t("safety.field.title")} required className="sm:col-span-2">
            <Input
              value={draft.title}
              onChange={(event) =>
                setDraft((value) => ({ ...value, title: event.target.value }))
              }
            />
          </FieldWrapper>
          )}
          {/* Not on the console either. 「都不要」 was the whole answer, not
              「手机上不要」, so nobody is asked to grade a hazard. New hazards
              take the model's default and the field survives only to keep the
              ones already filed readable. */}
          {!fieldMode && (
          <FieldWrapper label={t("safety.field.occurredAt")} optional={t("common.optional")}>
            <Input
              type="datetime-local"
              value={draft.occurredAt}
              onChange={(event) =>
                setDraft((value) => ({ ...value, occurredAt: event.target.value }))
              }
            />
          </FieldWrapper>
          )}
          {!fieldMode && <FieldWrapper label={t("safety.field.description")} optional={t("common.optional")} className="sm:col-span-2">
            <Textarea
              rows={4}
              value={draft.description}
              onChange={(event) =>
                setDraft((value) => ({ ...value, description: event.target.value }))
              }
            />
          </FieldWrapper>}
          <FieldWrapper label={t("safety.field.photo")} required className="sm:col-span-2">
            {/*
              One grid for both modes (D-171).

              The office form used to be a single camera whose handler wrote
              `photos: [photo]`, so the second photograph replaced the first
              and a hazard raised from the office reached its conversation with
              exactly one picture no matter how many were taken (F-379). The
              customer saw one photograph in a room where four had been taken
              and reported it as a chat-room bug; the backend had been writing
              one message per photograph all along.

              What does not change is how many are *required*: field mode still
              asks for all four, the office for one. Somebody entering a hazard
              after the fact may only have the one photograph that was sent to
              them, and raising the floor here would close that door.
            */}
            <FieldEvidenceGrid
              labels={fieldEvidenceLabels}
              files={draft.photos}
              progressLabel={t(
                fieldMode
                  ? "safety.fieldEvidence.progress"
                  : "safety.fieldEvidence.progressOffice",
                {
                  current: completedPhotos.length,
                  required: FIELD_EVIDENCE_PHOTO_COUNT,
                },
              )}
              onChange={(photos) => setDraft((value) => ({ ...value, photos }))}
            />
          </FieldWrapper>
          {/* 「知道由谁处理就当场指定，不知道就直接提交」. Required used to be
              true here in field mode, which turned step 2 of the customer's
              flow into a wall: a worker who does not know who fixes scaffold
              could not report the scaffold. Unnamed hazards land in 待分配 and
              a supervisor claims them. */}
          <FieldWrapper label={t("safety.fieldReport.notifyPeople")} optional={t("common.optional")} className="sm:col-span-2">
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
          {/*
            The GPS control, in both modes now (D-168). Field mode used to have
            no button at all - only 「获取 GPS」 rendered as a grey line that
            appeared while locating and disappeared whether the fix arrived or
            not, while the submit button below went on requiring coordinates.
            A worker whose first attempt failed was left with an unpressable
            「上报隐患」 and nothing on the screen saying why (F-376).
          */}
          <FieldWrapper label={t("safety.field.location")} required className={fieldMode ? "sm:col-span-2" : undefined}>
            <Button
              type="button"
              variant="outline"
              className="w-full min-h-11"
              disabled={locating || !supportsLocation}
              disabledReason={
                supportsLocation
                  ? t("safety.form.locating")
                  : t("safety.form.locationUnsupported")
              }
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
            {(locationError || !supportsLocation) && (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {locationError || t("safety.form.locationUnsupported")}
              </p>
            )}
          </FieldWrapper>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {/* On the phone the list is two long: the photos, and the GPS the
              app captures itself. Column, title, severity and a named person
              were all in here, and each one was a way for the button to stay
              grey at somebody who had already photographed the hazard. */}
          <Button requires={fieldMode
            ? [[completedPhotos.length >= FIELD_EVIDENCE_PHOTO_COUNT && hasRequiredFieldEvidence(draft.photos), t("safety.field.photo")], [draft.project, t("safety.field.project")], [draft.latitude && draft.longitude, t("safety.field.location")]]
            : [[draft.project, t("safety.field.project")], [draft.title, t("safety.field.title")], [completedPhotos.length >= 1, t("safety.field.photo")], [draft.latitude && draft.longitude, t("safety.field.location")]]} disabled={create.isPending} onClick={() => create.mutate()}>
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
          <Button requires={[[status !== "RESOLVED" || note, t("safety.field.resolutionNote")]]} disabled={update.isPending} onClick={() => update.mutate()}>
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
