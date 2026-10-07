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
  UserCheck,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LocationField } from "@/components/field-staff/location-field";
import { useAuth } from "@/components/providers/auth-provider";
import { useClearDraft, useDraftState } from "@/components/field-staff/field-draft";
import {
  completedFieldEvidence,
  createEmptyFieldEvidence,
  FIELD_EVIDENCE_PHOTO_COUNT,
  FieldEvidenceGrid,
  hasRequiredFieldEvidence,
} from "@/components/field-staff/field-evidence-grid";
import { PhotoThumb, rowPhotos } from "@/components/shared/photo-thumb";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { RecordNo } from "@/components/shared/record-no";
import { ExportButton } from "@/components/shared/export-button";
import { RecordExportButton } from "@/components/shared/record-export-button";
import { FieldCamera } from "@/components/shared/field-camera";
import {
  FieldWrapper,
  ListHeader,
  QueryFailedNote,
  ReadField,
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
import { useClearSearchParam } from "@/hooks/use-url-selection";
import type {
  HazardPhoto,
  IncidentSeverity,
  IncidentStatus,
  SafetyIncident,
  SafetyIncidentPayload,
} from "@/interfaces/site-operations";
import type { LocationFix } from "@/lib/field-location";
import { useDateFormat } from "@/lib/dates";
import {
  submitSafetyIncidentOfflineAware,
  type SafetyIncidentSubmission,
} from "@/services/offline-sync.service";
import { DrillNote } from "@/components/shared/drill-note";
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

// Open or being looked into - never closed here. X8: only the raiser's
// confirm closes a hazard; the server refuses RESOLVED from this dialog.
const MANUAL_STATUSES: IncidentStatus[] = ["OPEN", "INVESTIGATING"];

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

/** The 施工准证申请 column every project starts with (C20). */
const PERMIT_COLUMN_CODE = "HZD-PERMIT";
/**
 * 「VO 不在手机 EHS，也不叫『整改 VO』」 (E07). The seeded column was switched
 * off on the server; the phone never offers it even if a site turns it back on.
 */
const RETIRED_VO_COLUMN_CODE = "HZD-VO";

export function isPermit(incident: SafetyIncident): boolean {
  return incident.record_type === "PERMIT";
}

/**
 * Who closes this item, in words (B21, X8): its raiser, the safety leads for a
 * permit, or - on an item raised before the rule - any verifier.
 */
export function confirmerLabel(
  incident: SafetyIncident,
  te: (key: string) => string,
): string {
  if (incident.confirmer_name) return incident.confirmer_name;
  return te(isPermit(incident) ? "confirmer.safetyLeads" : "confirmer.legacy");
}

/**
 * Whose move it is on an open item, in words, for the office list (C3): the
 * rectifier while it is being fixed, the confirmer once it is handed in.
 * Nothing for an item waiting to be assigned (its status says so) or closed.
 */
export function nextActor(
  incident: SafetyIncident,
  te: (key: string, values?: Record<string, string>) => string,
): string {
  if (["ASSIGNED", "RETURNED"].includes(incident.status) && incident.responsible_person_name) {
    return te("phone.rectifierLine", { name: incident.responsible_person_name });
  }
  if (incident.status === "RECTIFICATION_SUBMITTED") {
    return te("phone.confirmerLine", { name: confirmerLabel(incident, te) });
  }
  return "";
}

export const STATUS_TONE: Record<
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
  /** 上报 → 指派 in one step (B22); empty leaves it 待分配. */
  rectifier?: string;
  rectifierDueAt?: string;
  /** A permit's other pages (C20). */
  attachments?: File[];
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
  rectifier: "",
  rectifierDueAt: "",
  attachments: [],
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
  const te = useTranslations("ehs");
  const df = useDateFormat();
  const { can, user } = useAuth();
  // 顾问发起 (B21, B22): a consultant raises a rectification, and assigns the
  // ones they raised, without holding safety.manage.
  const isConsultant = user?.account_type === "CONSULTANT";
  const mayRaise = can("safety.manage") || isConsultant;
  const userId = user?.id;
  const mayAssign = useCallback(
    (incident: SafetyIncident) =>
      !isPermit(incident) &&
      !incident.responsible_person &&
      ["OPEN", "RETURNED"].includes(incident.status) &&
      (can("safety.manage") ||
        (incident.origin === "CONSULTANT" && incident.created_by === userId)),
    [can, userId],
  );
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
  // The dashboard's 「待处理整改 / EHS」 card (C15, B8): the items this reader
  // moves on next - assign, rectify or confirm - as the card counted them.
  const waitingForMe = searchParams.get("waiting") === "me";
  // Kept in the draft, so tapping this 挂号 again reopens the form it was in
  // (D-259). Outside a draft (the office) this is ordinary state.
  const [createOpen, setCreateOpen] = useDraftState("open:createIncident", Boolean(fieldTaskId) || searchParams.get("create") === "1");
  const [updating, setUpdating] = useState<SafetyIncident | null>(null);
  const [assigning, setAssigning] = useState<SafetyIncident | null>(null);
  const [submitting, setSubmitting] = useState<SafetyIncident | null>(null);
  const [reviewing, setReviewing] = useState<SafetyIncident | null>(null);
  // 「建筑商后台也是需要改」: the console takes part in the same conversation
  // the field app uses, rather than reading a summary of it.
  const [talking, setTalking] = useState<SafetyIncident | null>(null);
  /*
   * The detail drawer the whole row opens (T-304).
   *
   * 客户第 26 条的抱怨是找不到动作 —— 它们是一行最右边的一串小图标，看起来像
   * 装饰。图标保留给鼠标熟练的人，但真正的入口是整行可点，抽屉里的按钮带字。
   */
  const [opened, setOpened] = useState<SafetyIncident | null>(null);
  const openedIncidentRef = useRef("");
  const clearIncidentParam = useClearSearchParam("incident");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["safety", mode, list.query, overdueOnly, waitingForMe],
    queryFn: () => getSafetyIncidents({
      ...list.query,
      workflow: mode === "rectification" ? "rectification" : undefined,
      involving: fieldMode ? "me" : undefined,
      overdue: overdueOnly ? "1" : undefined,
      waiting: waitingForMe ? "me" : undefined,
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

  // Once the link's incident has opened, the parameter comes back out of the
  // URL, so clicking the same task card again is a change this page sees.
  useEffect(() => {
    if (!requestedIncidentId) openedIncidentRef.current = "";
  }, [requestedIncidentId]);

  useEffect(() => {
    const incident = focusedIncident.data;
    if (!incident || incident.id !== requestedIncidentId) return;
    if (openedIncidentRef.current === incident.id) return;
    const timer = window.setTimeout(() => {
      // Marked inside the timer: a re-render that cancels it must not leave
      // the incident marked as opened when nothing opened.
      openedIncidentRef.current = incident.id;
      // The server says whether this reader is the one confirmer (B21);
      // holding safety.verify no longer makes somebody it.
      if (incident.can_confirm) {
        setReviewing(incident);
      } else if (
        incident.responsible_person === user?.id &&
        !isPermit(incident) &&
        ["ASSIGNED", "RETURNED"].includes(incident.status)
      ) {
        setSubmitting(incident);
      } else if (mayAssign(incident)) {
        setAssigning(incident);
      } else {
        // Nothing for this person to do on it (a reviewer with only verify
        // permission, say): show the incident itself rather than nothing.
        setOpened(incident);
      }
      clearIncidentParam();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [clearIncidentParam, focusedIncident.data, mayAssign, requestedIncidentId, user?.id]);

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
            {/* Short number big, project small (2026-10 D4). */}
            <RecordNo value={row.original.incident_no} className="text-xs" />
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
              {isPermit(row.original) && (
                <span className="mr-1.5 rounded bg-info/10 px-1.5 py-0.5 text-xs font-medium text-info">
                  {te("permit.badge")}
                </span>
              )}
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
        // Plain words, not a coloured tag (C3: 「不要增加一堆「待处理 / 整改中 /
        // 待验收」状态…整个页面就很干净」): where it stands, and whose move it is.
        cell: ({ row }) => {
          const waitingOn = nextActor(row.original, te);
          return (
            <div className="min-w-0">
              <p className="whitespace-nowrap">{t(`safetyRectification.status.${row.original.status}`)}</p>
              {waitingOn && (
                <p className="max-w-[160px] truncate text-xs text-muted-foreground">{waitingOn}</p>
              )}
            </div>
          );
        },
      },
      {
        id: "evidence",
        meta: { label: t("safety.field.evidence") },
        header: () => t("safety.field.evidence"),
        // The hazard's photograph (E3), opened on click with every photo of
        // it; the pin says it was located.
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <PhotoThumb
              coverUrl={row.original.cover_photo_url}
              count={row.original.photo_count}
              icon={ShieldAlert}
              reference={row.original.incident_no}
              photos={rowPhotos(
                [
                  ...(row.original.initial_evidence ?? []),
                  ...(row.original.rectification_evidence ?? []),
                ],
                row.original.incident_no,
              )}
            />
            {row.original.latitude && (
              <LocateFixed
                className="h-4 w-4 shrink-0 text-success"
                aria-label={t("safety.evidence.location")}
              />
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
            {mayAssign(row.original) && (
              <Button variant="ghost" size="icon" className="h-7 w-7" title={t("safetyRectification.action.assign")} onClick={() => setAssigning(row.original)}><UserCheck className="h-4 w-4" /></Button>
            )}
            {row.original.responsible_person === user?.id && !isPermit(row.original) && ["ASSIGNED", "RETURNED"].includes(row.original.status) && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" title={t("safetyRectification.action.submit")} onClick={() => setSubmitting(row.original)}><Camera className="h-4 w-4" /></Button>
            )}
            {/* Only the one confirmer (B21) - the server's answer, not a
                permission check that every supervisor would pass. */}
            {row.original.can_confirm && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-success" title={t(isPermit(row.original) ? "ehs.permit.approve" : "safetyRectification.action.review")} onClick={() => setReviewing(row.original)}><CheckCircle2 className="h-4 w-4" /></Button>
            )}
            {/* Always offered, including on an archived hazard: the record
                stays readable after closure - 「记录全部都要留着」 - and the
                panel itself is what refuses a new message. */}
            <Button variant="ghost" size="icon" className="h-7 w-7" title={t("hazard.conversationTitle")} onClick={() => setTalking(row.original)}><MessageSquare className="h-4 w-4" /></Button>
            {can("safety.manage") && !isPermit(row.original) && !row.original.responsible_person && ["OPEN", "INVESTIGATING"].includes(row.original.status) && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title={t("safety.action.updateStatus")} onClick={() => setUpdating(row.original)}><SlidersHorizontal className="h-3.5 w-3.5" /></Button>
            )}
          </div>
        ),
      },
    ],
    [t, te, df, can, mayAssign, user?.id],
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
            {mayRaise && (
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
        {!fieldMode && (
          <QueryFailedNote className="w-full" query={filterCategories} what={t("safety.what.categories")} />
        )}
        {!fieldMode && selectedProject !== "all" && (
          <QueryFailedNote className="w-full" query={responsiblePeople} what={t("safety.what.responsiblePeople")} />
        )}
      </div>
      <QueryFailedNote query={focusedIncident} what={t("safety.what.requestedIncident")} />
      {!fieldMode && waitingForMe && (
        <DrillNote
          label={t("safety.drill.waitingForMe")}
          clearLabel={t("safety.drill.showAll")}
          params={["waiting"]}
        />
      )}
      {!fieldMode && overdueOnly && (
        <DrillNote
          label={t("safety.drill.overdue")}
          clearLabel={t("safety.drill.showAll")}
          params={["overdue"]}
        />
      )}

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
                {/* The hazard's photograph on the left (E3); the icon when it has none. */}
                <PhotoThumb
                  coverUrl={incident.cover_photo_url}
                  count={incident.photo_count}
                  icon={ShieldAlert}
                  reference={incident.incident_no}
                  openable={false}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{incident.title}</p>
                    {isPermit(incident) && <StatusBadge label={te("permit.badge")} tone="info" />}
                    <StatusBadge label={t(`safetyRectification.status.${incident.status}`)} tone={STATUS_TONE[incident.status]} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{incident.project_name} · {df.dateTime(incident.occurred_at)}</p>
                  {incident.notified_user_names.length > 0 && <p className="mt-2 text-sm">{t("safety.fieldReport.sentTo", { names: incident.notified_user_names.join(", ") })}</p>}
                  {incident.responsible_person_name && <p className="mt-1 text-sm">{te("phone.rectifierLine", { name: incident.responsible_person_name })}</p>}
                  <p className="mt-1 text-sm">{te("phone.confirmerLine", { name: confirmerLabel(incident, te) })}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary"><MessageSquare className="size-4" />{t("hazard.conversationTitle")}</p>
                </div>
              </button>
              {incident.responsible_person === user?.id && !isPermit(incident) && ["ASSIGNED", "RETURNED"].includes(incident.status) && (
                <div className="px-4 pb-4">
                  <Button className="w-full min-h-11" onClick={() => setSubmitting(incident)}><Camera />{t("safetyRectification.action.submit")}</Button>
                </div>
              )}
              {/* The confirm entry follows the confirmer to the end they use
                  (B21): a worker named to confirm does it from here. */}
              {incident.can_confirm && (
                <div className="px-4 pb-4">
                  <Button className="w-full min-h-11" onClick={() => setReviewing(incident)}><CheckCircle2 />{t(isPermit(incident) ? "ehs.permit.approve" : "ehs.phone.confirm")}</Button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : <DataTable
        columns={columns}
        onRowClick={setOpened}
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
      {/*
        Two buttons, and D-213 is why there are only two.

        「隐患后台**只保留【沟通】和【验收确认】**。【整改】只是状态不是操作
        按钮；整改完成由现场手机端直接上传照片和备注回传；后台认为整改不可接受
        就用【沟通】说明原因，事项保持未完成、不闭环。」

        So there is deliberately no 【退回】 here: sending a rectification back
        is expressed by *not* confirming it and saying why in the conversation.
        Adding a Return button would invent a state transition the customer
        removed, and give the office two ways to mean the same thing.
      */}
      {opened && (
        <Dialog open onOpenChange={(open) => !open && setOpened(null)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
            {/* 「单独导出」 top right (T-386), clear of the close X. */}
            <DialogHeader className="flex-row items-start justify-between gap-4 space-y-0 pr-8">
              <div className="min-w-0 space-y-2">
                <DialogTitle>{opened.incident_no}</DialogTitle>
                <DialogDescription>{opened.title}</DialogDescription>
              </div>
              <div className="shrink-0">
                <RecordExportButton
                  kind="HAZARD"
                  recordId={opened.id}
                  reference={opened.incident_no}
                />
              </div>
            </DialogHeader>
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
              <ReadField
                label={t("safety.field.status")}
                value={t(`safetyRectification.status.${opened.status}`)}
              />
              <ReadField
                label={t("safetyRectification.field.responsible")}
                value={opened.responsible_person_name || t("hazard.unassigned")}
              />
              <ReadField
                label={t("safety.field.project")}
                value={opened.project_name}
              />
              <ReadField
                label={t("safety.field.occurredAt")}
                value={df.dateTime(opened.occurred_at)}
              />
              {opened.origin && (
                <ReadField
                  label={te("field.origin")}
                  value={te(`origin.${opened.origin}`)}
                />
              )}
              <ReadField
                label={te("field.raisedBy")}
                value={[opened.photographer_name, opened.created_by_title]
                  .filter(Boolean)
                  .join(" · ") || t("common.emptyValue")}
              />
              <ReadField
                label={te("field.confirmer")}
                value={confirmerLabel(opened, te)}
              />
              {opened.verified_at && opened.status === "VERIFIED" && (
                <ReadField
                  label={te("field.confirmedBy")}
                  value={[
                    opened.verified_by_name,
                    opened.verified_by_title,
                    df.dateTime(opened.verified_at),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              )}
            </div>
            <HazardPhotoGroups incident={opened} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  setTalking(opened);
                  setOpened(null);
                }}
              >
                <MessageSquare />
                {t("hazard.conversationTitle")}
              </Button>
              {opened.can_confirm && (
                <Button
                  className="min-h-11"
                  onClick={() => {
                    setReviewing(opened);
                    setOpened(null);
                  }}
                >
                  <CheckCircle2 />
                  {t(isPermit(opened) ? "ehs.permit.approve" : "safetyRectification.action.review")}
                </Button>
              )}
              {/* Assignment stays, and it is not a third rectification action:
                  it decides *who* is responsible, which is what feeds the
                  「指派给我的隐患整改」 pile in My Tasks (T-285). Without it that
                  pile would have no source. */}
              {mayAssign(opened) && (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => {
                      setAssigning(opened);
                      setOpened(null);
                    }}
                  >
                    <UserCheck />
                    {t("safetyRectification.action.assign")}
                  </Button>
                )}
            </div>
          </DialogContent>
        </Dialog>
      )}
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
  const { user } = useAuth();
  // A consultant assigns what they raised (B22) but cannot read the project's
  // staff list; the hazard contact list is the one their grant opens.
  const isConsultant = user?.account_type === "CONSULTANT";
  const team = useQuery({
    queryKey: ["project-assignments", incident.project, "safety", isConsultant],
    queryFn: async () =>
      isConsultant
        ? {
            results: (await getIncidentRecipientOptions(incident.project)).map((row) => ({
              user: row.id,
              user_name: row.full_name,
            })),
          }
        : getProjectAssignments(incident.project),
  });
  const [person, setPerson] = useState(incident.responsible_person ?? "");
  const [dueAt, setDueAt] = useState(incident.rectification_due_at ? incident.rectification_due_at.slice(0, 16) : "");
  const [note, setNote] = useState(incident.rectification_note);
  const te = useTranslations("ehs");
  // X8 (2026-10): 「整改完成后，由原发起人确认完成」 - whoever raised it confirms
  // it, wherever it was raised, so the confirmer is only shown here. And
  // 「整改执行人不能自己确认」: the raiser cannot be the one fixing it, caught
  // here rather than by the server's refusal.
  const sameAsConfirmer = Boolean(person) && person === incident.confirmer;
  const save = useMutation({
    mutationFn: () =>
      assignSafetyRectification(incident.id, {
        responsible_person: person,
        due_at: new Date(dueAt).toISOString(),
        note,
      }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["safety"] }); onClose(); },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("assign.title")}</DialogTitle>
          <DialogDescription>{t("assign.description", { incident: incident.incident_no })}</DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("field.responsible")} required>
          <Select value={person || undefined} onValueChange={setPerson}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t("field.selectResponsible")} /></SelectTrigger>
            <SelectContent>{(team.data?.results ?? []).map((row) => <SelectItem key={row.user} value={row.user}>{row.user_name}</SelectItem>)}</SelectContent>
          </Select>
          <QueryFailedNote query={team} what={t("what.team")} />
        </FieldWrapper>
        <FieldWrapper label={t("field.dueAt")} required>
          <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={te("field.confirmer")}>
          <p className="text-sm">{confirmerLabel(incident, te)}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">{te("form.confirmerHint")}</p>
          {sameAsConfirmer && <p role="alert" className="mt-1.5 text-xs text-destructive">{te("form.confirmerConflict")}</p>}
        </FieldWrapper>
        <FieldWrapper label={t("field.instructions")}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </FieldWrapper>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button>
          <Button requires={[[person, t("field.responsible")], [dueAt, t("field.dueAt")], [!sameAsConfirmer, t("field.responsible")]]} disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <UserCheck />}{t("action.assign")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SafetySubmitDialog({ incident, onClose }: { incident: SafetyIncident; onClose: () => void }) {
  const t = useTranslations("safetyRectification");
  const qc = useQueryClient();
  const { user } = useAuth();
  const fieldMode = Boolean(user?.is_field_staff);
  const [fieldEvidence, setFieldEvidence] = useState(createEmptyFieldEvidence);
  const [officeImages, setOfficeImages] = useState<File[]>([]);
  const [note, setNote] = useState("");
  // Automatic, like every field capture form (T-355, D-246).
  const [location, setLocation] = useState<LocationFix | null>(null);
  const images = fieldMode ? completedFieldEvidence(fieldEvidence) : officeImages;
  const evidenceLabels = [
    t("evidence.before"),
    t("evidence.completed"),
    t("evidence.detail"),
    t("evidence.surroundings"),
  ];
  const save = useMutation({ mutationFn: () => submitSafetyRectification(incident.id, { images, note, captured_at: new Date().toISOString(), latitude: location?.latitude, longitude: location?.longitude, accuracy_m: location?.accuracy, device_id: fieldMode ? getOrCreateFieldDeviceId() : undefined, client_event_id: crypto.randomUUID() }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["safety"] }); void qc.invalidateQueries({ queryKey: ["hazard-conversation", incident.id] }); onClose(); } });
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
        <LocationField
          label={t("field.location")}
          actionLabel={t("action.getLocation")}
          readyLabel={t("action.locationReady")}
          value={location}
          onChange={setLocation}
          required
        />
        {/* Required on the phone too. 「提交整改」 without a word of
            explanation leaves the verifier a photograph and nothing to read
            it against, which is what the customer asked to stop. */}
        <FieldWrapper label={t("field.workDone")} required>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </FieldWrapper>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button>
          <Button requires={[[images.length >= (fieldMode ? FIELD_EVIDENCE_PHOTO_COUNT : 1) && (!fieldMode || hasRequiredFieldEvidence(fieldEvidence)), t("field.photo")], [location, t("field.location")], [note, t("field.workDone")]]} disabled={save.isPending} onClick={() => save.mutate()}>
            <Camera />
            {t("action.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Confirming a rectification. There is no "return" here, and that is D-213.
 *
 * 「隐患后台**只保留【沟通】和【验收确认】**…后台认为整改不可接受就用【沟通】
 * 说明原因，事项保持未完成、不闭环。」
 *
 * So the office's way of refusing a rectification is to *not* confirm it and
 * say why in the conversation. The previous version offered Verify and Return
 * side by side, which gave the same intention two expressions: one that leaves
 * a reason somebody can read in context, and one that sets a status and moves
 * on. The conversation is the one the customer wants kept.
 *
 * `RETURNED` stays in the API and in the status vocabulary - hazards already
 * in it still render, and nothing about their history changes. What went is
 * the button that puts a new one there.
 */
export function SafetyReviewDialog({ incident, onClose }: { incident: SafetyIncident; onClose: () => void }) {
  const t = useTranslations("safetyRectification");
  const te = useTranslations("ehs");
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const permit = isPermit(incident);
  const save = useMutation({ mutationFn: () => reviewSafetyRectification(incident.id, { decision: "VERIFIED", note }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["safety"] }); void qc.invalidateQueries({ queryKey: ["hazard-conversation", incident.id] }); onClose(); } });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{permit ? te("permit.approveTitle") : t("review.title")}</DialogTitle>
          <DialogDescription>
            {permit
              ? te("permit.approveDescription", { incident: incident.incident_no })
              : t("review.description", { incident: incident.incident_no })}
          </DialogDescription>
        </DialogHeader>
        <HazardPhotoGroups incident={incident} />
        <p className="rounded-lg border border-info/25 bg-info/5 p-3 text-sm leading-6">
          {permit ? te("permit.refuseInstead") : t("review.refuseInstead")}
        </p>
        <FieldWrapper label={t("field.reviewNote")}>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </FieldWrapper>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            <CheckCircle2 />
            {permit ? te("permit.approve") : t("action.verify")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 整改前 / 中 / 后 in one place (B20): what raised it, the progress photos
 * said in its room, and what the rectifier submitted. A permit's form is its
 * "before"; it has no after.
 */
function HazardPhotoGroups({ incident }: { incident: SafetyIncident }) {
  const te = useTranslations("ehs");
  const groups: NonNullable<SafetyIncident["photo_groups"]> = incident.photo_groups ?? {
    before: incident.initial_evidence ?? [],
    during: [],
    after: incident.rectification_evidence.filter((item) => item.kind === "RECTIFICATION"),
  };
  const rows: Array<["before" | "during" | "after", HazardPhoto[]]> = [
    ["before", groups.before],
    ["during", groups.during],
    ["after", groups.after],
  ];
  return (
    <div className="grid gap-3" data-testid="hazard-photo-groups">
      {rows
        .filter(([key, photos]) => !(isPermit(incident) && key !== "before" && photos.length === 0))
        .map(([key, photos]) => (
          <section key={key} className="grid gap-1.5">
            <h3 className="text-sm font-medium">
              {te(isPermit(incident) && key === "before" ? "permit.formPhotos" : `photos.${key}`)}
              <span className="ml-1.5 tabular text-muted-foreground">{photos.length}</span>
            </h3>
            {photos.length === 0 ? (
              <p className="text-xs text-muted-foreground">{te("photos.none")}</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                {photos.map((item, index) => (
                  <a
                    key={item.id}
                    href={item.watermarked || item.image}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 overflow-hidden rounded-lg border"
                    title={item.submitted_by_name ?? undefined}
                  >
                    <Image
                      src={item.watermarked || item.image}
                      alt={`${te(`photos.${key}`)} ${index + 1}`}
                      width={96}
                      height={96}
                      unoptimized
                      className="size-20 object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
          </section>
        ))}
    </div>
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
  const [locating, setLocating] = useState(supportsLocation);
  const [locationError, setLocationError] = useState("");
  const categories = useQuery({
    queryKey: ["safety-create-categories", draft.project],
    // Raising a hazard offers EHS columns only. The legacy `FIELD` list used
    // to be merged in from before the EHS kind existed, and it is what put
    // 「杂费报销」 and 「test」 in front of a worker reporting a hazard - a
    // sundry claim has had its own `SUNDRY` kind for a while now.
    //
    // Only this list. The back-office filter above still reads both, because
    // migration 0040 moved the columns that were purely hazards and left the
    // older mixed ones where they were, with hazards still filed in them.
    queryFn: () =>
      getProjectCategories({
        project: draft.project,
        is_active: true,
        kind: "EHS",
        page_size: 200,
      }),
    enabled: Boolean(draft.project),
  });
  // VO is not a phone EHS column (E07), whatever a site does with the seeded
  // one; and a column hidden from the phone stays hidden on it.
  const offeredCategories = (categories.data?.results ?? []).filter(
    (category) =>
      category.code !== RETIRED_VO_COLUMN_CODE &&
      !(fieldMode && category.is_visible_in_pwa === false),
  );
  const chosenCategory = offeredCategories.find((item) => item.id === draft.category);
  // 施工准证申请 (C20): filing in the permit column makes it a permit.
  const permit = chosenCategory?.code === PERMIT_COLUMN_CODE;
  const team = useQuery({
    queryKey: ["incident-recipient-options", draft.project],
    queryFn: () => getIncidentRecipientOptions(draft.project),
    enabled: Boolean(draft.project),
  });
  const selectableWorkers = team.data ?? [];
  const completedPhotos = completedFieldEvidence(draft.photos);
  // One page of the company's form is a complete permit; a hazard keeps the
  // phone's four and the office's one.
  const requiredPhotos = permit ? 1 : fieldMode ? FIELD_EVIDENCE_PHOTO_COUNT : 1;
  const photosReady = permit || !fieldMode
    ? completedPhotos.length >= requiredPhotos
    : completedPhotos.length >= FIELD_EVIDENCE_PHOTO_COUNT && hasRequiredFieldEvidence(draft.photos);
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
        ...(permit
          ? { record_type: "PERMIT" as const, attachments: draft.attachments ?? [] }
          : {
              responsible_person: draft.rectifier || undefined,
              due_at:
                draft.rectifier && draft.rectifierDueAt
                  ? new Date(draft.rectifierDueAt).toISOString()
                  : undefined,
            }),
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

  // Automatic for every reporter, office included - 「确保每个模块都是自动
  // 获取GPS」 (Lucas, 2026-09-26). The button below stays as the retry.
  useEffect(() => {
    if (!navigator.geolocation) return;
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
  }, []);

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
                const category = offeredCategories.find(
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
                {offeredCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {permit && (
              <p className="mt-2 rounded-lg border border-info/25 bg-info/5 p-3 text-sm leading-6">
                {t("ehs.permit.hint")}
              </p>
            )}
            {/* An empty picker that does not say why it is empty is the shell
                this task exists to remove: until D-172 nothing in the product
                read EHS columns, so a site would have none. Say where they
                come from rather than showing a dropdown with nothing in it. */}
            <QueryFailedNote className="mt-2" query={categories} what={t("safety.what.categories")} />
            {draft.project &&
              categories.isSuccess &&
              offeredCategories.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("safety.form.noSafetyColumns")}
                </p>
              )}
          </FieldWrapper>

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
          <FieldWrapper label={permit ? t("ehs.permit.formPhotos") : t("safety.field.photo")} required className="sm:col-span-2">
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
                fieldMode && !permit
                  ? "safety.fieldEvidence.progress"
                  : "safety.fieldEvidence.progressOffice",
                {
                  current: completedPhotos.length,
                  required: requiredPhotos,
                },
              )}
              onChange={(photos) => setDraft((value) => ({ ...value, photos }))}
            />
          </FieldWrapper>
          {permit && (
            <FieldWrapper label={t("ehs.permit.attachments")} optional={t("common.optional")} className="sm:col-span-2">
              <Input
                type="file"
                multiple
                accept="application/pdf,image/*"
                aria-label={t("ehs.permit.attachments")}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  setDraft((value) => ({ ...value, attachments: files }));
                }}
              />
              {(draft.attachments?.length ?? 0) > 0 && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {(draft.attachments ?? []).map((file) => file.name).join(", ")}
                </p>
              )}
            </FieldWrapper>
          )}
          {/* 上报 → 指派 in one step (B22), and who confirms it (B21). A
              permit has neither: its applicant is the one waiting, and the
              project's safety leads approve it. */}
          {!permit && (
            <FieldWrapper label={t("ehs.form.rectifier")} optional={t("common.optional")} className="sm:col-span-2">
              <Select
                value={draft.rectifier || "none"}
                onValueChange={(value) =>
                  setDraft((current) => ({ ...current, rectifier: value === "none" ? "" : value }))
                }
                disabled={!draft.project}
              >
                <SelectTrigger className="w-full" aria-label={t("ehs.form.rectifier")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("ehs.form.noRectifier")}</SelectItem>
                  {selectableWorkers.map((row) => (
                    <SelectItem key={row.id} value={row.id}>{row.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {draft.rectifier && (
                <div className="mt-2">
                  <FieldWrapper label={t("safetyRectification.field.dueAt")} required>
                    <Input
                      type="datetime-local"
                      value={draft.rectifierDueAt ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, rectifierDueAt: event.target.value }))
                      }
                    />
                  </FieldWrapper>
                </div>
              )}
            </FieldWrapper>
          )}
          {/* X8: whoever raises it confirms it. Said, not asked. The rectifier
              list above never offers the raiser (the server leaves the reader
              out of it), so 「整改执行人不能自己确认」 cannot arise here. */}
          {!permit && (
            <FieldWrapper label={t("ehs.field.confirmer")} className="sm:col-span-2">
              <p className="text-sm">{t("ehs.confirmer.initiator")}</p>
            </FieldWrapper>
          )}
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
              <QueryFailedNote query={team} what={t("safety.what.workers")} />
              {team.isSuccess && selectableWorkers.length === 0 && <p className="text-sm text-muted-foreground">{t("safety.fieldReport.noWorkers")}</p>}
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
          {/* Required on the phone only. Raised at a desk - the office or a
              consultant - there is no site position to take; it is kept when
              the browser gives one. */}
          <FieldWrapper label={t("safety.field.location")} required={fieldMode} optional={fieldMode ? undefined : t("common.optional")} className={fieldMode ? "sm:col-span-2" : undefined}>
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
          <Button requires={[
            ...(fieldMode
              ? [[photosReady, t("safety.field.photo")], [draft.project, t("safety.field.project")], [draft.category, t("safety.field.category")], [draft.latitude && draft.longitude, t("safety.field.location")]]
              : [[draft.project, t("safety.field.project")], [draft.category, t("safety.field.category")], [draft.title, t("safety.field.title")], [photosReady, t("safety.field.photo")]]),
            ...(permit
              ? []
              : [
                  [!draft.rectifier || draft.rectifierDueAt, t("safetyRectification.field.dueAt")],
                ]),
          ] as Array<[unknown, string]>} disabled={create.isPending} onClick={() => create.mutate()}>

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
                {MANUAL_STATUSES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`safetyRectification.status.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper
            label={t("safety.field.resolutionNote")}
            optional={t("common.optional")}
          >
            <Textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} />
          </FieldWrapper>
          <p className="text-xs text-muted-foreground">{t("safety.update.closeHint")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={update.isPending} onClick={() => update.mutate()}>
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
