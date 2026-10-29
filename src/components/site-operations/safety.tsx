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
  ShieldAlert,
  Tags,
  History as HistoryIcon,
  UserCog,
  UserCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  hazardStage,
  STAGE_TONE,
  stageFromParam,
  stageQuery,
  TASK_STAGES,
} from "@/lib/task-stages";
import { PhotoThumb, rowPhotos } from "@/components/shared/photo-thumb";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  ListNeedsActionChip,
  NeedsActionMarker,
  withNeedsActionColumn,
} from "@/components/shared/needs-action";
import { RecordNo } from "@/components/shared/record-no";
import { ExportButton } from "@/components/shared/export-button";
import { AttachmentPicker } from "@/components/shared/attachment-picker";
import { FieldCamera } from "@/components/shared/field-camera";
import { useAllowedTypeRefusal } from "@/components/shared/attachment-refusal";
import { HAZARD_ATTACHMENT_ACCEPT, hazardAttachmentRule } from "@/lib/hazard-attachments";
import {
  FieldWrapper,
  FilterBar,
  ListHeader,
  QueryFailedNote,
  StatusBadge,
} from "@/components/shared/page-primitives";
import {
  RecordDetailDialog,
  RecordDetailShell,
  RecordRecorder,
} from "@/components/shared/record-detail-shell";
import {
  RecordCorrectionButton,
  RecordCorrectionHistory,
  useCanCorrect,
} from "@/components/shared/record-correction";
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
  IncidentStatus,
  SafetyIncident,
  SafetyIncidentPayload,
} from "@/interfaces/site-operations";
import type { LocationValue } from "@/lib/field-location";
import { useDateFormat } from "@/lib/dates";
import { hazardColumns, titleForColumn } from "@/lib/hazard-columns";
import { photoMeta } from "@/lib/photo-meta";
import {
  newClientEventId,
  submitSafetyIncidentOfflineAware,
  submitSafetyRectificationOfflineAware,
  type SafetyIncidentSubmission,
} from "@/services/offline-sync.service";
import { DrillNote } from "@/components/shared/drill-note";
import { getProjectCategories } from "@/services/contractor-ops.service";
import { CategoryOptionItems } from "@/components/shared/category-options";
import { getProjectAssignments } from "@/services/contractor.service";
import {
  assignSafetyRectification,
  exportSafetyIncidents,
  getSafetyIncident,
  getSafetyIncidents,
  getIncidentRecipientOptions,
  getSafetyResponsibleOptions,
  reassignSafetyRectification,
  reviewSafetyRectification,
  updateSafetyCategory,
} from "@/services/site-operations.service";
import { getOrCreateFieldDeviceId } from "@/services/field-access.service";
import { signOffBeforeEditing } from "@/services/sign-off.service";
import { ApiError } from "@/interfaces/api";
import { SIGN_OFF_CANCELLED } from "@/lib/sign-off";
import { LIST_FITS } from "@/lib/list-fits";
import { useRoleLabel } from "@/lib/role-labels";

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
  occurredAt: string;
  latitude?: string;
  longitude?: string;
  photos: Array<File | undefined>;
  /** PDF / Word / Excel that go with the report (I37); the photos stay the evidence. */
  attachments?: File[];
  notifyUsers: string[];
  /** 上报 → 指派 in one step (B22); empty leaves it 待分配. */
  rectifier?: string;
  rectifierDueAt?: string;
  /**
   * The report's one id, kept with the draft: a second tap after a failure
   * that was not the network (502 / 504 / 413 - the server may have taken
   * it) is the same report, never a second one (P-phonefix).
   */
  clientEventId?: string;
}

const EMPTY_DRAFT: SafetyDraft = {
  project: "",
  category: "",
  title: "",
  description: "",
  occurredAt: "",
  photos: createEmptyFieldEvidence(),
  attachments: [],
  notifyUsers: [],
  rectifier: "",
  rectifierDueAt: "",
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
  const qc = useQueryClient();
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
    "status",
    "responsible_person",
    "date_from",
    "date_to",
    // 待处理 / 待验收 / 已完成 (ID10), and the 历史档案 view (I2).
    "stage",
    "view",
  ]);
  // The office's 隐患整改 / EHS page (I2): three states, the working list,
  // and the 历史档案 the finished items move to.
  const officeRectification = mode === "rectification" && !fieldMode;
  const history = officeRectification && list.filters.view === "history";
  const chosenStage = stageFromParam(list.filters.stage);
  const listQuery = {
    ...list.query,
    view: undefined,
    stage: officeRectification ? stageQuery(chosenStage, history) : undefined,
  };
  const searchParams = useSearchParams();
  const router = useRouter();
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
  const [assigning, setAssigning] = useState<SafetyIncident | null>(null);
  const [submitting, setSubmitting] = useState<SafetyIncident | null>(null);
  const [reviewing, setReviewing] = useState<SafetyIncident | null>(null);
  // 调整负责人 (I2): while it is 待处理 with somebody on it.
  const [reassigning, setReassigning] = useState<SafetyIncident | null>(null);
  const mayFile = (incident: SafetyIncident) =>
    can("safety.manage") &&
    !user?.is_field_staff &&
    !isPermit(incident) &&
    hazardStage(incident.status) !== "DONE";
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
    queryKey: ["safety", mode, listQuery, overdueOnly, waitingForMe],
    queryFn: () => getSafetyIncidents({
      ...listQuery,
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
  // 「负责人下拉不必先选项目」 (I2): the people responsible for items this
  // reader can list, on the chosen project or on all of them.
  const responsiblePeople = useQuery({
    queryKey: ["safety-responsible-people", selectedProject],
    queryFn: () =>
      getSafetyResponsibleOptions({
        project: selectedProject === "all" ? undefined : selectedProject,
      }),
    enabled: !fieldMode,
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
      // An older link to a permit: 施工准证 is where it is read and decided
      // now (2026-10-10).
      if (isPermit(incident) && !fieldMode) {
        router.replace(`/permits?permit=${incident.id}`);
        return;
      }
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
  }, [clearIncidentParam, fieldMode, focusedIncident.data, mayAssign, requestedIncidentId, router, user?.id]);

  const columns = useMemo<ColumnDef<SafetyIncident, unknown>[]>(
    () => [
      {
        accessorKey: "occurred_at",
        meta: { label: t("taskFlow.ehs.noAndDate") },
        header: ({ column }) => (
          <SortableHeader
            label={t("taskFlow.ehs.noAndDate")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        // 编号 / 日期 (I2): the short number big, the date under it.
        cell: ({ row }) => (
          <div>
            <RecordNo value={row.original.incident_no} />
            <p className="tabular text-xs text-muted-foreground">
              {df.dateTime(row.original.occurred_at)}
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
            <p className="max-w-65 truncate font-medium text-foreground">
              {isPermit(row.original) && (
                <span className="mr-1.5 rounded bg-info/10 px-1.5 py-0.5 text-xs font-medium text-info">
                  {te("permit.badge")}
                </span>
              )}
              {row.original.title}
            </p>
            <p className="max-w-65 truncate text-xs text-muted-foreground">
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
          <span className="block max-w-50 truncate">
            {row.original.project_name}
          </span>
        ),
      },
      {
        accessorKey: "category_name",
        meta: { label: t("safety.field.category") },
        header: () => t("safety.field.category"),
        cell: ({ row }) => (
          <span className="block max-w-45 truncate">
            {row.original.category_name || t("taskFlow.ehs.unsorted")}
          </span>
        ),
      },
      // 负责人, its own column (I2).
      {
        accessorKey: "responsible_person_name",
        meta: { label: t("safety.field.responsible") },
        header: () => t("safety.field.responsible"),
        cell: ({ row }) => (
          <span className="block max-w-40 truncate">
            {row.original.responsible_person_name || t("hazard.unassigned")}
          </span>
        ),
      },
      // The severity column is gone: 「那些严重程度啊中等啊，高，低呀那些都不
      // 要」, and since 2026-10-10 it is gone from the whole system - forms,
      // filters, exports, reports, PDFs (「严重程度不需要，完全在系统里面删除
      // 掉」). The database column stays: hazards already filed keep the grade
      // they were given, unread.
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
              <p className="whitespace-nowrap">{t(`taskFlow.stage.${hazardStage(row.original.status)}`)}</p>
              {waitingOn && (
                <p className="max-w-40 truncate text-xs text-muted-foreground">{waitingOn}</p>
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
      // The drill-downs the list applies (逾期, 等你处理) go with it (H16).
      query: {
        ...listQuery,
        workflow: mode === "rectification" ? "rectification" : undefined,
        overdue: overdueOnly ? "1" : undefined,
        waiting: waitingForMe ? "me" : undefined,
      },
      columns: [
        { key: "incident_no", label: t("safety.field.incidentNo") },
        { key: "occurred_at", label: t("safety.field.occurredAt") },
        { key: "project_name", label: t("safety.field.project") },
        { key: "category_name", label: t("safety.field.category") },
        { key: "title", label: t("safety.field.title") },
        { key: "description", label: t("safety.field.description") },
        { key: "stage", label: t("safety.field.status"), values: t.raw("taskFlow.stage") as Record<string, string> },
        { key: "responsible_person_name", label: t("safety.field.responsible") },
        { key: "verified_by_name", label: t("taskFlow.ehs.verifiedBy") },
        { key: "verified_at", label: t("taskFlow.ehs.verifiedAt") },
        { key: "rectification_due_at", label: t("safety.field.dueAt") },
        { key: "photographer_name", label: t("safety.field.photographer") },
        { key: "latitude", label: t("safety.field.latitude") },
        { key: "longitude", label: t("safety.field.longitude") },
      ],
    });

  return (
    <div className={fieldMode ? "flex min-h-0 flex-col gap-4" : "flex h-[calc(100dvh-5rem)] flex-col gap-4"}>
      <ListHeader
        title={history ? t("taskFlow.ehs.historyTitle") : t(fieldMode ? "safety.fieldReport.title" : mode === "rectification" ? "safetyRectification.title" : "safety.title")}
        subtitle={fieldMode ? t("safety.fieldReport.subtitle") : isLoading ? t("common.loading") : t(mode === "rectification" ? "safetyRectification.count" : "safety.count", { count: total })}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* 「待处理 N」: the open items this reader moves on next, the
                sidebar's number for 隐患整改 (2026-10-09). */}
            {!history && <ListNeedsActionChip list={list} count={data?.needs_action_count} />}
            {officeRectification && can("category.manage") && (
              <Button asChild variant="outline">
                <Link href="/category-management?module=ehs">
                  <Tags className="h-4 w-4" />
                  {t("taskFlow.ehs.categories")}
                </Link>
              </Button>
            )}
            {officeRectification && (
              <Button
                variant={history ? "default" : "outline"}
                onClick={() =>
                  list.setFilters({ view: history ? undefined : "history", stage: undefined })
                }
              >
                <HistoryIcon className="h-4 w-4" />
                {t(history ? "taskFlow.ehs.backToList" : "taskFlow.ehs.history")}
              </Button>
            )}
            {can("report.export") && !fieldMode && (
              <ExportButton onExport={runExport} disabled={!total} disabledReason={t("common.emptyValue")} />
            )}
            {/* No longer gated on the mode. 安全事故 is being removed from
                the console at the customer's request, which makes this screen
                the only place a hazard can be raised - and the button lived
                on the half being deleted (F-240). */}
            {mayRaise && (
            <Button size={fieldMode ? "lg" : "default"} className={fieldMode ? "min-h-12 px-5 text-base" : undefined} onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {t(fieldMode ? "safety.fieldReport.new" : officeRectification ? "taskFlow.ehs.create" : "safety.new")}
            </Button>
            )}
          </div>
        }
      />

      <FilterBar>
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
          className="w-full sm:w-65"
        />
        {/* Severity filter removed with the column (T-189). */}
        {!fieldMode && (
          <Select
            value={selectedCategory}
            onValueChange={(value) =>
              list.setFilter("category", value === "all" ? undefined : value)
            }
          >
            <SelectTrigger className="w-full sm:w-52.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("safety.filter.allCategories")}</SelectItem>
              {/* Reported from the phone without one (ID12). */}
              <SelectItem value="none">{t("taskFlow.ehs.unsorted")}</SelectItem>
              {/* 分类组 → 分类 → 子分类 (I11): a group, a category with its
                  sub-categories, or one sub-category. */}
              <CategoryOptionItems rows={filterCategories.data?.results ?? []} groupsSelectable />
            </SelectContent>
          </Select>
        )}
        {!fieldMode && (
          <Select
            value={selectedResponsible}
            onValueChange={(value) =>
              list.setFilter("responsible_person", value === "all" ? undefined : value)
            }
          >
            <SelectTrigger className="w-full sm:w-52.5" aria-label={t("safety.field.responsible")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("safety.filter.allResponsible")}</SelectItem>
              {(responsiblePeople.data ?? []).map((person) => (
                <SelectItem key={person.id} value={person.id}>{person.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {/* 状态: 待处理 / 待验收 / 已完成 (ID10). The 历史档案 is 已完成 only. */}
        {officeRectification && !history && (
          <Select
            value={chosenStage ?? "all"}
            onValueChange={(value) => list.setFilter("stage", value === "all" ? undefined : value)}
          >
            <SelectTrigger className="w-full sm:w-40" aria-label={t("safety.field.status")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("taskFlow.stage.all")}</SelectItem>
              {TASK_STAGES.map((stage) => (
                <SelectItem key={stage} value={stage}>{t(`taskFlow.stage.${stage}`)}</SelectItem>
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
            className="w-full sm:w-41.25"
          />
        )}
        {!fieldMode && (
          <Input
            type="date"
            aria-label={t("safety.filter.dateTo")}
            value={list.filters.date_to ?? ""}
            onChange={(event) => list.setFilter("date_to", event.target.value || undefined)}
            className="w-full sm:w-41.25"
          />
        )}
        {!fieldMode && (
          <QueryFailedNote className="w-full" query={filterCategories} what={t("safety.what.categories")} />
        )}
        {!fieldMode && (
          <QueryFailedNote className="w-full" query={responsiblePeople} what={t("safety.what.responsiblePeople")} />
        )}
      </FilterBar>
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
          {isError && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("safety.fieldReport.loadError")}</div>}
          {!isLoading && !isError && (data?.results ?? []).length === 0 && (
            <div className="rounded-xl border border-dashed border-panel-border p-8 text-center text-sm text-muted-foreground">{t("safety.fieldReport.empty")}</div>
          )}
          {(data?.results ?? []).map((incident) => (
            <article key={incident.id} className="surface-panel rounded-xl">
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
                className="flex w-full items-start gap-3 rounded-xl p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
                    <NeedsActionMarker show={incident.needs_action} />
                    <p className="font-semibold">{incident.title}</p>
                    {isPermit(incident) && <StatusBadge label={te("permit.badge")} tone="info" />}
                    <StatusBadge label={t(`taskFlow.stage.${hazardStage(incident.status)}`)} tone={STAGE_TONE[hazardStage(incident.status)]} />
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
        corrected={{ kind: "HAZARD" }}
        columns={withNeedsActionColumn(columns, t("needsAction.column"))}
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
        storageKey={LIST_FITS.hazards.storageKey}
        defaultHidden={LIST_FITS.hazards.hidden}
        pack={{ kind: "HAZARD" }}
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
      {assigning && <SafetyAssignDialog incident={assigning} onClose={() => setAssigning(null)} />}
      {submitting && <SafetySubmitDialog incident={submitting} onClose={() => setSubmitting(null)} />}
      {reviewing && <SafetyReviewDialog incident={reviewing} onClose={() => setReviewing(null)} />}
      {reassigning && <SafetyReassignDialog incident={reassigning} onClose={() => setReassigning(null)} />}
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
        <HazardRecordDetail
          incident={opened}
          mayAssign={mayAssign(opened)}
          mayFile={mayFile(opened)}
          onReassign={() => {
            setReassigning(opened);
            setOpened(null);
          }}
          onClose={() => setOpened(null)}
          // After 【改正】 (I30): the open incident shows its new values.
          onCorrected={async () => {
            setOpened(await getSafetyIncident(opened.id));
            void qc.invalidateQueries({ queryKey: ["safety"] });
          }}
          onReview={() => {
            setReviewing(opened);
            setOpened(null);
          }}
          onAssign={() => {
            setAssigning(opened);
            setOpened(null);
          }}
        />
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

/**
 * The detail the whole office row opens (T-304), in the record popup (E8,
 * Q31): the hazard's facts, its 整改前 / 中 / 后 photographs, the confirm and
 * assign buttons, and its own room in the 事项沟通 place - so 【沟通】 is the
 * conversation itself here rather than a button to it (the row's icon and the
 * phone card still open the room on its own).
 *
 * Its own component so a test can render it; it stays beside `Safety`, which
 * is the only thing that opens it.
 */
export function HazardRecordDetail({
  incident,
  mayAssign,
  mayFile = false,
  onClose,
  onReview,
  onAssign,
  onReassign,
  onCorrected,
}: {
  incident: SafetyIncident;
  /** After 【改正】 (I30): re-read the incident. */
  onCorrected?: () => void;
  /** `Safety`'s assignment rule, for this incident. */
  mayAssign: boolean;
  /** The office may change its category and who fixes it (I2). */
  mayFile?: boolean;
  onClose: () => void;
  onReview: () => void;
  onAssign: () => void;
  onReassign?: () => void;
}) {
  const t = useTranslations();
  const te = useTranslations("ehs");
  const df = useDateFormat();
  // 【改正】 (I30): a hazard's category, title and description; a permit is
  // its own form and is not corrected here.
  const mayCorrect = useCanCorrect("HAZARD");
  const correction = isPermit(incident) || !mayCorrect ? null : (
    <RecordCorrectionButton
      kind="HAZARD"
      recordId={incident.id}
      onCorrected={onCorrected}
    />
  );
  return (
    <RecordDetailDialog
      title={incident.incident_no}

      description={incident.title}
      status={
        <StatusBadge
          label={t(`taskFlow.stage.${hazardStage(incident.status)}`)}
          tone={STAGE_TONE[hazardStage(incident.status)]}
        />
      }
      // 「单独导出」 top right (T-386).
      exportRecord={{ kind: "HAZARD", recordId: incident.id, reference: incident.incident_no }}
      onClose={onClose}
    >
      <RecordDetailShell
        reference={incident.incident_no}
        // 记录人 (E8): who recorded it, with a number to call.
        recorder={<RecordRecorder record={incident} />}
        facts={[
          {
            label: t("safetyRectification.field.responsible"),
            value: incident.responsible_person_name || t("hazard.unassigned"),
          },
          { label: t("safety.field.project"), value: incident.project_name },
          { label: t("safety.field.category"), value: incident.category_name || t("taskFlow.ehs.unsorted") },
          { label: t("safety.field.occurredAt"), value: df.dateTime(incident.occurred_at) },
          ...(incident.description
            ? [{ label: t("safety.field.description"), value: incident.description, wide: true }]
            : []),
          ...(incident.origin
            ? [{ label: te("field.origin"), value: te(`origin.${incident.origin}`) }]
            : []),
          {
            label: te("field.raisedBy"),
            value:
              [incident.photographer_name, incident.created_by_title]
                .filter(Boolean)
                .join(" · ") || t("common.emptyValue"),
          },
          { label: te("field.confirmer"), value: confirmerLabel(incident, te) },
          ...(incident.verified_at && hazardStage(incident.status) === "DONE"
            ? [
                {
                  label: te("field.confirmedBy"),
                  value: [
                    incident.verified_by_name,
                    incident.verified_by_title,
                    df.dateTime(incident.verified_at),
                  ]
                    .filter(Boolean)
                    .join(" · "),
                },
              ]
            : []),
        ]}
        // 整改前 / 中 / 后 (B20), one row each; a permit's form is its "before".
        photos={hazardPhotoRows(incident).flatMap(([key, photos]) =>
          photos.map((item, index) => ({
            id: item.id,
            url: item.watermarked || item.image,
            label: [`${te(`photos.${key}`)} ${index + 1}`, item.submitted_by_name]
              .filter(Boolean)
              .join(" · "),
            ...photoMeta(item),
            group: key,
          })),
        )}
        photoGroups={hazardPhotoRows(incident).map(([key]) => ({
          key,
          label: te(isPermit(incident) && key === "before" ? "permit.formPhotos" : `photos.${key}`),
        }))}
        emptyGroupLabel={te("photos.none")}
        actions={
          incident.can_confirm || mayAssign || mayFile || correction ? (
            <div className="grid gap-2">
              {correction}
              {incident.can_confirm && (
                <Button
                  className="min-h-11"
                  onClick={onReview}
                >
                  <CheckCircle2 />
                  {t(isPermit(incident) ? "ehs.permit.approve" : "safetyRectification.action.review")}
                </Button>
              )}
              {/* Assignment stays, and it is not a third rectification action:
                  it decides *who* is responsible, which is what feeds the
                  「指派给我的隐患整改」 pile in My Tasks (T-285). Without it that
                  pile would have no source. */}
              {mayAssign && (
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={onAssign}
                >
                  <UserCheck />
                  {t("safetyRectification.action.assign")}
                </Button>
              )}
              {mayFile && onReassign && incident.responsible_person &&
                ["ASSIGNED", "RETURNED"].includes(incident.status) && (
                <Button variant="outline" className="min-h-11" onClick={onReassign}>
                  <UserCog />
                  {t("taskFlow.ehs.reassign")}
                </Button>
              )}
              {mayFile && <HazardCategoryControl incident={incident} />}
            </div>
          ) : undefined
        }
        corrections={
          isPermit(incident) ? null : (
            <RecordCorrectionHistory kind="HAZARD" recordId={incident.id} />
          )
        }
        chat={<HazardConversationPanel incidentId={incident.id} />}
      />
    </RecordDetailDialog>
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
  const commonT = useTranslations("common");
  const qc = useQueryClient();
  const { user } = useAuth();
  const fieldMode = Boolean(user?.is_field_staff);
  const refusalText = useAllowedTypeRefusal(HAZARD_ATTACHMENT_ACCEPT, { phone: fieldMode });
  // 拍照 (at least one) / 备注 → 提交完成 (I1): the same on the phone and
  // in the office, no four fixed slots any more.
  const [officeImages, setOfficeImages] = useState<File[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [note, setNote] = useState("");
  // Automatic, like every field capture form (T-355, D-246).
  const [location, setLocation] = useState<LocationValue | null>(null);
  const images = officeImages;
  // One id for this dialog: every press, retry and queue replay is the same
  // submission to the server, so a lost answer can never post the fix twice.
  const [clientEventId] = useState(() => crypto.randomUUID());
  const save = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Authentication required.");
      return submitSafetyRectificationOfflineAware(user.id, incident.id, {
        images,
        attachments,
        note,
        captured_at: new Date().toISOString(),
        latitude: location?.latitude,
        longitude: location?.longitude,
        accuracy_m: location?.accuracy,
        device_id: fieldMode ? getOrCreateFieldDeviceId() : undefined,
        client_event_id: clientEventId,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["safety"] });
      void qc.invalidateQueries({ queryKey: ["my-tasks"] });
      void qc.invalidateQueries({ queryKey: ["hazard-conversation", incident.id] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("submit.title")}</DialogTitle>
          <DialogDescription>{incident.rectification_note || t("submit.description")}</DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("field.photo")} required>
          <FieldCamera
            label={t("field.photo")}
            fileCount={officeImages.length}
            onCapture={(image) => setOfficeImages((current) => [...current, image])}
            onClear={() => setOfficeImages([])}
          />
        </FieldWrapper>
        <FieldWrapper label={t("field.attachments")} optional={commonT("optional")}>
          <AttachmentPicker files={attachments} onChange={setAttachments} rule={hazardAttachmentRule(fieldMode)} camera={false} refusalText={refusalText} />
        </FieldWrapper>
        <LocationField
          label={t("field.location")}
          readyLabel={t("action.locationReady")}
          value={location}
          onChange={setLocation}
          required
          allowMissingOffline
        />
        {/* Required on the phone too. 「提交整改」 without a word of
            explanation leaves the verifier a photograph and nothing to read
            it against, which is what the customer asked to stop. */}
        <FieldWrapper label={t("field.workDone")} required>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </FieldWrapper>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button>
          <Button requires={[[images.length >= 1, t("field.photo")], [location, t("field.location")], [note, t("field.workDone")]]} disabled={save.isPending} onClick={() => save.mutate()}>
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
  const tf = useTranslations("taskFlow");
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
          {permit ? te("permit.refuseInstead") : tf("moreWork.reviewHint")}
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
function hazardPhotoRows(
  incident: SafetyIncident,
): Array<["before" | "during" | "after", HazardPhoto[]]> {
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
  return rows.filter(
    ([key, photos]) => !(isPermit(incident) && key !== "before" && photos.length === 0),
  );
}

/** The same rows as thumbnails, in the confirm dialog. */
function HazardPhotoGroups({ incident }: { incident: SafetyIncident }) {
  const te = useTranslations("ehs");
  return (
    <div className="grid gap-3" data-testid="hazard-photo-groups">
      {hazardPhotoRows(incident)
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
  const roleOf = useRoleLabel();
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useDraftState<SafetyDraft>("draft", {
    ...EMPTY_DRAFT,
    project: initialProject,
  });
  const clearDraft = useClearDraft();
  const attachmentRefusal = useAllowedTypeRefusal(HAZARD_ATTACHMENT_ACCEPT, { phone: fieldMode });
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
  // Not VO (E07), not 施工准证申请 - a permit is applied for under 施工准证
  // now (2026-10-10) - and not a column hidden from the phone.
  const offeredCategories = hazardColumns(categories.data?.results ?? [], fieldMode);
  const offeredNames = offeredCategories.map((item) => item.name);
  // Only a column still on offer: a draft saved while 施工准证申请 was a
  // column here must not file a hazard there.
  const chosenCategory = offeredCategories.find((item) => item.id === draft.category);
  const category = chosenCategory?.id ?? "";
  const team = useQuery({
    queryKey: ["incident-recipient-options", draft.project],
    queryFn: () => getIncidentRecipientOptions(draft.project),
    enabled: Boolean(draft.project),
  });
  const selectableWorkers = team.data ?? [];
  const completedPhotos = completedFieldEvidence(draft.photos);
  // The phone's four and the office's one.
  const requiredPhotos = fieldMode ? FIELD_EVIDENCE_PHOTO_COUNT : 1;
  const photosReady = !fieldMode
    ? completedPhotos.length >= requiredPhotos
    : completedPhotos.length >= FIELD_EVIDENCE_PHOTO_COUNT && hasRequiredFieldEvidence(draft.photos);
  // JB76 (客户 10-29 晚 事项 4): 「我是后台办公室里怎么可能会去上报隐患」 - the
  // office 建立整改事项; the accident wording is the phone's.
  const fieldEvidenceLabels = fieldMode
    ? [
        t("safety.fieldEvidence.overview"),
        t("safety.fieldEvidence.detail"),
        t("safety.fieldEvidence.risk"),
        t("safety.fieldEvidence.surroundings"),
      ]
    : [
        t("safety.officeCreate.photoPlace"),
        t("safety.officeCreate.photoDetail"),
        t("safety.officeCreate.photoScope"),
        t("safety.officeCreate.photoOther"),
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
    mutationFn: async () => {
      if (!user) throw new Error("Authentication required.");
      // An item raised in the office is signed (I29, ID68 4). The PIN is
      // asked and checked BEFORE the photos go, so a wrong one never sends
      // them twice; the create carries the PIN that was right. The phone and
      // a consultant are never asked.
      let signOffPin: string | undefined;
      if (!fieldMode && user.account_type !== "CONSULTANT") {
        const pin = await signOffBeforeEditing("hazard.create");
        if (pin === null) throw new ApiError("", 403, {}, SIGN_OFF_CANCELLED);
        signOffPin = pin || undefined;
      }
      const eventId = draft.clientEventId || newClientEventId("safety-incident");
      if (!draft.clientEventId) setDraft((value) => ({ ...value, clientEventId: eventId }));
      const payload: SafetyIncidentPayload & { client_event_id: string } = {
        project: draft.project,
        // None from the phone (ID12): the server files it as 「未分类」.
        category: fieldMode ? undefined : category,
        // The phone has no title field: the server writes it from the column.
        title: fieldMode ? "" : draft.title.trim(),
        description: draft.description.trim(),
        occurred_at: draft.occurredAt
          ? new Date(draft.occurredAt).toISOString()
          : undefined,
        latitude: draft.latitude,
        longitude: draft.longitude,
        photos: completedPhotos,
        attachments: draft.attachments ?? [],
        notify_users: draft.notifyUsers,
        client_event_id: eventId,
        field_task: fieldTaskId,
        responsible_person: draft.rectifier || undefined,
        due_at:
          draft.rectifier && draft.rectifierDueAt
            ? new Date(draft.rectifierDueAt).toISOString()
            : undefined,
      };
      return submitSafetyIncidentOfflineAware(user.id, payload, signOffPin);
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
          <DialogTitle>{t(fieldMode ? "safety.createTitle" : "safety.officeCreate.title")}</DialogTitle>
          <DialogDescription>
            {t(fieldMode ? "safety.form.description" : "safety.officeCreate.description")}
          </DialogDescription>
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
                  // A title the form wrote from this project's column goes
                  // with the column.
                  title: titleForColumn(value.title, offeredNames, ""),
                  notifyUsers: [],
                }))
              }
              placeholder={t("safety.filter.project")}
              className="w-full"
            />
          </FieldWrapper>
          {/* The phone does not ask (ID12): 「不需要选择部门或详细分类，由后台
              处理」 - the office files it later (「未分类」). */}
          {!fieldMode && (
          <FieldWrapper label={t("safety.field.category")} required className="sm:col-span-2">
            <Select
              value={category || undefined}
              onValueChange={(categoryId) => {
                const next = offeredCategories.find(
                  (item) => item.id === categoryId,
                );
                setDraft((value) => ({
                  ...value,
                  category: categoryId,
                  // 「其他」 (ID5): the item's own name is typed, not 「其他」.
                  title: titleForColumn(value.title, offeredNames, next?.name && !next.is_other ? next.name : ""),
                }));
              }}
              disabled={!draft.project}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("safety.filter.selectCategory")} />
              </SelectTrigger>
              <SelectContent>
                <CategoryOptionItems rows={offeredCategories} />
              </SelectContent>
            </Select>
            {/* An empty picker that does not say why it is empty is the shell
                this task exists to remove: until D-172 nothing in the product
                read EHS columns, so a site would have none. Say where they
                come from rather than showing a dropdown with nothing in it. */}
            <QueryFailedNote className="mt-2" query={categories} what={t("safety.what.categories")} />
            {draft.project &&
              categories.isSuccess &&
              offeredCategories.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("safety.form.noSafetyColumns")}{" "}
                  {/* Not a dead end (H18): the categories are made on 分类管理
                      now, so the office goes straight there; the phone and
                      anyone without category.manage are told whom to ask. */}
                  {!fieldMode && can("category.manage") ? (
                    <Link
                      href={`/category-management?module=ehs&project=${encodeURIComponent(draft.project)}&create=1`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {t("safety.form.addSafetyColumn")}
                    </Link>
                  ) : (
                    t("safety.form.askForSafetyColumn")
                  )}
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
          {/* 简单说明, optional on the phone too (ID12). */}
          {<FieldWrapper label={t("safety.field.description")} optional={t("common.optional")} className="sm:col-span-2">
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
                  required: requiredPhotos,
                },
              )}
              onChange={(photos) => setDraft((value) => ({ ...value, photos }))}
            />
          </FieldWrapper>
          {/* PDF / Word / Excel beside the photos (I37). Never instead of them:
              the photo rule above is unchanged. The phone's picker has no
              camera here - the grid above is the camera - so it is 「选文件」. */}
          <FieldWrapper label={t("safety.field.attachments")} optional={t("common.optional")} className="sm:col-span-2">
            <AttachmentPicker
              files={draft.attachments ?? []}
              onChange={(attachments) => setDraft((value) => ({ ...value, attachments }))}
              rule={hazardAttachmentRule(fieldMode)}
              camera={false}
              refusalText={attachmentRefusal}
            />
          </FieldWrapper>
          {/* 上报 → 指派 in one step (B22), and who confirms it (B21). */}
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
          {/* X8: whoever raises it confirms it. Said, not asked. The rectifier
              list above never offers the raiser (the server leaves the reader
              out of it), so 「整改执行人不能自己确认」 cannot arise here. */}
          <FieldWrapper label={t("ehs.field.confirmer")} className="sm:col-span-2">
            <p className="text-sm">{t("ehs.confirmer.initiator")}</p>
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
                        ? `${roleOf(null, row.role_name)} / ${t("incidentReporting.supervisor")}`
                        : roleOf(null, row.role_name)}
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
              ? [[photosReady, t("safety.field.photo")], [draft.project, t("safety.field.project")], [draft.latitude && draft.longitude, t("safety.field.location")]]
              : [[draft.project, t("safety.field.project")], [category, t("safety.field.category")], [draft.title, t("safety.field.title")], [photosReady, t("safety.field.photo")]]),
            [!draft.rectifier || draft.rectifierDueAt, t("safetyRectification.field.dueAt")],
          ] as Array<[unknown, string]>} disabled={create.isPending} onClick={() => create.mutate()}>

            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldAlert className="h-4 w-4" />
            )}
            {t(fieldMode ? "safety.form.confirm" : "safety.officeCreate.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 改事项分类 (I2): the office files an item - mostly the 「未分类」 the phone
 * sends (ID12) - under one of the project's EHS categories.
 */
function HazardCategoryControl({ incident }: { incident: SafetyIncident }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [chosen, setChosen] = useState(incident.category ?? "");
  const [reason, setReason] = useState("");
  // Moving an item already filed is a 「改正」 (ID77): a reason and the PIN.
  // Filing a 「未分类」 one for the first time is neither.
  const moving = Boolean(incident.category) && Boolean(chosen) && chosen !== incident.category;
  const categories = useQuery({
    queryKey: ["safety-file-categories", incident.project],
    queryFn: () =>
      getProjectCategories({
        project: incident.project,
        is_active: true,
        kind: "EHS",
        page_size: 200,
      }),
  });
  const offered = hazardColumns(categories.data?.results ?? [], false);
  const save = useMutation({
    mutationFn: () => updateSafetyCategory(incident.id, chosen, moving ? reason.trim() : ""),
    onSuccess: () => {
      setReason("");
      void qc.invalidateQueries({ queryKey: ["safety"] });
      void qc.invalidateQueries({ queryKey: ["safety-incident"] });
    },
  });
  return (
    <FieldWrapper label={t("safety.field.category")}>
      <div className="flex gap-2">
        <Select value={chosen || undefined} onValueChange={setChosen}>
          <SelectTrigger className="min-w-0 flex-1" aria-label={t("safety.field.category")}>
            <SelectValue placeholder={t("taskFlow.ehs.unsorted")} />
          </SelectTrigger>
          <SelectContent>
            <CategoryOptionItems rows={offered} />
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          disabled={
            save.isPending || !chosen || chosen === incident.category || (moving && !reason.trim())
          }
          disabledReason={
            moving && !reason.trim()
              ? t("taskFlow.ehs.changeReasonNeeded")
              : t("taskFlow.ehs.chooseCategory")
          }
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : <Tags />}
          {t("taskFlow.ehs.saveCategory")}
        </Button>
      </div>
      {moving && (
        <FieldWrapper
          label={t("taskFlow.ehs.changeReason")}
          required
          hint={t("taskFlow.ehs.changeReasonHint")}
          className="mt-2"
        >
          <Input
            value={reason}
            maxLength={1000}
            aria-label={t("taskFlow.ehs.changeReason")}
            onChange={(event) => setReason(event.target.value)}
          />
        </FieldWrapper>
      )}
      <QueryFailedNote query={categories} what={t("safety.what.categories")} />
    </FieldWrapper>
  );
}

/**
 * 调整负责人 (I2): another person fixes it while it is 待处理. The same item,
 * its photos and conversation stay; the deadline stays unless changed.
 */
function SafetyReassignDialog({ incident, onClose }: { incident: SafetyIncident; onClose: () => void }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const team = useQuery({
    queryKey: ["project-assignments", incident.project, "safety"],
    queryFn: () => getProjectAssignments(incident.project),
  });
  const [person, setPerson] = useState("");
  const [dueAt, setDueAt] = useState(
    incident.rectification_due_at ? incident.rectification_due_at.slice(0, 16) : "",
  );
  const choices = (team.data?.results ?? []).filter(
    (row) => row.user !== incident.responsible_person && row.user !== incident.confirmer,
  );
  const save = useMutation({
    mutationFn: () =>
      reassignSafetyRectification(incident.id, {
        responsible_person: person,
        due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["safety"] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("taskFlow.ehs.reassign")}</DialogTitle>
          <DialogDescription>
            {t("taskFlow.ehs.reassignHelp", {
              incident: incident.incident_no,
              person: incident.responsible_person_name ?? "",
            })}
          </DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("taskFlow.ehs.newResponsible")} required>
          <Select value={person || undefined} onValueChange={setPerson}>
            <SelectTrigger className="w-full" aria-label={t("taskFlow.ehs.newResponsible")}>
              <SelectValue placeholder={t("safetyRectification.field.selectResponsible")} />
            </SelectTrigger>
            <SelectContent>
              {choices.map((row) => (
                <SelectItem key={row.user} value={row.user}>{row.user_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <QueryFailedNote query={team} what={t("safetyRectification.what.team")} />
        </FieldWrapper>
        <FieldWrapper label={t("safetyRectification.field.dueAt")} optional={t("common.optional")}>
          <Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        </FieldWrapper>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            requires={[[person, t("taskFlow.ehs.newResponsible")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <UserCog />}
            {t("taskFlow.ehs.reassign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
