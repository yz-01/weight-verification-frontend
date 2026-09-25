"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Check,
  ClipboardCheck,
  FolderOpen,
  FileText,
  FilePlus2,
  ListTree,
  Loader2,
  MapPin,
  PackageOpen,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  ScanText,
  Save,
  Eye,
  ImagePlus,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import { AddToPackageButton } from "@/components/contractor-ops/add-to-package";
import { FileIntoColumnDialog } from "@/components/contractor-ops/file-into-column";
import { useAuth } from "@/components/providers/auth-provider";
import { useClearDraft, useDraftState } from "@/components/field-staff/field-draft";
import {
  completedFieldEvidence,
  createEmptyFieldEvidence,
  FIELD_EVIDENCE_PHOTO_COUNT,
  FieldEvidenceGrid,
  hasRequiredFieldEvidence,
} from "@/components/field-staff/field-evidence-grid";
import { ExportButton } from "@/components/shared/export-button";
import { FieldCamera } from "@/components/shared/field-camera";
import { RecordConversationButton } from "@/components/shared/record-conversation-button";
import { RecordDetailDialog, RecordDetailShell } from "@/components/shared/record-detail-shell";
import { useDateFormat } from "@/lib/dates";
import {
  FieldWrapper,
  ListHeader,
  LoadFailed,
  QueryFailedNote,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { LocationField } from "@/components/field-staff/location-field";
import type { LocationFix } from "@/lib/field-location";
import { parseAlertPercentages } from "@/lib/category-modules";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { ProjectColumnPicker } from "@/components/site-operations/project-column-picker";
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
import type {
  ConstructionPhase,
  EquipmentPayload,
  FieldTask,
  FieldTaskPayload,
  MaterialOutgoing,
  ProjectCategory,
  ProjectCategoryKind,
  CategorySubmissionMode,
  ProjectCategoryPayload,
  SiteEquipment,
  SiteProgressRecord,
} from "@/interfaces/contractor-ops";
import { ApiError } from "@/interfaces/api";
import { MATERIAL_UNITS } from "@/interfaces/contractor";
import {
  createConstructionPhase,
  updateConstructionPhase,
  addFieldTaskReferences,
  createFieldTask,
  createProjectCategory,
  createSiteEquipment,
  exportSiteProgressRecords,
  getConstructionPhases,
  getFieldTasks,
  addMaterialOutgoingPhotos,
  exportMaterialOutgoing,
  getMaterialOutgoing,
  getMaterialOutgoingRecord,
  returnMaterialOutgoingProcessing,
  ocrEquipmentDeliveryNote,
  getProjectCategories,
  getSiteEquipment,
  getSiteProgressRecords,
  getSiteProgressSummary,
  reviewMaterialOutgoing,
  fileProgressRecord,
  transitionFieldTask,
  updateFieldTask,
  updateProjectCategory,
  updateSiteEquipment,
} from "@/services/contractor-ops.service";
import { getApplicationOptions } from "@/services/consultant-workflow.service";
import {
  getProjectAssignments,
  getSuppliers,
} from "@/services/contractor.service";
import { getRoles } from "@/services/users.service";
import {
  submitEquipmentMovementOfflineAware,
  submitMaterialOutgoingOfflineAware,
  submitSiteProgressOfflineAware,
} from "@/services/offline-sync.service";

type Coordinates = { latitude: string; longitude: string; accuracy: string };
/** 设备进出场最多 5 张（含 Delivery Order），E2 / D-257; the server enforces it too. */
const EQUIPMENT_PHOTO_MAX = 5;
type EquipmentUnit = "UNIT" | "PIECE" | "SET" | "LOAD" | "TONNE" | "KG" | "M3" | "OTHER";

const EQUIPMENT_UNITS: EquipmentUnit[] = [
  "UNIT",
  "PIECE",
  "SET",
  "LOAD",
  "TONNE",
  "KG",
  "M3",
  "OTHER",
];

async function currentCoordinates(): Promise<Coordinates> {
  if (!("geolocation" in navigator)) throw new Error("location_unavailable");
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
          accuracy: position.coords.accuracy.toFixed(2),
        }),
      reject,
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

export function ProjectFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("contractorOps");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
      <span className="text-xs font-medium text-muted-foreground">
        {t("field.project")}
      </span>
      <ProjectPicker
        value={value}
        onValueChange={(next) => onChange(next === "all" ? "" : next)}
        placeholder={t("field.selectProject")}
        allowAll
        allLabel={t("field.allProjects")}
        className="w-full sm:w-72"
      />
    </div>
  );
}

function WorkspaceState({
  loading,
  error,
  empty,
  errorMessage,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  errorMessage?: string;
}) {
  const t = useTranslations("contractorOps");
  if (loading)
    return (
      <div className="grid min-h-48 place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  if (error)
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
        {errorMessage || t("state.loadError")}
      </div>
    );
  if (empty)
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-10 text-center text-sm text-muted-foreground">
        {t("state.empty")}
      </div>
    );
  return null;
}

export function tone(
  status: string,
): "neutral" | "positive" | "warning" | "danger" | "info" {
  if (
    [
      "ACTIVE",
      "ON_SITE",
      "ACCEPTED",
      "CONFIRMED",
      "APPROVED",
      "RELEASED",
    ].includes(status)
  )
    return "positive";
  if (["RETURNED", "REJECTED", "CANCELLED", "RETIRED"].includes(status))
    return "danger";
  if (["SUBMITTED", "PENDING", "IN_PROGRESS", "MAINTENANCE"].includes(status))
    return "warning";
  return "neutral";
}

/**
 * The editor for one project column, opened in place from Category Management.
 *
 * Lucas 2026-09-25: 「全部栏目都可以直接在同个页面新增，不需要跳转到其他页面，
 * 就是会有弹窗表格」 (D-264). So this is the only column form: the separate
 * `/project-categories` and `/material-columns` screens are gone, and a
 * material column's budget and warning lines are edited here too (D-263).
 *
 * What is deliberately not on it (D-265, D-266):
 * - no parent column. Columns are one flat list; the server no longer accepts
 *   a parent on write, and old parent links stay in the database unused;
 * - no "who can upload" and no "who can edit" lists. Everyone who can see a
 *   column can upload to it, field staff included, and editing follows the
 *   `category.manage` permission alone.
 *
 * "Who can see this column" (`access_mode`) stays - it was not part of what
 * Lucas asked to remove.
 */
export function CategoryDialog({
  project,
  defaultKind,
  row,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  project: string;
  /** The module the screen is showing, so a new column joins that list. */
  defaultKind: ProjectCategoryKind;
  row: ProjectCategory | null;
  /** Where a new column goes in the list: after the ones already there. */
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps");
  const modules = useTranslations("categoryManagement");
  const { can } = useAuth();
  const roles = useQuery({
    queryKey: ["roles", "category-access"],
    queryFn: () => getRoles({ page_size: 200, sort_by: "name" }),
    enabled: can("role.view"),
  });
  const people = useQuery({
    queryKey: ["project-assignments", project, "category-access"],
    queryFn: () => getProjectAssignments(project),
  });
  const [form, setForm] = useState<ProjectCategoryPayload>({
    project,
    code: row?.code ?? "",
    name: row?.name ?? "",
    // A new column joins the list it was created from. An existing row keeps
    // whatever it already is, including the BOTH marker on a column the split
    // could not classify; the picker below is where somebody who knows
    // settles it.
    kind: row?.kind ?? defaultKind,
    submission_mode: row?.submission_mode ?? "REVIEW",
    description: row?.description ?? "",
    sort_order: row?.sort_order ?? nextSortOrder,
    is_visible_in_pwa: row?.is_visible_in_pwa ?? true,
    is_active: row?.is_active ?? true,
    access_mode: row?.access_mode ?? "ALL",
    allowed_roles: row?.allowed_roles ?? [],
    allowed_users: row?.allowed_users ?? [],
  });
  // The material column's money (D-263): whether it counts against a budget,
  // the budget, and the percentages worth a warning. Moved here from the
  // retired /material-columns screen, with the same reading rules.
  const [tracksSpend, setTracksSpend] = useState(row?.tracks_spend ?? false);
  const [budget, setBudget] = useState(row?.budget_amount ?? "");
  const [alerts, setAlerts] = useState(
    (row?.budget_alert_percentages ?? []).join(", "),
  );
  const [error, setError] = useState("");
  const isMaterial = form.kind === "MATERIAL";
  const parsedAlerts = parseAlertPercentages(alerts);
  const alertsInvalid = isMaterial && tracksSpend && parsedAlerts === null;
  const save = useMutation({
    mutationFn: () => {
      const payload: ProjectCategoryPayload = isMaterial
        ? {
            ...form,
            tracks_spend: tracksSpend,
            // Null, not "", for a column that counts nothing: the field is a
            // nullable decimal and an empty string is not a number.
            budget_amount: tracksSpend && budget.trim() ? budget.trim() : null,
            budget_alert_percentages:
              parsedAlerts ?? row?.budget_alert_percentages ?? [],
          }
        : form;
      return row
        ? updateProjectCategory(row.id, payload)
        : createProjectCategory(payload);
    },
    onSuccess: onSaved,
    onError: (reason) =>
      setError(
        reason instanceof ApiError ? reason.message : modules("saveFailed"),
      ),
  });
  const set = <K extends keyof ProjectCategoryPayload>(
    key: K,
    value: ProjectCategoryPayload[K],
  ) => setForm((old) => ({ ...old, [key]: value }));
  const toggle = (
    key: "allowed_roles" | "allowed_users",
    id: string,
    checked: boolean,
  ) =>
    set(
      key,
      checked
        ? [...new Set([...(form[key] ?? []), id])]
        : (form[key] ?? []).filter((value) => value !== id),
    );
  const restrictedEmpty =
    form.access_mode === "RESTRICTED" &&
    !(form.allowed_roles?.length || form.allowed_users?.length);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t(row ? "categories.editTitle" : "categories.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("categories.formHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Shown, not chosen: the column is made in the project the screen
              was opened on. */}
          <FieldWrapper label={t("field.project")} required className="sm:col-span-2">
            <ProjectPicker
              value={form.project}
              onValueChange={(next) => set("project", next)}
              placeholder={t("field.selectProject")}
              disabled
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.code")} required>
            <Input
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.name")} required>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("categories.kind")} required>
            <Select
              value={form.kind}
              onValueChange={(value) =>
                set("kind", value as ProjectCategoryKind)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Named exactly as Category Management names the module,
                    so the picker and the list on the left agree (one name per
                    module). Choosing another moves the column to that
                    module's list - and the server refuses the move if
                    records are already filed in it. */}
                <SelectItem value="MATERIAL">
                  {modules("module.material")}
                </SelectItem>
                <SelectItem value="EQUIPMENT">
                  {modules("module.equipment")}
                </SelectItem>
                <SelectItem value="PROGRESS">
                  {modules("module.progress")}
                </SelectItem>
                <SelectItem value="EHS">
                  {modules("module.ehs")}
                </SelectItem>
                <SelectItem value="CONSTRUCTION_WASTE">
                  {modules("module.debris")}
                </SelectItem>
                <SelectItem value="CONSULTANT">
                  {modules("module.consultant")}
                </SelectItem>
                <SelectItem value="SUNDRY">
                  {modules("module.sundry")}
                </SelectItem>
                {/* Only offered on a column that already carries the marker.
                    It is not a scheme somebody should pick on purpose - it
                    means "not separated yet" - but taking it off the form
                    would silently reclassify a legacy column on the next
                    unrelated edit. */}
                {row?.kind === "BOTH" && (
                  <SelectItem value="BOTH">
                    {t("categories.kindBoth")}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("categories.submissionMode")} required>
            <Select
              value={form.submission_mode}
              onValueChange={(value) =>
                set("submission_mode", value as CategorySubmissionMode)
              }
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DIRECT">{t("categories.submissionDirect")}</SelectItem>
                <SelectItem value="REVIEW">{t("categories.submissionReview")}</SelectItem>
                <SelectItem value="CONSULTANT">{t("categories.submissionConsultant")}</SelectItem>
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper
            label={t("field.description")}
            className="sm:col-span-2"
          >
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("categories.accessTitle")}
            required
            className="sm:col-span-2"
          >
            <Select
              value={form.access_mode}
              onValueChange={(value) =>
                set("access_mode", value as "ALL" | "RESTRICTED")
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("categories.accessAll")}</SelectItem>
                <SelectItem value="RESTRICTED">
                  {t("categories.accessRestricted")}
                </SelectItem>
              </SelectContent>
            </Select>
          </FieldWrapper>
          {form.access_mode === "RESTRICTED" && (
            <>
              <FieldWrapper label={t("categories.accessRoles")}>
                <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border p-3">
                  {(roles.data?.results ?? []).map((role) => (
                    <label
                      key={role.id}
                      className="flex min-h-10 items-center gap-3"
                    >
                      <Checkbox
                        checked={form.allowed_roles?.includes(role.id)}
                        onCheckedChange={(checked) =>
                          toggle("allowed_roles", role.id, checked === true)
                        }
                      />
                      <span className="text-sm font-medium">{role.name}</span>
                    </label>
                  ))}
                  {!roles.isLoading && !roles.isError && !roles.data?.results.length && (
                    <p className="text-sm text-muted-foreground">
                      {t("categories.noRoles")}
                    </p>
                  )}
                  <QueryFailedNote query={roles} what={t("what.roles")} />
                </div>
              </FieldWrapper>
              <FieldWrapper label={t("categories.accessUsers")}>
                <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border p-3">
                  {(people.data?.results ?? []).map((person) => (
                    <label
                      key={person.user}
                      className="flex min-h-10 items-center gap-3"
                    >
                      <Checkbox
                        checked={form.allowed_users?.includes(person.user)}
                        onCheckedChange={(checked) =>
                          toggle("allowed_users", person.user, checked === true)
                        }
                      />
                      <span className="text-sm font-medium">
                        {person.user_name}
                      </span>
                    </label>
                  ))}
                  {!people.isLoading && !people.isError && !people.data?.results.length && (
                    <p className="text-sm text-muted-foreground">
                      {t("categories.noUsers")}
                    </p>
                  )}
                  <QueryFailedNote query={people} what={t("what.projectPeople")} />
                </div>
              </FieldWrapper>
            </>
          )}
          {isMaterial && (
            <div className="grid gap-4 border-t pt-4 sm:col-span-2">
              <div>
                <h4 className="text-sm font-semibold">{modules("budget.title")}</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {modules("budget.help")}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={tracksSpend}
                  onCheckedChange={(checked) => setTracksSpend(checked === true)}
                />
                {modules("budget.tracksSpend")}
              </label>
              {tracksSpend && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldWrapper
                    label={modules("budget.amount")}
                    hint={modules("budget.amountHint")}
                  >
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={budget}
                      onChange={(event) => setBudget(event.target.value)}
                    />
                  </FieldWrapper>
                  <FieldWrapper
                    label={modules("budget.alerts")}
                    hint={modules("budget.alertsHint")}
                    error={alertsInvalid ? modules("budget.alertsInvalid") : undefined}
                  >
                    <Input
                      value={alerts}
                      onChange={(event) => setAlerts(event.target.value)}
                    />
                  </FieldWrapper>
                </div>
              )}
            </div>
          )}
          <FieldWrapper label={t("field.sortOrder")}>
            <Input
              type="number"
              min="0"
              value={form.sort_order}
              onChange={(e) => set("sort_order", Number(e.target.value))}
            />
          </FieldWrapper>
          <div className="grid gap-2 pt-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.is_visible_in_pwa}
                onCheckedChange={(checked) =>
                  set("is_visible_in_pwa", checked === true)
                }
              />
              {t("field.showInPwa")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.is_active}
                onCheckedChange={(checked) =>
                  set("is_active", checked === true)
                }
              />
              {t("field.active")}
            </label>
          </div>
        </div>
        {restrictedEmpty && (
          <p
            role="alert"
            className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning"
          >
            {t("categories.accessRequired")}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.project, t("field.project")],
              [form.code, t("field.code")],
              [form.name, t("field.name")],
              [!restrictedEmpty, t("categories.accessTitle")],
            ]}
            // Not a `requires` entry: the warning lines are optional - empty
            // means "do not warn me" - so listing them there would put a star
            // on a field that is not required. What is wrong when they cannot
            // be read is the text itself, and the field says so inline.
            disabledReason={
              alertsInvalid ? modules("budget.alertsInvalid") : undefined
            }
            disabled={save.isPending || alertsInvalid}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FieldTasksWorkspace({
  taskType,
}: { taskType?: FieldTask["task_type"] } = {}) {
  const t = useTranslations("contractorOps");
  const { can } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [project, setProject] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<FieldTask | null>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const [addingRefsTo, setAddingRefsTo] = useState<FieldTask | null>(null);
  const rows = useQuery({
    queryKey: ["field-tasks", project, taskType],
    queryFn: () =>
      getFieldTasks({
        page_size: 200,
        project: project || undefined,
        task_type: taskType,
      }),
  });
  const transition = useMutation({
    mutationFn: ({
      id,
      status,
      note,
    }: {
      id: string;
      status: FieldTask["status"];
      note?: string;
    }) => transitionFieldTask(id, status, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["field-tasks"] }),
  });
  const addReferences = useMutation({
    mutationFn: ({ id, files }: { id: string; files: File[] }) =>
      addFieldTaskReferences(id, files),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["field-tasks"] }),
  });
  /*
   * Same dialog treatment as the outgoing application below, and for the same
   * reasons: `window.prompt` is untranslated, cannot be marked required, and
   * is suppressed outright by some browsers - in which case returning a task
   * silently did nothing at all.
   */
  const [returning, setReturning] = useState<FieldTask | null>(null);
  const review = (row: FieldTask, status: FieldTask["status"]) => {
    if (status === "RETURNED") {
      setReturning(row);
      return;
    }
    transition.mutate({ id: row.id, status, note: "" });
  };
  return (
    <div className="space-y-5">
      <ListHeader
        title={t(
          taskType === "CONSULTANT"
            ? "tasks.consultantInboxTitle"
            : "tasks.title",
        )}
        subtitle={t(
          taskType === "CONSULTANT"
            ? "tasks.consultantInboxSubtitle"
            : "tasks.subtitle",
        )}
        action={
          !taskType && can("field_task.manage") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              {t("tasks.assign")}
            </Button>
          ) : undefined
        }
      />
      <ProjectFilter value={project} onChange={setProject} />
      <WorkspaceState
        loading={rows.isLoading}
        error={rows.isError}
        empty={!rows.data?.count}
      />
      {!!rows.data?.count && (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.data.results.map((row) => {
            const gpsPhoto = row.photos.find(
              (photo) => photo.latitude && photo.longitude,
            );
            const canPrepareApplication =
              taskType === "CONSULTANT" &&
              can("consultant.submit") &&
              ["SUBMITTED", "ACCEPTED"].includes(row.status);
            return (
              <article
                key={row.id}
                className="overflow-hidden rounded-lg border bg-card shadow-sm"
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <ClipboardCheck className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{row.title}</h3>
                        <StatusBadge
                          label={t(`taskStatus.${row.status}`)}
                          tone={tone(row.status)}
                        />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {row.project_name} · {row.assigned_to_name}
                      </p>
                      {row.submission_category && (
                        <p className="mt-2 text-xs font-semibold text-primary">
                          {row.submission_category}
                        </p>
                      )}
                      <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                        <p>
                          {t("tasks.assignedBy", {
                            name: row.created_by_name || t("state.unknown"),
                          })}
                        </p>
                        {row.work_location && (
                          <p>
                            {t("tasks.workLocation", {
                              location: row.work_location,
                            })}
                          </p>
                        )}
                        {row.submitted_at && (
                          <p>
                            {t("tasks.submittedAt", {
                              value: new Date(
                                row.submitted_at,
                              ).toLocaleString(),
                            })}
                          </p>
                        )}
                        {row.due_at && (
                          <p>
                            {t("tasks.dueAt", {
                              value: new Date(row.due_at).toLocaleString(),
                            })}
                          </p>
                        )}
                      </div>
                      <p className="mt-2 text-sm leading-6">
                        {row.instructions || t("state.noDescription")}
                      </p>
                      {row.references.length ? (
                        <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                          <p className="mb-2 text-xs font-semibold">
                            {t("tasks.references", {
                              count: row.references.length,
                            })}
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {row.references.map((reference) =>
                              reference.kind === "PHOTO" ? (
                                <a
                                  key={reference.id}
                                  href={reference.file}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Image
                                    src={reference.file}
                                    alt={
                                      reference.label ||
                                      reference.original_filename
                                    }
                                    width={180}
                                    height={180}
                                    unoptimized
                                    className="aspect-square w-full rounded-lg object-cover"
                                  />
                                </a>
                              ) : (
                                <a
                                  key={reference.id}
                                  href={reference.file}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="col-span-3 flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium text-primary hover:underline"
                                >
                                  <FileText className="size-4" />
                                  <span className="truncate">
                                    {reference.label ||
                                      reference.original_filename}
                                  </span>
                                </a>
                              ),
                            )}
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                        {row.photos.map((photo, index) => (
                          <a
                            key={photo.id}
                            href={photo.watermarked || photo.image}
                            target="_blank"
                            rel="noreferrer"
                            className="w-24 shrink-0"
                            title={`${index + 1} / ${row.photos.length}`}
                          >
                            <Image
                              src={photo.watermarked || photo.image}
                              alt=""
                              width={180}
                              height={180}
                              unoptimized
                              className="aspect-square w-full rounded-lg border object-cover"
                            />
                          </a>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {t("tasks.photos", {
                            current: row.photos.length,
                            required: row.evidence_required,
                          })}
                        </span>
                        {gpsPhoto ? (
                          <a
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                            href={`https://www.google.com/maps?q=${gpsPhoto.latitude},${gpsPhoto.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <MapPin className="size-3.5" />
                            {t("tasks.openGps")}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
                {(canPrepareApplication ||
                  (can("field_task.manage") &&
                    ["SUBMITTED", "OPEN", "RETURNED"].includes(row.status))) && (
                  <div className="flex flex-wrap justify-end gap-2 border-t bg-muted/20 p-3">
                    {can("field_task.manage") &&
                    ["OPEN", "RETURNED"].includes(row.status) ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => setEditing(row)}
                        >
                          <Pencil />
                          {t("tasks.edit")}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={addReferences.isPending}
                          onClick={() => {
                            setAddingRefsTo(row);
                            referenceInput.current?.click();
                          }}
                        >
                          <Paperclip />
                          {t("tasks.addReferences")}
                        </Button>
                      </>
                    ) : null}
                    {can("field_task.manage") && row.status === "SUBMITTED" ? (
                      <>
                        <Button
                          variant="outline"
                          disabled={transition.isPending}
                          onClick={() => review(row, "RETURNED")}
                        >
                          <RotateCcw />
                          {t("action.return")}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={transition.isPending}
                          onClick={() => review(row, "ACCEPTED")}
                        >
                          <Check />
                          {t("action.accept")}
                        </Button>
                      </>
                    ) : null}
                    {canPrepareApplication ? (
                      <Button
                        onClick={() =>
                          router.push(
                            `/consultant-applications/create?source_field_task=${row.id}`,
                          )
                        }
                      >
                        <FilePlus2 />
                        {t("tasks.prepareApplication")}
                      </Button>
                    ) : null}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {returning && (
        <ReturnReasonDialog
          reference={returning.title}
          pending={transition.isPending}
          onClose={() => setReturning(null)}
          onConfirm={(note) => {
            transition.mutate({
              id: returning.id,
              status: "RETURNED",
              note,
            });
            setReturning(null);
          }}
        />
      )}
      {creating && (
        <TaskDialog
          project={project}
          onClose={() => setCreating(false)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["field-tasks"] });
            setCreating(false);
          }}
        />
      )}
      {editing && (
        <TaskDialog
          project={editing.project}
          task={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["field-tasks"] });
            setEditing(null);
          }}
        />
      )}
      {/* One input for the whole list: the card that opened it is remembered
          in state, so every row does not carry a hidden file field. */}
      <input
        ref={referenceInput}
        className="hidden"
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (addingRefsTo && files.length) {
            addReferences.mutate({ id: addingRefsTo.id, files });
          }
          event.target.value = "";
          setAddingRefsTo(null);
        }}
      />
    </div>
  );
}

/**
 * Assign a task, or correct one nobody has started.
 *
 * The project stays fixed when correcting. Moving a task to another site
 * would leave it assigned to someone who is not on that site's team, and the
 * assignee list on this form is drawn from the project - so the two would
 * disagree without anything on screen saying why.
 */
/**
 * Which category a task of each type files under, or none (D-285).
 *
 * 「拍照」 and 「其他」 are the task itself - no business module's categories.
 */
export const TASK_CATEGORY_KIND: Partial<
  Record<FieldTaskPayload["task_type"], ProjectCategoryKind>
> = {
  MATERIAL: "MATERIAL",
  EQUIPMENT: "EQUIPMENT",
  PROGRESS: "PROGRESS",
  SAFETY: "EHS",
  WASTE: "CONSTRUCTION_WASTE",
  CONSULTANT: "CONSULTANT",
};

function TaskDialog({
  project,
  task,
  onClose,
  onSaved,
}: {
  project: string;
  task?: FieldTask;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps");
  const [form, setForm] = useState<FieldTaskPayload>({
    project: task?.project ?? project,
    title: task?.title ?? "",
    task_type: task?.task_type ?? "PHOTO",
    instructions: task?.instructions ?? "",
    work_location: task?.work_location ?? "",
    assigned_to: task?.assigned_to ?? "",
    category: task?.category ?? null,
    priority: task?.priority ?? "NORMAL",
    due_at: task?.due_at ?? null,
    evidence_required: task?.evidence_required ?? 1,
    submission_category: task?.submission_category ?? "",
  });
  // A consultant task names the application type the RFI form opens with.
  const applicationTypes = useQuery({
    queryKey: ["consultant-options", form.project, "APPLICATION_TYPE"],
    queryFn: () => getApplicationOptions(form.project, "APPLICATION_TYPE"),
    enabled: Boolean(form.project) && form.task_type === "CONSULTANT",
  });
  const team = useQuery({
    queryKey: ["project-assignments", form.project],
    queryFn: () => getProjectAssignments(form.project),
    enabled: Boolean(form.project),
  });
  // A photo or "other" task files under no category (D-285): they used to
  // need a 现场资料分类, which the customer never defined and which is gone.
  const categoryKind = TASK_CATEGORY_KIND[form.task_type];
  const categories = useQuery({
    queryKey: ["project-categories", form.project, "task-options", form.task_type],
    queryFn: () =>
      getProjectCategories({
        project: form.project,
        page_size: 200,
        kind: categoryKind,
        is_active: true,
      }),
    enabled: Boolean(form.project) && Boolean(categoryKind),
  });
  const set = <K extends keyof FieldTaskPayload>(
    key: K,
    value: FieldTaskPayload[K],
  ) => setForm((old) => ({ ...old, [key]: value }));
  const save = useMutation({
    mutationFn: () => task
      ? updateFieldTask(task.id, {
          title: form.title,
          task_type: form.task_type,
          instructions: form.instructions,
          work_location: form.work_location,
          assigned_to: form.assigned_to,
          category: form.category,
          priority: form.priority,
          due_at: form.due_at,
          evidence_required: form.evidence_required,
          submission_category: form.submission_category,
        })
      : createFieldTask(form),
    onSuccess: onSaved,
  });
  const chooseProject = (next: string) =>
    setForm((old) => ({
      ...old,
      project: next,
      assigned_to: "",
      category: null,
    }));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(task ? "tasks.editTitle" : "tasks.createTitle")}</DialogTitle>
          <DialogDescription>{t("tasks.formHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper
            label={t("field.project")}
            required
            className="sm:col-span-2"
          >
            {task ? (
              <p className="rounded-lg border bg-muted/30 p-3 text-sm">
                {task.project_name}
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t("tasks.projectFixed")}
                </span>
              </p>
            ) : (
              <ProjectPicker
                value={form.project}
                onValueChange={chooseProject}
                placeholder={t("field.selectProject")}
              />
            )}
          </FieldWrapper>
          <FieldWrapper
            label={t("field.title")}
            required
            className="sm:col-span-2"
          >
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.assignee")} required>
            <Select
              value={form.assigned_to || undefined}
              onValueChange={(v) => set("assigned_to", v)}
              disabled={!form.project}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("field.selectStaff")} />
              </SelectTrigger>
              <SelectContent>
                {(team.data?.results ?? []).map((item) => (
                  <SelectItem key={item.user} value={item.user}>
                    {item.user_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <QueryFailedNote query={team} what={t("what.projectPeople")} />
          </FieldWrapper>
          <FieldWrapper label={t("field.taskType")} required>
            <Select
              value={form.task_type}
              onValueChange={(v) => {
                set("task_type", v as FieldTaskPayload["task_type"]);
                set("category", null);
                // Where the phone takes a waste task: 工地清运 unless told otherwise.
                set("submission_category", v === "WASTE" ? "SITE_DISPOSAL" : "");
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  "PHOTO",
                  "MATERIAL",
                  "EQUIPMENT",
                  "PROGRESS",
                  "SAFETY",
                  "WASTE",
                  "CONSULTANT",
                  "OTHER",
                ].map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`taskType.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          {categoryKind && (
          <FieldWrapper label={t("field.category")} required>
            <Select
              value={form.category || undefined}
              onValueChange={(v) => set("category", v)}
              disabled={!form.project}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(categories.data?.results ?? [])
                  .filter((x) => x.is_active)
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <QueryFailedNote query={categories} what={t("what.columns")} />
          </FieldWrapper>
          )}
          {form.task_type === "WASTE" && (
            // The phone opens 环保材料出场申请 or 工地清运 by this value
            // (`taskRecordMode` in field-staff-workspace.tsx); without it every
            // office-issued waste task opened 工地清运 (T-382).
            <FieldWrapper label={t("tasks.route.label")} hint={t("tasks.route.hint")} className="sm:col-span-2">
              <Select
                value={form.submission_category || "SITE_DISPOSAL"}
                onValueChange={(v) => set("submission_category", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["SITE_DISPOSAL", "WASTE_OUTGOING"].map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`tasks.route.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
          )}
          {form.task_type === "CONSULTANT" && (
            <FieldWrapper label={t("tasks.applicationType.label")} hint={t("tasks.applicationType.hint")} className="sm:col-span-2">
              <Select
                value={form.submission_category || "__none"}
                onValueChange={(v) => set("submission_category", v === "__none" ? "" : v)}
                disabled={!form.project}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t("tasks.applicationType.none")}</SelectItem>
                  {(applicationTypes.data?.results ?? [])
                    .filter((row) => row.category === "APPLICATION_TYPE" && row.is_active)
                    .map((row) => (
                      <SelectItem key={row.id} value={row.code}>
                        {row.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <QueryFailedNote query={applicationTypes} what={t("tasks.applicationType.what")} />
            </FieldWrapper>
          )}
          <FieldWrapper label={t("field.priority")}>
            <Select
              value={form.priority}
              onValueChange={(v) =>
                set("priority", v as FieldTaskPayload["priority"])
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`priority.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.workLocation")}>
            <Input
              value={form.work_location ?? ""}
              onChange={(e) => set("work_location", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.dueAt")}>
            <Input
              type="datetime-local"
              defaultValue={localDateTime(form.due_at)}
              onChange={(e) =>
                set(
                  "due_at",
                  e.target.value
                    ? new Date(e.target.value).toISOString()
                    : null,
                )
              }
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.photoRequired")}>
            <Input
              type="number"
              min="1"
              max="20"
              value={form.evidence_required}
              onChange={(e) => set("evidence_required", Number(e.target.value))}
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("field.instructions")}
            className="sm:col-span-2"
          >
            <Textarea
              rows={4}
              value={form.instructions}
              onChange={(e) => set("instructions", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("tasks.referenceFiles")}
            className={task ? "hidden" : "sm:col-span-2"}
          >
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-center hover:border-primary/50 hover:bg-primary/5">
              <Paperclip className="mb-2 size-6 text-primary" />
              <span className="text-sm font-medium">
                {t("tasks.addReferences")}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {t("tasks.referenceHelp")}
              </span>
              <input
                className="hidden"
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                onChange={(event) =>
                  set("references", Array.from(event.target.files ?? []))
                }
              />
            </label>
            {!!form.references?.length && (
              <p className="mt-2 text-xs font-medium text-primary">
                {t("tasks.referencesSelected", {
                  count: form.references.length,
                })}
              </p>
            )}
          </FieldWrapper>
        </div>
        {save.isError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {save.error instanceof ApiError
              ? save.error.message
              : t("tasks.saveError")}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.project, t("field.project")],
              [form.title, t("field.title")],
              [!categoryKind || form.category, t("field.category")],
              [form.assigned_to, t("field.assignee")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t(task ? "action.save" : "action.assign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A datetime-local field wants local wall-clock text, not an ISO instant. */
function localDateTime(value?: string | null) {
  if (!value) return "";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * The phone's 设备进退场 (D-273, T-393).
 *
 * 「设备进退场的数据是不需要显示的，他们的工作就只是拍照而已」: the field
 * worker takes the photos, the office reads the figures. So this screen has no
 * totals, no equipment data cards and no movement history - those live on the
 * office list (`SiteEquipmentOffice`). What is left is what taking the photos
 * needs: the project, registering a machine that has just arrived, and the
 * machines by name, each with the one button that records its entry or its
 * exit. An exit still has to say which machine is leaving, and the name is how
 * a worker tells them apart; the code is added only when two share a name.
 *
 * Only the phone mounts this component (field-records-panel.tsx).
 */
export function SiteEquipmentWorkspace({ initialProject = "", fieldTaskId, onRecordSaved }: { initialProject?: string; fieldTaskId?: string; onRecordSaved?: () => void } = {}) {
  const t = useTranslations("contractorOps");
  const { can } = useAuth();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [project, setProject] = useState(initialProject);
  const [creating, setCreating] = useState(searchParams.get("create") === "1");
  // Kept in the draft, so tapping this 挂号 again reopens the form it was in
  // (D-259). Outside a draft this is ordinary state.
  const [movingId, setMovingId] = useDraftState<string | null>("open:movingEquipment", null);
  const rows = useQuery({
    queryKey: ["site-equipment", "field", project],
    queryFn: () =>
      getSiteEquipment({
        project: project || undefined,
        page_size: 200,
      }),
  });
  const equipment = rows.data?.results ?? [];
  const moving = equipment.find((row) => row.id === movingId) ?? null;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["site-equipment"] });
    void qc.invalidateQueries({ queryKey: ["equipment-movements"] });
    void qc.invalidateQueries({ queryKey: ["equipment-summary"] });
  };
  const equipmentError =
    rows.error instanceof Error ? rows.error.message : undefined;
  const sharedNames = new Map<string, number>();
  for (const row of equipment) {
    sharedNames.set(row.name, (sharedNames.get(row.name) ?? 0) + 1);
  }
  const machineName = (row: SiteEquipment) =>
    (sharedNames.get(row.name) ?? 0) > 1 ? `${row.name} (${row.code})` : row.name;
  // The same rule MovementDialog uses to pick the direction.
  const groups = [
    { direction: "ENTRY", rows: equipment.filter((row) => row.status !== "ON_SITE") },
    { direction: "EXIT", rows: equipment.filter((row) => row.status === "ON_SITE") },
  ] as const;
  return (
    <div className="space-y-5">
      <ListHeader
        title={t("equipment.title")}
        subtitle={t("equipment.subtitle")}
        action={
          can("equipment.manage") && (
            <Button
              requires={[[project, t("field.project")]]}
              onClick={() => setCreating(true)}
            >
              <Plus />
              {t("equipment.add")}
            </Button>
          )
        }
      />
      {/* The Add button takes its project from here, so it wears the star
          that button asks for. */}
      <FieldWrapper label={t("field.project")} required={can("equipment.manage")} className="rounded-lg border bg-card px-3 py-2 shadow-sm">
        <ProjectPicker
          value={project}
          onValueChange={(next) => setProject(next === "all" ? "" : next)}
          placeholder={t("field.selectProject")}
          allowAll
          allLabel={t("field.allProjects")}
          className="w-full sm:w-72"
        />
      </FieldWrapper>
      <WorkspaceState
        loading={rows.isLoading}
        error={rows.isError}
        errorMessage={equipmentError}
        empty={!rows.data?.count}
      />
      {groups.map(
        (group) =>
          group.rows.length > 0 && (
            <section
              key={group.direction}
              data-testid={`field-equipment-${group.direction.toLowerCase()}`}
              className="space-y-2"
            >
              <h2 className="text-sm font-semibold">
                {t(`direction.${group.direction}`)}
              </h2>
              <ul className="divide-y rounded-lg border bg-card shadow-sm">
                {group.rows.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {machineName(row)}
                    </span>
                    {can("equipment.capture") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setMovingId(row.id)}
                      >
                        <Camera />
                        {t(
                          group.direction === "EXIT"
                            ? "equipment.recordExit"
                            : "equipment.recordEntry",
                        )}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}
      {creating && (
        <EquipmentDialog
          project={project}
          onClose={() => setCreating(false)}
          onSaved={() => {
            refresh();
            setCreating(false);
          }}
        />
      )}
      {moving && (
        <MovementDialog
          row={moving}
          fieldTaskId={fieldTaskId}
          onClose={() => setMovingId(null)}
          onSaved={() => {
            refresh();
            setMovingId(null);
            onRecordSaved?.();
          }}
        />
      )}
    </div>
  );
}

/**
 * Register a machine, or correct its details.
 *
 * The movements already logged against it are untouched: this is the plate
 * and the serial number on the register, not the history of what went in and
 * out. That is also why the site is not offered when correcting - the
 * movements belong to the site the machine was registered on.
 */
export function EquipmentDialog({
  project,
  equipment,
  onClose,
  onSaved,
}: {
  project: string;
  equipment?: SiteEquipment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps");
  const suppliers = useQuery({
    queryKey: ["suppliers", "equipment-options"],
    queryFn: () => getSuppliers({ page_size: 200, sort_by: "name" }),
  });
  /*
   * This project's equipment columns (T-242). Filed here rather than picked
   * from a platform-wide list: the machines on a site belong to the project,
   * and so does the vocabulary that files them (F-369).
   */
  const columns = useQuery({
    queryKey: ["project-categories", "equipment", project],
    queryFn: () =>
      getProjectCategories({
        project,
        kind: "EQUIPMENT",
        page_size: 200,
        sort_by: "sort_order",
        sort_order: "asc",
      }),
    enabled: Boolean(project),
  });
  const [form, setForm] = useState<EquipmentPayload>({
    project,
    code: equipment?.code ?? "",
    name: equipment?.name ?? "",
    serial_no: equipment?.serial_no ?? "",
    registration_no: equipment?.registration_no ?? "",
    supplier: equipment?.supplier ?? null,
    category: equipment?.category ?? null,
    description: equipment?.description ?? "",
    certificate_expires_on: equipment?.certificate_expires_on ?? null,
    insurance_expires_on: equipment?.insurance_expires_on ?? null,
    is_active: equipment?.is_active ?? true,
  });
  const set = <K extends keyof EquipmentPayload>(
    key: K,
    value: EquipmentPayload[K],
  ) => setForm((old) => ({ ...old, [key]: value }));
  // Whether this project has anywhere to file a machine at all (D-169).
  const hasColumns = (columns.data?.results ?? []).length > 0;
  const save = useMutation({
    mutationFn: () => equipment
      ? updateSiteEquipment(equipment.id, {
          code: form.code,
          name: form.name,
          serial_no: form.serial_no,
          registration_no: form.registration_no,
          supplier: form.supplier,
          category: form.category,
          description: form.description,
          certificate_expires_on: form.certificate_expires_on,
          insurance_expires_on: form.insurance_expires_on,
          is_active: form.is_active,
        })
      : createSiteEquipment(form),
    onSuccess: onSaved,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t(equipment ? "equipment.editTitle" : "equipment.createTitle")}</DialogTitle>
          <DialogDescription>{t("equipment.formHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("field.code")} required>
            <Input
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.name")} required>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.serialNo")}>
            <Input
              value={form.serial_no}
              onChange={(e) => set("serial_no", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.registrationNo")}>
            <Input
              value={form.registration_no}
              onChange={(e) => set("registration_no", e.target.value)}
            />
          </FieldWrapper>
          {/* Where the home page's "certificate expiring" card gets its
              dates. Optional, because a contractor may not hold the paperwork
              for every item and a required field would be filled with a
              guess - a wrong expiry date is worse than a blank one. */}
          <FieldWrapper
            label={t("field.certificateExpiresOn")}
            hint={t("field.expiryHelp")}
          >
            <Input
              type="date"
              value={form.certificate_expires_on ?? ""}
              onChange={(e) =>
                set("certificate_expires_on", e.target.value || null)
              }
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.insuranceExpiresOn")}>
            <Input
              type="date"
              value={form.insurance_expires_on ?? ""}
              onChange={(e) =>
                set("insurance_expires_on", e.target.value || null)
              }
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.equipmentColumn")} required>
            {/*
              Required since D-169, which reverses D-160. The old shape offered
              "No column" as an explicit choice so that filing nothing was a
              decision somebody could see they had made - a reasonable guard
              against a required field being answered with the nearest thing.
              The customer overruled it on 2026-09-12:「新增设备必须要选分类
              不能不选分类 所以意思是他们一定要新增栏目」.

              The guard D-160 wanted is kept in a better place: when the
              project has no equipment column at all, this does not present an
              empty dropdown to be stared at - it says so and points at where
              columns are made. Nobody is cornered into guessing.
            */}
            <Select
              value={form.category ?? undefined}
              onValueChange={(v) => set("category", v)}
              disabled={!hasColumns}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("field.chooseEquipmentColumn")} />
              </SelectTrigger>
              <SelectContent>
                {(columns.data?.results ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.code} - {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <QueryFailedNote query={columns} what={t("what.columns")} className="mt-2" />
            {!columns.isLoading && !columns.isError && !hasColumns && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("field.noEquipmentColumnYet")}{" "}
                <Link
                  href="/category-management"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {t("field.goMakeEquipmentColumn")}
                </Link>
              </p>
            )}
          </FieldWrapper>
          <FieldWrapper label={t("field.supplier")}>
            <Select
              value={form.supplier ?? "none"}
              onValueChange={(v) => set("supplier", v === "none" ? null : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("field.noSupplier")}</SelectItem>
                {(suppliers.data?.results ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.code} - {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <QueryFailedNote query={suppliers} what={t("what.suppliers")} />
          </FieldWrapper>
          <FieldWrapper
            label={t("field.description")}
            className="sm:col-span-2"
          >
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </FieldWrapper>
          {equipment && (
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm sm:col-span-2">
              <span>
                <span className="block font-medium">{t("equipment.stillInUse")}</span>
                <span className="text-xs text-muted-foreground">
                  {t("equipment.stillInUseHelp")}
                </span>
              </span>
              <Checkbox
                checked={form.is_active}
                onCheckedChange={(checked) => set("is_active", Boolean(checked))}
              />
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.code, t("field.code")],
              [form.name, t("field.name")],
              [form.category, t("field.equipmentColumn")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Save />
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MovementDialog({
  row,
  fieldTaskId,
  onClose,
  onSaved,
}: {
  row: SiteEquipment;
  fieldTaskId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps");
  const { user } = useAuth();
  const isFieldStaff = Boolean(user?.is_field_staff);
  const direction = row.status === "ON_SITE" ? "EXIT" : "ENTRY";
  // F-282. Keys carry `row.id` because this dialog opens per equipment row
  // while the draft store is scoped per *task*: without the suffix, typing
  // against excavator A and then opening excavator B would show A's figures
  // under B's name, which is a wrong record rather than a recovered one.
  const [operator, setOperator] = useDraftState(`operator:${row.id}`, "");
  const [vehicle, setVehicle] = useDraftState(`vehicle:${row.id}`, "");
  const [deliveryNote, setDeliveryNote] = useDraftState(`deliveryNote:${row.id}`, "");
  const [quantity, setQuantity] = useDraftState(`quantity:${row.id}`, "1");
  const [unit, setUnit] = useDraftState<EquipmentUnit>(`unit:${row.id}`, "UNIT");
  const [notes, setNotes] = useDraftState(`notes:${row.id}`, "");
  const [photos, setPhotos] = useDraftState<File[]>(`photos:${row.id}`, []);
  const [fieldEvidence, setFieldEvidence] = useDraftState(`fieldEvidence:${row.id}`, createEmptyFieldEvidence);
  const [deliveryNotePhoto, setDeliveryNotePhoto] = useDraftState<File | undefined>(`deliveryNotePhoto:${row.id}`);
  const clearDraft = useClearDraft();
  const [ocr, setOcr] = useState<{
    status: string;
    suggestions?: Record<string, string>;
  }>();
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState(false);
  const fieldPhotos = completedFieldEvidence(fieldEvidence);
  const submissionPhotos = isFieldStaff ? fieldPhotos : photos;
  const equipmentEvidenceLabels = [
    t("equipmentEvidence.overview"),
    t("equipmentEvidence.identity"),
    t("equipmentEvidence.transport"),
    t("equipmentEvidence.condition"),
  ];
  const ocrMutation = useMutation({
    mutationFn: () => {
      if (!deliveryNotePhoto)
        throw new Error("Take a delivery-note photo first.");
      return ocrEquipmentDeliveryNote(row.project, deliveryNotePhoto);
    },
    onSuccess: (result) => {
      setOcr(result);
      setError("");
      const suggestions = result.suggestions ?? {};
      if (suggestions.delivery_note_no)
        setDeliveryNote(suggestions.delivery_note_no);
      if (suggestions.vehicle_plate) setVehicle(suggestions.vehicle_plate);
      const suggestedUnit = String(suggestions.unit ?? "").toUpperCase() as EquipmentUnit;
      if (EQUIPMENT_UNITS.includes(suggestedUnit)) setUnit(suggestedUnit);
    },
    onError: (reason) =>
      setError(
        reason instanceof ApiError ? reason.message : t("equipment.ocrManual"),
      ),
  });
  const save = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Authentication required.");
      return submitEquipmentMovementOfflineAware(user.id, {
        project: row.project,
        equipment: row.id,
        direction,
        quantity,
        unit,
        operator_name: isFieldStaff ? user.full_name : operator.trim(),
        vehicle_plate: vehicle.trim(),
        delivery_note_no: deliveryNote.trim(),
        notes: notes.trim(),
        ocr_confirmed: Boolean(deliveryNotePhoto || deliveryNote.trim()),
        original_occurred_at: new Date().toISOString(),
        client_event_id: crypto.randomUUID(),
        field_task: fieldTaskId,
        latitude: location?.latitude,
        longitude: location?.longitude,
        accuracy_m: location?.accuracy,
        photos: submissionPhotos,
        delivery_note_photo: deliveryNotePhoto,
      });
    },
    onMutate: () => {
      setError("");
      setFieldErrors({});
    },
    onSuccess: () => {
      clearDraft();
      onSaved();
    },
    onError: (reason) => {
      if (reason instanceof ApiError) {
        setFieldErrors(reason.errors);
        const inlineFields = new Set([
          "operator_name",
          "quantity",
          "unit",
          "photos",
          "latitude",
          "longitude",
          "accuracy_m",
        ]);
        const hiddenDetails = Object.entries(reason.errors)
          .filter(([field, message]) => !inlineFields.has(field) && message)
          .map(([, message]) => message)
          .join(" ");
        setError(
          hiddenDetails ||
            reason.message ||
            t("equipment.submissionError"),
        );
        return;
      }
      setFieldErrors({});
      setError(t("state.loadError"));
    },
  });
  const locate = async () => {
    setLocationError(false);
    try {
      setLocation(await currentCoordinates());
    } catch {
      setLocationError(true);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t(
              direction === "ENTRY"
                ? "equipment.entryTitle"
                : "equipment.exitTitle",
              { name: row.name },
            )}
          </DialogTitle>
          <DialogDescription>{t("equipment.movementHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {!isFieldStaff ? (
            <FieldWrapper
              label={t("field.operator")}
              required
              error={fieldErrors.operator_name}
            >
              <Input
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
              />
            </FieldWrapper>
          ) : null}
          <FieldWrapper
            label={t("field.quantity")}
            required
            error={fieldErrors.quantity}
          >
            <Input
              type="number"
              min="0.001"
              step="0.001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("field.unit")}
            required
            error={fieldErrors.unit}
          >
            <Select
              value={unit}
              onValueChange={(value) => setUnit(value as EquipmentUnit)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EQUIPMENT_UNITS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.vehiclePlate")}>
            <Input
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value.toUpperCase())}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.deliveryNote")}>
            <Input
              value={deliveryNote}
              onChange={(e) => setDeliveryNote(e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("equipment.deliveryNotePhoto")} required
            className="sm:col-span-2"
          >
            <FieldCamera
              label={
                deliveryNotePhoto
                  ? t("equipment.deliveryNoteReady")
                  : t("equipment.takeDeliveryNote")
              }
              file={deliveryNotePhoto}
              fileCount={deliveryNotePhoto ? 1 : 0}
              onCapture={setDeliveryNotePhoto}
              onClear={() => {
                setDeliveryNotePhoto(undefined);
                setOcr(undefined);
              }}
            />
            <Button
              type="button"
              className="mt-2"
              variant="outline"
              requires={[[deliveryNotePhoto, t("equipment.deliveryNotePhoto")]]}
              disabled={ocrMutation.isPending}
              onClick={() => ocrMutation.mutate()}
            >
              {ocrMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ScanText />
              )}
              {t("equipment.readDeliveryNote")}
            </Button>
            {ocr?.suggestions && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("equipment.ocrReady")}
              </p>
            )}
          </FieldWrapper>
          <FieldWrapper
            label={t("field.photos")}
            required
            error={fieldErrors.photos}
            className="sm:col-span-2"
          >
            {isFieldStaff ? (
              <>
                <FieldEvidenceGrid
                  labels={equipmentEvidenceLabels}
                  files={fieldEvidence}
                  progressLabel={t("evidenceProgress", {
                    current: fieldPhotos.length,
                    required: FIELD_EVIDENCE_PHOTO_COUNT,
                  })}
                  onChange={setFieldEvidence}
                  // 最少 4 张、最多 5 张, the delivery-order photo included -
                  // the same count the server refuses above (D-257).
                  maxFiles={EQUIPMENT_PHOTO_MAX - (deliveryNotePhoto ? 1 : 0)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("equipment.photoRange", { min: FIELD_EVIDENCE_PHOTO_COUNT, max: EQUIPMENT_PHOTO_MAX })}
                </p>
              </>
            ) : (
              <FieldCamera
                label={t("field.photos")}
                fileCount={photos.length}
                onCapture={(file) => setPhotos((items) => [...items, file])}
                onClear={() => setPhotos([])}
              />
            )}
          </FieldWrapper>
          <FieldWrapper
            label={t("field.location")}
            required
            error={
              locationError
                ? t("state.locationError")
                : fieldErrors.latitude ||
                  fieldErrors.longitude ||
                  fieldErrors.accuracy_m
            }
            className="sm:col-span-2"
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => void locate()}
            >
              <MapPin />
              {location ? t("action.locationReady") : t("action.getLocation")}
            </Button>
          </FieldWrapper>
          <FieldWrapper label={t("field.notes")} className="sm:col-span-2">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FieldWrapper>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [isFieldStaff || operator, t("field.operator")],
              [quantity && Number(quantity) > 0, t("field.quantity")],
              [
                submissionPhotos.length >=
                  (isFieldStaff ? FIELD_EVIDENCE_PHOTO_COUNT : 1) &&
                  (!isFieldStaff || hasRequiredFieldEvidence(fieldEvidence)),
                t("field.photos"),
              ],
              [location, t("field.location")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Camera />
            {t("action.record")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SiteProgressWorkspace({ initialProject = "", fieldTaskId, onRecordSaved }: { initialProject?: string; fieldTaskId?: string; onRecordSaved?: () => void } = {}) {
  const t = useTranslations("contractorOps");
  const { can } = useAuth();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [project, setProject] = useState(initialProject);
  const [addingPhase, setAddingPhase] = useState(false);
  const [editingPhase, setEditingPhase] = useState<ConstructionPhase | null>(
    null,
  );
  // Kept in the draft, so tapping this 挂号 again reopens the form it was in
  // (D-259). Outside a draft (the office) this is ordinary state.
  const [addingRecord, setAddingRecord] = useDraftState("open:addingRecord",
    Boolean(fieldTaskId) || searchParams.get("create") === "1",
  );
  // Which record the office is filing, if any (T-231). Filing is allowed on a
  // record of any status, including a confirmed one: the column is the
  // contractor's filing scheme, not part of what the record proves.
  const [filing, setFiling] = useState<SiteProgressRecord | null>(null);
  const phases = useQuery({
    queryKey: ["construction-phases", project],
    queryFn: () =>
      getConstructionPhases({ project: project || undefined, page_size: 200 }),
  });
  const rows = useQuery({
    queryKey: ["site-progress", project],
    queryFn: () =>
      getSiteProgressRecords({ project: project || undefined, page_size: 200 }),
  });
  const summary = useQuery({
    queryKey: ["site-progress-summary", project],
    queryFn: () => getSiteProgressSummary(project || undefined),
  });
  /*
   * No approve/return here (D-225).
   *
   * 「工程进度不需要【批准】【退回】，也不做强制闭环 —— 它是持续记录，不是
   * 申请事项」. What the office does with a progress record is talk about it,
   * annotate it and file it into a column; none of those is a decision, so
   * none of them gates the record. The endpoint behind the old buttons is
   * gone too, which is why this is a deletion rather than a hidden button.
   */
  // Both Add buttons used to be gated on the list filter, which defaults to
  // "all projects" (an empty string), so they sat dead on arrival with nothing
  // on screen explaining why — the same trap described in OutgoingDialog below.
  // The dialogs now own the project choice. Recording progress additionally
  // needs a phase to exist, so a project with none gets a callout that opens
  // the phase dialog rather than a disabled button.
  const noPhases =
    !!project && !phases.isLoading && !phases.isError && !phases.data?.count;
  // The same filter the list is showing, so the file and the screen agree -
  // the API renders the filtered queryset rather than running its own.
  const runProgressExport = (format: "xlsx" | "pdf") =>
    exportSiteProgressRecords({
      format,
      title: t("progress.title"),
      subtitle: t("progress.subtitle"),
      emptyLabel: t("state.empty"),
      query: { ...(project ? { project } : {}) },
      columns: [
        { key: "captured_at", label: t("progress.capturedAt") },
        { key: "project_name", label: t("field.project") },
        { key: "phase_name", label: t("field.phase") },
        { key: "percent_complete", label: t("field.percentComplete") },
        { key: "description", label: t("field.description") },
        {
          key: "status",
          label: t("field.status"),
          values: {
            SUBMITTED: t("progressStatus.SUBMITTED"),
            CONFIRMED: t("progressStatus.CONFIRMED"),
            RETURNED: t("progressStatus.RETURNED"),
          },
        },
        { key: "submitted_by_name", label: t("progress.submittedBy") },
        { key: "confirmed_by_name", label: t("progress.confirmedBy") },
        { key: "confirmed_at", label: t("progress.confirmedAt") },
        { key: "latitude", label: t("field.latitude") },
        { key: "longitude", label: t("field.longitude") },
      ],
    });
  return (
    <div className="space-y-5">
      <ListHeader
        title={t("progress.title")}
        subtitle={t("progress.subtitle")}
        action={
          <div className="flex flex-wrap gap-2">
            {can("report.export") && (
              <ExportButton
                onExport={runProgressExport}
                disabled={!rows.data?.count}
              />
            )}
            {can("progress.manage") && (
              <Button variant="outline" onClick={() => setAddingPhase(true)}>
                <Plus />
                {t("progress.addPhase")}
              </Button>
            )}
            {can("progress.manage") && (
              <Button onClick={() => setAddingRecord(true)}>
                <Camera />
                {t("progress.addRecord")}
              </Button>
            )}
          </div>
        }
      />
      <ProjectFilter value={project} onChange={setProject} />
      {(summary.data || summary.isError) && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(["today", "month", "year", "total"] as const).map((key) => (
            <div key={key} className="rounded-lg border bg-card p-3 shadow-sm">
              <p className="text-xs text-muted-foreground">
                {t(`progress.summary.${key}`)}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {summary.isError ? "—" : summary.data?.[key]}
              </p>
            </div>
          ))}
        </div>
      )}
      <QueryFailedNote query={summary} what={t("what.progressSummary")} />
      <div className="flex flex-wrap gap-2">
        {(phases.data?.results ?? []).map((phase) =>
          can("progress.manage") ? (
            <button
              key={phase.id}
              type="button"
              title={t("progress.editPhase")}
              className={`rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted ${phase.is_active ? "bg-card" : "bg-muted/40 text-muted-foreground line-through"}`}
              onClick={() => setEditingPhase(phase)}
            >
              {phase.code} · {phase.name}
            </button>
          ) : (
            <span
              key={phase.id}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${phase.is_active ? "bg-card" : "bg-muted/40 text-muted-foreground line-through"}`}
            >
              {phase.code} · {phase.name}
            </span>
          ),
        )}
      </div>
      <QueryFailedNote query={phases} what={t("what.phases")} />
      {noPhases && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/20 p-4">
          <p className="text-sm text-muted-foreground">
            {t("progress.noPhasesHelp")}
          </p>
          {can("progress.manage") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddingPhase(true)}
            >
              <ListTree />
              {t("progress.addFirstPhase")}
            </Button>
          )}
        </div>
      )}
      <WorkspaceState
        loading={rows.isLoading}
        error={rows.isError}
        empty={!rows.data?.count}
      />
      {!!rows.data?.count && (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.data.results.map((row) => (
            <article
              key={row.id}
              className="overflow-hidden rounded-lg border bg-card shadow-sm"
            >
              {row.photos[0] && (
                <Image
                  src={row.photos[0].watermarked || row.photos[0].image}
                  alt=""
                  width={900}
                  height={320}
                  unoptimized
                  className="h-44 w-full object-cover"
                />
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{row.phase_name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {row.project_name} · {row.submitted_by_name}
                    </p>
                  </div>
                  <StatusBadge
                    label={t(`progressStatus.${row.status}`)}
                    tone={tone(row.status)}
                  />
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(100, Number(row.percent_complete))}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-right text-sm font-semibold">
                  {row.percent_complete}%
                </p>
                <p className="mt-2 text-sm">
                  {row.description || t("state.noDescription")}
                </p>
                {/* Where this record files, and the way to change it. Shown to
                    everyone who can read the list, because "unfiled" is a
                    state somebody has to notice; only the reviewer can act on
                    it, which is the permission the server checks. */}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
                  <span className="text-xs text-muted-foreground">
                    {t("filing.fileInto")}
                  </span>
                  <span className="font-medium">
                    {row.category_name || t("filing.unfiled")}
                  </span>
                  {can("progress.confirm") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={() => setFiling(row)}
                    >
                      <FolderOpen />
                      {t("filing.action")}
                    </Button>
                  )}
                </div>
                {/* 【沟通】 is one of the three things D-225 keeps on a progress
                    record (沟通、备注、上传). */}
                <div className="mt-3 flex justify-end">
                  <RecordConversationButton
                    kind="PROGRESS"
                    recordId={row.id}
                    reference={`${row.phase_name} / ${row.percent_complete}%`}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {filing && (
        <FileIntoColumnDialog
          projectId={filing.project}
          kind="PROGRESS"
          current={filing.category ?? null}
          reference={`${filing.phase_name} / ${filing.percent_complete}%`}
          onFile={(category, reason) =>
            fileProgressRecord(filing.id, { category, reason })
          }
          onFiled={() => {
            void qc.invalidateQueries({ queryKey: ["site-progress"] });
            void qc.invalidateQueries({ queryKey: ["project-categories"] });
          }}
          onClose={() => setFiling(null)}
        />
      )}
      {editingPhase && (
        <PhaseDialog
          project={project}
          phase={editingPhase}
          onClose={() => setEditingPhase(null)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["construction-phases"] });
            setEditingPhase(null);
          }}
        />
      )}
      {addingPhase && (
        <PhaseDialog
          project={project}
          onClose={() => setAddingPhase(false)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["construction-phases"] });
            setAddingPhase(false);
          }}
        />
      )}
      {addingRecord && (
        <ProgressDialog
          project={project}
          fieldTaskId={fieldTaskId}
          onClose={() => setAddingRecord(false)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["site-progress"] });
            void qc.invalidateQueries({ queryKey: ["site-progress-summary"] });
            setAddingRecord(false);
            onRecordSaved?.();
          }}
        />
      )}
    </div>
  );
}

export function PhaseDialog({
  project: initialProject,
  phase,
  onClose,
  onSaved,
}: {
  project: string;
  /** Present when correcting one that already exists. */
  phase?: ConstructionPhase;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps");
  const [project, setProject] = useState(phase?.project ?? initialProject);
  const [code, setCode] = useState(phase?.code ?? "");
  const [name, setName] = useState(phase?.name ?? "");
  const [description, setDescription] = useState(phase?.description ?? "");
  const [isActive, setIsActive] = useState(phase?.is_active ?? true);
  // The weight this phase carries against the project's other phases (D-127).
  // Prefilled with the server's default of 1, so a phase nobody weighs counts
  // the same as every other; left blank it is simply not sent, and the server
  // keeps the value it has.
  const [plannedWeight, setPlannedWeight] = useState(phase?.planned_weight ?? "1");
  const weight = plannedWeight.trim().replace(",", ".") || undefined;
  const save = useMutation({
    mutationFn: () =>
      phase
        ? updateConstructionPhase(phase.id, {
            code,
            name,
            description,
            planned_weight: weight,
            is_active: isActive,
          })
        : createConstructionPhase({ project, code, name, description, planned_weight: weight }),
    onSuccess: onSaved,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("progress.phaseTitle")}</DialogTitle>
          <DialogDescription>{t("progress.phaseHelp")}</DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("field.project")} required>
          <ProjectPicker
            value={project}
            onValueChange={setProject}
            placeholder={t("field.selectProject")}
          />
        </FieldWrapper>
        <FieldWrapper label={t("field.code")} required>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </FieldWrapper>
        <FieldWrapper label={t("field.name")} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("field.description")}>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FieldWrapper>
        <FieldWrapper label={t("progress.plannedWeight")} hint={t("progress.plannedWeightHelp")}>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            max="9999.999"
            step="0.001"
            value={plannedWeight}
            onChange={(e) => setPlannedWeight(e.target.value)}
          />
        </FieldWrapper>
        {phase && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            {t("progress.phaseActive")}
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [project, t("field.project")],
              [code, t("field.code")],
              [name, t("field.name")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Save />
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProgressDialog({
  project: initialProject,
  fieldTaskId,
  onClose,
  onSaved,
}: {
  project: string;
  fieldTaskId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // The phase list follows the project chosen here rather than the list filter,
  // so opening this from "all projects" still works: pick a project, and its
  // phases load. A project with no phases yet says so instead of offering an
  // empty select the submit button would silently refuse.
  const t = useTranslations("contractorOps");
  const { user } = useAuth();
  const isFieldStaff = Boolean(user?.is_field_staff);
  // F-282
  const [project, setProject] = useDraftState("project", initialProject);
  const [phase, setPhase] = useDraftState("phase", "");
  const [category, setCategory] = useDraftState("category", "");
  const [percent, setPercent] = useDraftState("percent", "");
  const [description, setDescription] = useDraftState("description", "");
  const [photos, setPhotos] = useDraftState<File[]>("photos", []);
  const [fieldEvidence, setFieldEvidence] = useDraftState("fieldEvidence", createEmptyFieldEvidence);
  const clearDraft = useClearDraft();
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [error, setError] = useState("");
  const fieldPhotos = completedFieldEvidence(fieldEvidence);
  const submissionPhotos = isFieldStaff ? fieldPhotos : photos;
  const progressEvidenceLabels = [
    t("progressEvidence.overview"),
    t("progressEvidence.activity"),
    t("progressEvidence.detail"),
    t("progressEvidence.reference"),
  ];
  const phases = useQuery({
    queryKey: ["construction-phases", project],
    queryFn: () => getConstructionPhases({ project, page_size: 200 }),
    enabled: !!project,
  });
  const options = phases.data?.results ?? [];
  const save = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Authentication required.");
      return submitSiteProgressOfflineAware(user.id, {
        project,
        category,
        phase,
        percent_complete: percent,
        description,
        captured_at: new Date().toISOString(),
        latitude: location?.latitude,
        longitude: location?.longitude,
        client_event_id: crypto.randomUUID(),
        field_task: fieldTaskId,
        photos: submissionPhotos,
      });
    },
    onSuccess: () => {
      clearDraft();
      onSaved();
    },
    onError: (reason) =>
      setError(
        reason instanceof ApiError ? reason.message : t("progress.saveError"),
      ),
  });
  const locate = async () => {
    setLocationError(false);
    setError("");
    try {
      setLocation(await currentCoordinates());
    } catch {
      setLocationError(true);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("progress.recordTitle")}</DialogTitle>
          <DialogDescription>{t("progress.recordHelp")}</DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("field.project")} required>
          <ProjectPicker
            value={project}
            onValueChange={(next) => {
              setProject(next);
              setPhase("");
              setCategory("");
            }}
            placeholder={t("field.selectProject")}
          />
        </FieldWrapper>
        <ProjectColumnPicker project={project} kind="PROGRESS" value={category} onChange={setCategory} />
        <FieldWrapper
          label={t("field.phase")}
          required
          error={
            !!project && !phases.isLoading && !phases.isError && !options.length
              ? t("progress.noPhasesHelp")
              : undefined
          }
        >
          <Select
            value={phase || undefined}
            onValueChange={setPhase}
            disabled={!project || !options.length}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("field.selectPhase")} />
            </SelectTrigger>
            <SelectContent>
              {options.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.code} - {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <QueryFailedNote query={phases} what={t("what.phases")} />
        </FieldWrapper>
        <FieldWrapper label={t("field.percentComplete")} required>
          <Input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
        </FieldWrapper>
        <FieldWrapper label={t("field.photos")} required>
          {isFieldStaff ? (
            <FieldEvidenceGrid
              labels={progressEvidenceLabels}
              files={fieldEvidence}
              progressLabel={t("evidenceProgress", {
                current: fieldPhotos.length,
                required: FIELD_EVIDENCE_PHOTO_COUNT,
              })}
              onChange={setFieldEvidence}
            />
          ) : (
            <FieldCamera
              label={t("field.photos")}
              fileCount={photos.length}
              onCapture={(file) => setPhotos((items) => [...items, file])}
              onClear={() => setPhotos([])}
            />
          )}
        </FieldWrapper>
        <FieldWrapper
          label={t("field.location")}
          required
          error={locationError ? t("state.locationError") : undefined}
        >
          <Button variant="outline" onClick={() => void locate()}>
            <MapPin />
            {location ? t("action.locationReady") : t("action.getLocation")}
          </Button>
        </FieldWrapper>
        <FieldWrapper label={t("field.description")}>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FieldWrapper>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [project, t("field.project")],
              [phase, t("field.phase")],
              [category, t("field.category")],
              [percent, t("field.percentComplete")],
              [
                submissionPhotos.length >=
                  (isFieldStaff ? FIELD_EVIDENCE_PHOTO_COUNT : 1) &&
                  (!isFieldStaff || hasRequiredFieldEvidence(fieldEvidence)),
                t("field.photos"),
              ],
              [location, t("field.location")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Camera />
            {t("action.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MaterialOutgoingWorkspace({ initialProject = "", fieldTaskId, onRecordSaved }: { initialProject?: string; fieldTaskId?: string; onRecordSaved?: () => void } = {}) {
  const t = useTranslations("contractorOps");
  const tRoot = useTranslations();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [project, setProject] = useState(initialProject);
  // Kept in the draft, so tapping this 挂号 again reopens the form it was in
  // (D-259). Outside a draft (the office) this is ordinary state.
  const [creating, setCreating] = useDraftState("open:creating", Boolean(fieldTaskId));
  const rows = useQuery({
    queryKey: ["material-outgoing", project],
    queryFn: () =>
      getMaterialOutgoing({ project: project || undefined, page_size: 200 }),
  });
  const review = useMutation({
    mutationFn: ({
      id,
      status,
      note,
    }: {
      id: string;
      status: MaterialOutgoing["status"];
      note?: string;
    }) => reviewMaterialOutgoing(id, status, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["material-outgoing"] }),
  });
  /*
   * Rejecting opens a dialog; approving and releasing do not (T-297, D-211).
   *
   * The reason used to be collected with `window.prompt`. Three things were
   * wrong with that and only the first is cosmetic: it is not translatable, so
   * a Malay-speaking clerk was asked in English; it cannot be styled or marked
   * required, so the one field the customer insisted on looked optional; and
   * some browsers suppress it outright on a page that has not been interacted
   * with, in which case the reject silently did nothing.
   *
   * 「驳回 → 该次申请结束」 (D-211), so the reason is the last thing anybody
   * will ever be told about why - it is worth a real form.
   */
  const [rejecting, setRejecting] = useState<MaterialOutgoing | null>(null);
  // The site's return after approval, and the office's detail view (D-211,
  // T-358). One state each rather than a mode flag: they are different
  // people's steps and never open together.
  const [returning, setReturning] = useState<MaterialOutgoing | null>(null);
  const [viewing, setViewing] = useState<MaterialOutgoing | null>(null);
  const runExport = (format: "xlsx" | "pdf") =>
    exportMaterialOutgoing({
      format,
      title: t("outgoing.title"),
      emptyLabel: t("state.empty"),
      query: { project: project || undefined },
      columns: [
        { key: "reference_no", label: t("outgoing.referenceNo") },
        { key: "material_name", label: t("field.material") },
        { key: "quantity", label: t("field.quantity") },
        { key: "unit", label: t("field.unit") },
        { key: "destination", label: t("field.destination") },
        { key: "status", label: t("field.status") },
        { key: "submitted_by_name", label: t("outgoing.submittedBy") },
        { key: "captured_at", label: t("outgoing.capturedAt") },
      ],
      // Per-unit totals at the foot of the PDF, never added across units -
      // the same block the receipt export prints.
      summary: {
        groupBy: "unit",
        title: tRoot("exportTotals.title"),
        unitLabel: t("field.unit"),
        quantityLabel: tRoot("exportTotals.quantity"),
        note: tRoot("exportTotals.note"),
      },
    });
  const reviewRow = (
    row: MaterialOutgoing,
    status: MaterialOutgoing["status"],
  ) => {
    if (status === "REJECTED") {
      setRejecting(row);
      return;
    }
    review.mutate({ id: row.id, status, note: "" });
  };
  return (
    <div className="space-y-5">
      <ListHeader
        title={t("outgoing.title")}
        subtitle={t("outgoing.subtitle")}
        action={
          <div className="flex flex-wrap gap-2">
            {can("report.export") && (
              <ExportButton
                onExport={runExport}
                disabled={!rows.data?.count}
              />
            )}
            {can("material_outgoing.submit") ? (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                {t("outgoing.add")}
              </Button>
            ) : null}
          </div>
        }
      />
      <ProjectFilter value={project} onChange={setProject} />
      <WorkspaceState
        loading={rows.isLoading}
        error={rows.isError}
        empty={!rows.data?.count}
      />
      {!!rows.data?.count && (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.data.results.map((row) => (
            <article
              key={row.id}
              className="rounded-lg border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <PackageOpen className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{row.reference_no}</h3>
                    <StatusBadge
                      label={t(`outgoingStatus.${row.status}`)}
                      tone={tone(row.status)}
                    />
                  </div>
                  <p className="mt-1 text-sm">
                    {row.material_name} · {row.quantity} {row.unit}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("outgoing.executor")}: {row.executor_name}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {row.destination}
                  </p>
                </div>
              </div>
              {/* Record Communication on the card itself (T-360, D-211). 「后台沟通」
                  is a step of this flow - 申请 → 后台沟通 → 批准／驳回 - so it has to
                  be where the application is, not in the archive queue. */}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setViewing(row)}
                >
                  <Eye />
                  {t("outgoing.viewDetail")}
                </Button>
                <RecordConversationButton
                  kind="MATERIAL_OUTGOING"
                  recordId={row.id}
                  reference={row.reference_no}
                />
              </div>
              <div className="mt-4 space-y-2 border-t pt-3 empty:hidden">
                <OutgoingActions
                  row={row}
                  pending={review.isPending}
                  onReview={(status) => reviewRow(row, status)}
                  onReturn={() => setReturning(row)}
                />
              </div>
            </article>
          ))}
        </div>
      )}
      {returning && (
        <ReturnProcessingDialog
          row={returning}
          onClose={() => setReturning(null)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["material-outgoing"] });
            void qc.invalidateQueries({ queryKey: ["my-submissions"] });
            setReturning(null);
          }}
        />
      )}
      {viewing && (
        <OutgoingDetailDialog
          id={viewing.id}
          onClose={() => setViewing(null)}
          renderActions={(current) => (
            <OutgoingActions
              row={current}
              pending={review.isPending}
              onReview={(status) => reviewRow(current, status)}
              onReturn={() => setReturning(current)}
            />
          )}
        />
      )}
      {rejecting && (
        <RejectOutgoingDialog
          row={rejecting}
          pending={review.isPending}
          onClose={() => setRejecting(null)}
          onConfirm={(note) => {
            review.mutate({ id: rejecting.id, status: "REJECTED", note });
            setRejecting(null);
          }}
        />
      )}
      {creating && (
        <OutgoingDialog
          project={project}
          fieldTaskId={fieldTaskId}
          onClose={() => setCreating(false)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["material-outgoing"] });
            setCreating(false);
            onRecordSaved?.();
          }}
        />
      )}
    </div>
  );
}

/**
 * What can be done to one outgoing application, for whoever is looking.
 *
 * One component for the phone card and the office detail's right column
 * (C-020: 「那些按钮放在图 2 的圈起来的位置」), so the two can never offer
 * different steps for the same state.
 */
export function OutgoingActions({
  row,
  pending,
  onReview,
  onReturn,
}: {
  row: MaterialOutgoing;
  pending: boolean;
  onReview: (status: MaterialOutgoing["status"]) => void;
  onReturn: () => void;
}) {
  const t = useTranslations("contractorOps");
  const { can } = useAuth();
  return (
    <>
      {can("material_outgoing.approve") && row.status === "PENDING" && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => onReview("REJECTED")}>
            <RotateCcw />
            {t("action.reject")}
          </Button>
          <Button disabled={pending} onClick={() => onReview("APPROVED")}>
            <Check />
            {t("action.approve")}
          </Button>
        </div>
      )}
      {/* D-211: 批准 → 手机端现场处理及回传 → 后台最终确认. The old 【放行】
          closed the application from the office before the site had done
          anything; the server no longer accepts it. */}
      {row.status === "APPROVED" &&
        (can("material_outgoing.submit") ? (
          <Button className="w-full" onClick={onReturn}>
            <Camera />
            {t("outgoing.returnProcessing")}
          </Button>
        ) : (
          <p className="rounded-md border border-info/25 bg-info/5 px-3 py-2 text-sm">
            {t("outgoing.waitingForSite")}
          </p>
        ))}
      {row.status === "PROCESSED" &&
        (can("material_outgoing.approve") ? (
          <Button
            className="w-full"
            disabled={pending}
            onClick={() => onReview("COMPLETED")}
          >
            <Check />
            {t("outgoing.finalConfirm")}
          </Button>
        ) : (
          <p className="rounded-md border border-info/25 bg-info/5 px-3 py-2 text-sm">
            {t("outgoing.waitingForOffice")}
          </p>
        ))}
    </>
  );
}

export function OutgoingDialog({
  project: initialProject,
  fieldTaskId,
  onClose,
  onSaved,
}: {
  project: string;
  fieldTaskId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // The dialog owns the project choice. The list filter defaults to "all
  // projects" (an empty string), so gating the Add button on it left the
  // control permanently dead with nothing on screen explaining why.
  const t = useTranslations("contractorOps");
  const { user } = useAuth();
  const isFieldStaff = Boolean(user?.is_field_staff);
  // F-282
  const [project, setProject] = useDraftState("project", initialProject);
  const [form, setForm] = useDraftState("form", {
    material_name: "",
    category: "",
    quantity: "",
    unit: "TONNE",
    destination: "",
    executor_name: "",
    vehicle_plate: "",
    delivery_note_no: "",
    reason: "",
  });
  const [photos, setPhotos] = useDraftState("photos", createEmptyFieldEvidence);
  const clearDraft = useClearDraft();
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState(false);
  const photoPrompts = [
    t("outgoing.evidence.overview"),
    t("outgoing.evidence.quantity"),
    t("outgoing.evidence.vehicle"),
    t("outgoing.evidence.loading"),
  ];
  const evidencePhotos = photos.filter((file): file is File => Boolean(file));
  const photoCaptions = evidencePhotos.map((_, index) =>
    index < photoPrompts.length
      ? photoPrompts[index]
      : t("outgoing.evidence.other"),
  );
  const set = (key: keyof typeof form, value: string) =>
    setForm((old) => ({ ...old, [key]: value }));
  const save = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Authentication required.");
      return submitMaterialOutgoingOfflineAware(user.id, {
        project,
        ...form,
        destination: isFieldStaff ? "" : form.destination,
        executor_name: isFieldStaff ? user.full_name : form.executor_name,
        delivery_note_no: isFieldStaff ? "" : form.delivery_note_no,
        latitude: location?.latitude,
        longitude: location?.longitude,
        client_event_id: crypto.randomUUID(),
        field_task: fieldTaskId,
        photos: evidencePhotos,
        photo_captions: photoCaptions,
      });
    },
    onSuccess: () => {
      clearDraft();
      onSaved();
    },
  });
  const locate = async () => {
    setLocationError(false);
    try {
      setLocation(await currentCoordinates());
    } catch {
      setLocationError(true);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("outgoing.createTitle")}</DialogTitle>
          <DialogDescription>
            {t(isFieldStaff ? "outgoing.fieldFormHelp" : "outgoing.formHelp")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper
            label={t("field.project")}
            required
            className="sm:col-span-2"
          >
            <ProjectPicker
              value={project}
              onValueChange={setProject}
              placeholder={t("field.selectProject")}
            />
          </FieldWrapper>
          <ProjectColumnPicker project={project} kind="MATERIAL" value={form.category} onChange={(value) => set("category", value)} className="sm:col-span-2" />
          <FieldWrapper label={t("field.material")} required>
            <Input
              value={form.material_name}
              onChange={(e) => set("material_name", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.quantity")} required>
            <div className="flex gap-2">
              <Input
                type="number"
                min="0.001"
                step="0.001"
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
              />
              <Select value={form.unit} onValueChange={(v) => set("unit", v)}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_UNITS.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FieldWrapper>
          {!isFieldStaff ? (
            <FieldWrapper label={t("field.executor")} required>
              <Input
                value={form.executor_name}
                onChange={(e) => set("executor_name", e.target.value)}
              />
            </FieldWrapper>
          ) : null}
          <FieldWrapper label={t("field.vehiclePlate")}>
            <Input
              value={form.vehicle_plate}
              onChange={(e) =>
                set("vehicle_plate", e.target.value.toUpperCase())
              }
            />
          </FieldWrapper>
          {!isFieldStaff ? (
            <>
              <FieldWrapper
                label={t("field.destination")}
                required
                className="sm:col-span-2"
              >
                <Input
                  value={form.destination}
                  onChange={(e) => set("destination", e.target.value)}
                />
              </FieldWrapper>
              <FieldWrapper label={t("field.deliveryNote")}>
                <Input
                  value={form.delivery_note_no}
                  onChange={(e) => set("delivery_note_no", e.target.value)}
                />
              </FieldWrapper>
            </>
          ) : null}
          {isFieldStaff ? (
            <FieldWrapper
              label={t("outgoing.evidence.title")}
              required
              className="sm:col-span-2"
            >
              <FieldEvidenceGrid
                labels={photoPrompts}
                files={photos}
                progressLabel={t("outgoing.evidence.progress", {
                  current: evidencePhotos.length,
                  required: FIELD_EVIDENCE_PHOTO_COUNT,
                })}
                onChange={setPhotos}
              />
            </FieldWrapper>
          ) : null}
          <FieldWrapper
            label={t("field.location")}
            required={isFieldStaff}
            error={locationError ? t("state.locationError") : undefined}
            className="sm:col-span-2"
          >
            <Button variant="outline" onClick={() => void locate()}>
              <MapPin />
              {location ? t("action.locationReady") : t("action.getLocation")}
            </Button>
          </FieldWrapper>
          <FieldWrapper
            label={isFieldStaff ? t("field.notes") : t("field.reason")}
            required={!isFieldStaff}
            className="sm:col-span-2"
          >
            <Textarea
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
            />
          </FieldWrapper>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [project, t("field.project")],
              [form.material_name, t("field.material")],
              [form.category, t("field.category")],
              [form.quantity, t("field.quantity")],
              [isFieldStaff || form.destination, t("field.destination")],
              [isFieldStaff || form.executor_name, t("field.executor")],
              [
                isFieldStaff || form.reason,
                isFieldStaff ? t("field.notes") : t("field.reason"),
              ],
              [
                !isFieldStaff || hasRequiredFieldEvidence(photos),
                t("outgoing.evidence.title"),
              ],
              [!isFieldStaff || location, t("field.location")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Save />
            {t("action.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Why a material-outgoing application is being sent back (T-297, D-211).
 *
 * 「申请 → 后台沟通 → 驳回 → **该次申请结束**」 - and by D-227 a returned
 * application is not reopened, so this sentence is the last thing anybody will
 * ever be told about why. That is the whole reason it is a required field in a
 * real dialog rather than the `window.prompt` this replaced.
 */
export function RejectOutgoingDialog({
  row,
  pending,
  onClose,
  onConfirm,
}: {
  row: MaterialOutgoing;
  pending: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const t = useTranslations("contractorOps");
  const common = useTranslations("common");
  const [note, setNote] = useState("");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("outgoing.rejectTitle")}</DialogTitle>
          <DialogDescription>
            {t("outgoing.rejectHelp", { reference: row.reference_no })}
          </DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("outgoing.rejectReason")} required>
          <Textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </FieldWrapper>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button
            variant="destructive"
            requires={[[note.trim(), t("outgoing.rejectReason")]]}
            disabled={pending}
            onClick={() => onConfirm(note.trim())}
          >
            <RotateCcw />
            {t("action.reject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Why a field task is going back to the person who filled it.
 *
 * Shared shape with the material-outgoing rejection below, but a separate
 * component on purpose: a returned *task* is handed back to be redone, while a
 * returned *application* is finished (D-227). One dialog for both would tempt
 * the next person to unify the copy, and the two sentences have to say
 * opposite things about what happens next.
 */
function ReturnReasonDialog({
  reference,
  pending,
  onClose,
  onConfirm,
}: {
  reference: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const t = useTranslations("contractorOps");
  const common = useTranslations("common");
  const [note, setNote] = useState("");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("tasks.returnTitle")}</DialogTitle>
          <DialogDescription>
            {t("tasks.returnHelp", { reference })}
          </DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("tasks.returnReason")} required>
          <Textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </FieldWrapper>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button
            requires={[[note.trim(), t("tasks.returnReason")]]}
            disabled={pending}
            onClick={() => onConfirm(note.trim())}
          >
            <RotateCcw />
            {t("action.return")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The site sends back what it did with the material (D-211).
 *
 * 「批准 → **手机端现场处理及回传** → 后台最终确认 → 闭环」. The same capture
 * grid as the application itself, and the same rule the server applies: field
 * staff photograph the full set, anybody else at least one. A return with
 * nothing attached would be a claim, and the office's final confirmation is
 * made on what it can see.
 */
export function ReturnProcessingDialog({
  row,
  onClose,
  onSaved,
}: {
  /** Only the id and the reference are read, so the phone's history row fits. */
  row: Pick<MaterialOutgoing, "id" | "reference_no">;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps");
  const common = useTranslations("common");
  const { user } = useAuth();
  const isFieldStaff = Boolean(user?.is_field_staff);
  const [photos, setPhotos] = useState(createEmptyFieldEvidence);
  const [note, setNote] = useState("");
  const [location, setLocation] = useState<LocationFix | null>(null);
  const [error, setError] = useState("");
  const taken = photos.filter((file): file is File => Boolean(file));
  const save = useMutation({
    mutationFn: () =>
      returnMaterialOutgoingProcessing(row.id, {
        photos: taken,
        note: note.trim() || undefined,
        latitude: location ? String(location.latitude) : undefined,
        longitude: location ? String(location.longitude) : undefined,
      }),
    onSuccess: onSaved,
    onError: (failure) =>
      setError(failure instanceof ApiError ? failure.message : t("outgoing.returnFailed")),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("outgoing.returnProcessing")}</DialogTitle>
          <DialogDescription>
            {t("outgoing.returnHelp", { reference: row.reference_no })}
          </DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("outgoing.processingPhotos")} required>
          <FieldEvidenceGrid
            labels={[
              t("outgoing.evidence.overview"),
              t("outgoing.evidence.quantity"),
              t("outgoing.evidence.vehicle"),
              t("outgoing.evidence.loading"),
            ]}
            files={photos}
            progressLabel={t("outgoing.evidence.progress", {
              current: taken.length,
              required: isFieldStaff ? FIELD_EVIDENCE_PHOTO_COUNT : 1,
            })}
            onChange={setPhotos}
          />
        </FieldWrapper>
        <FieldWrapper label={t("outgoing.processingNote")} optional={common("optional")}>
          <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </FieldWrapper>
        <LocationField
          label={t("outgoing.processingLocation")}
          actionLabel={t("outgoing.processingLocation")}
          readyLabel={t("outgoing.processingLocationReady")}
          value={location}
          onChange={setLocation}
        />
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button
            requires={[
              [
                isFieldStaff ? hasRequiredFieldEvidence(photos) : taken.length > 0,
                t("outgoing.processingPhotos"),
              ],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
            {t("outgoing.sendReturn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One application on its own (T-358): what was applied for, what came back,
 * and the office's own attachments - kept apart so the before and after of
 * the same event are not mixed into one grid.
 */
/**
 * One outgoing application on the shared detail shell (T-369, C-020).
 *
 * Photographs from all three steps in one strip, each labelled with its step;
 * the right column says who did which step and when, then the buttons for the
 * step the application is at; the conversation underneath.
 */
export function OutgoingDetailDialog({
  id,
  onClose,
  renderActions,
}: {
  id: string;
  onClose: () => void;
  /** The step buttons, from whoever owns the review dialogs. */
  renderActions?: (row: MaterialOutgoing) => React.ReactNode;
}) {
  const t = useTranslations("contractorOps");
  const df = useDateFormat();
  const { can } = useAuth();
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ["material-outgoing", "detail", id],
    queryFn: () => getMaterialOutgoingRecord(id),
  });
  const [files, setFiles] = useState<File[]>([]);
  const upload = useMutation({
    mutationFn: () => addMaterialOutgoingPhotos(id, files),
    onSuccess: () => {
      setFiles([]);
      void qc.invalidateQueries({ queryKey: ["material-outgoing"] });
    },
  });
  const row = detail.data;
  const finished = row ? ["COMPLETED", "REJECTED", "RELEASED"].includes(row.status) : true;
  const when = (name?: string | null, at?: string | null) =>
    name ? `${name}${at ? ` · ${df.dateTime(at)}` : ""}` : "—";
  return (
    <RecordDetailDialog
      title={row?.reference_no ?? t("outgoing.title")}
      description={row ? `${row.material_name} · ${row.quantity} ${row.unit}` : undefined}
      exportRecord={
        row
          ? { kind: "MATERIAL_OUTGOING", recordId: row.id, reference: row.reference_no }
          : null
      }
      onClose={onClose}
    >
      {detail.isError ? (
        <LoadFailed what={t("what.outgoingRecord")} onRetry={() => void detail.refetch()} />
      ) : detail.isLoading || !row ? (
        <div className="grid min-h-32 place-items-center">
          <Loader2 className="size-7 animate-spin text-primary" />
        </div>
      ) : (
        <RecordDetailShell
          reference={row.reference_no}
          facts={[
            {
              label: t("field.status"),
              value: (
                <StatusBadge
                  label={t(`outgoingStatus.${row.status}`)}
                  tone={tone(row.status)}
                />
              ),
            },
            { label: t("field.project"), value: row.project_name },
            { label: t("field.material"), value: `${row.material_name} · ${row.quantity} ${row.unit}` },
            { label: t("field.destination"), value: row.destination },
            { label: t("outgoing.executor"), value: row.executor_name },
            { label: t("field.vehiclePlate"), value: row.vehicle_plate },
            { label: t("outgoing.capturedAt"), value: df.dateTime(row.captured_at) },
            { label: t("field.reason"), value: row.reason, wide: true },
            ...(row.review_note
              ? [{ label: t("outgoing.reviewNote"), value: row.review_note, wide: true }]
              : []),
            ...(row.processing_note
              ? [{ label: t("outgoing.processingNote"), value: row.processing_note, wide: true }]
              : []),
          ]}
          photos={row.photos.map((shot) => {
            const stage = t(`outgoing.stage.${shot.stage ?? "APPLICATION"}`);
            return {
              id: shot.id,
              url: shot.watermarked || shot.image,
              label: shot.caption ? `${stage} · ${shot.caption}` : stage,
              takenAt: shot.captured_at,
            };
          })}
          photoActions={
            can("material_outgoing.approve") && !finished ? (
              <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-2">
                <FieldWrapper label={t("outgoing.uploadFiles")} required>
                  <Input
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    className="h-8 text-xs"
                    onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                  />
                </FieldWrapper>
                <Button
                  size="sm"
                  requires={[[files.length > 0, t("outgoing.uploadFiles")]]}
                  disabled={upload.isPending}
                  onClick={() => upload.mutate()}
                >
                  {upload.isPending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
                  {t("outgoing.uploadFiles")}
                </Button>
              </div>
            ) : null
          }
          panel={
            <section className="rounded-lg border bg-card p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("outgoing.flowTitle")}
              </h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">{t("outgoing.submittedBy")}</dt>
                <dd className="font-medium">{when(row.submitted_by_name, row.captured_at)}</dd>
                <dt className="text-muted-foreground">{t("outgoing.approvedBy")}</dt>
                <dd className="font-medium">{when(row.approved_by_name, row.approved_at)}</dd>
                <dt className="text-muted-foreground">{t("outgoing.processedBy")}</dt>
                <dd className="font-medium">{when(row.processed_by_name, row.processed_at)}</dd>
                <dt className="text-muted-foreground">{t("outgoing.completedBy")}</dt>
                <dd className="font-medium">{when(row.completed_by_name, row.completed_at)}</dd>
              </dl>
            </section>
          }
          actions={
            <>
              {renderActions?.(row)}
              <div className="flex flex-wrap gap-2 border-t pt-2 empty:hidden">
                <AddToPackageButton
                  kind="MATERIAL_OUTGOING"
                  recordId={row.id}
                  projectId={row.project}
                  reference={row.reference_no}
                />
              </div>
            </>
          }
          conversation={{ kind: "MATERIAL_OUTGOING", recordId: row.id }}
        />
      )}
    </RecordDetailDialog>
  );
}
