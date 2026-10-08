"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Check,
  ChevronRight,
  ClipboardList,
  Eye,
  FilePlus2,
  FileText,
  ImagePlus,
  ListTodo,
  ListTree,
  Loader2,
  MapPin,
  PackageOpen,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ScanLine,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { PhotoThumb, rowPhotos } from "@/components/shared/photo-thumb";
import { FieldTaskSheet } from "@/components/dashboard/field-task-sheet";
import { useRef, useState } from "react";

import { AddToPackageButton } from "@/components/contractor-ops/add-to-package";
import { useAuth } from "@/components/providers/auth-provider";
import { useCurrentProject, usePageProject } from "@/components/providers/current-project-provider";
import { DeliveryNoteReadStatus, useDeliveryNoteReader } from "@/hooks/use-delivery-note-reader";
import { useClearSearchParam, useUrlSelection } from "@/hooks/use-url-selection";
import { FieldDraft, useClearDraft, useDraftState } from "@/components/field-staff/field-draft";
import {
  completedFieldEvidence,
  createEmptyFieldEvidence,
  FIELD_EVIDENCE_PHOTO_COUNT,
  FieldEvidenceGrid,
  hasRequiredFieldEvidence,
} from "@/components/field-staff/field-evidence-grid";
import { ExportButton } from "@/components/shared/export-button";
import { FieldCamera } from "@/components/shared/field-camera";
import { FieldSignaturePad } from "@/components/field-staff/field-signature-pad";
import {
  EquipmentClassSelect,
  InlineClassCreator,
  useEquipmentClasses,
} from "@/components/contractor-ops/equipment-classes";
import { SupplierQrScanner } from "@/components/field-staff/supplier-qr-scanner";
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
import { parseAlertAmounts, parseAlertPercentages } from "@/lib/category-modules";
import { MultiPickList } from "@/components/shared/multi-pick-list";
import { useDebounce } from "@/hooks/use-debounce";
import { getManufacturers } from "@/services/material-setup.service";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  ConstructionPhase,
  EquipmentPayload,
  FieldTask,
  FieldTaskPayload,
  EquipmentMovement,
  MaterialOutgoing,
  ProjectCategory,
  ProjectCategoryKind,
  CategorySubmissionMode,
  ProjectCategoryPayload,
  BudgetMode,
  SiteEquipment,
} from "@/interfaces/contractor-ops";
import { ApiError } from "@/interfaces/api";
import { useMaterialUnits, useUnitName } from "@/hooks/use-material-units";
import { ManufacturerCell, ManufacturerPicker } from "@/components/shared/manufacturer-picker";
import {
  createConstructionPhase,
  deleteConstructionPhase,
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
  ocrEquipmentDeliveryNote,
  getProjectCategories,
  getSiteEquipment,
  getSiteProgressRecords,
  getSiteProgressSummary,
  reviewMaterialOutgoing,
  transitionFieldTask,
  updateFieldTask,
  updateProjectCategory,
  updateSiteEquipment,
} from "@/services/contractor-ops.service";
import { getApplicationOptions } from "@/services/consultant-workflow.service";
import { consultantTaskTitle } from "@/lib/consultant-task-title";
import {
  getProjectAssignments,
  getSuppliers,
  scanSupplierQr,
} from "@/services/contractor.service";
import { getRoles } from "@/services/users.service";
import { OutgoingSupplierField } from "@/components/contractor-ops/outgoing-supplier-field";
import { ReturnNoteDialog, ReturnNotePanel } from "@/components/contractor-ops/return-note";
import {
  SupplierReturnBadge,
  type ReturnBadgeSupplier,
} from "@/components/suppliers/supplier-return-badge";
import { columnAutofill } from "@/lib/material-autofill";
import {
  newClientEventId,
  queuedOutgoingExit,
  submitEquipmentMovementOfflineAware,
  submitMaterialOutgoingExitOfflineAware,
  submitMaterialOutgoingOfflineAware,
  submitSiteProgressOfflineAware,
} from "@/services/offline-sync.service";

type Coordinates = { latitude: string; longitude: string; accuracy: string };
/** 设备进出场最多 5 张（含 Delivery Order），E2 / D-257; the server enforces it too. */
/**
 * Equipment movement photographs: at least four, no ceiling, on the phone and
 * in the office (L6, 10-02: 「设备最少 4、无上限，手机和后台都要」), the
 * delivery-order photo counted in - the server's own count. Replaced D-257's
 * 4-5.
 */
const EQUIPMENT_PHOTO_MIN = 4;

export function ProjectFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("contractorOps");
  // The top bar's 「当前项目」 is this filter (B13); the picker still keeps a
  // page that holds its own copy of the project on it.
  const topBar = useCurrentProject();
  if (topBar.active) {
    return (
      <ProjectPicker value={value} onValueChange={(next) => onChange(next === "all" ? "" : next)} placeholder="" allowAll />
    );
  }
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
 * - no parent column, except for equipment (2026-10 B2, X1): 大类 → 小类, two
 *   levels. Every other kind is one flat list and old links stay unused;
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
  const tRoot = useTranslations();
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
    // Equipment only (2026-10 B2, X1): the major class a sub class sits under.
    parent: row?.parent ?? null,
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
  // 2026-10 A6 (X17): the budget counts money (default) or the quantity in
  // the category's unit, and warns at percentages and/or absolute figures.
  const [budgetMode, setBudgetMode] = useState<BudgetMode>(row?.budget_mode ?? "AMOUNT");
  const [budgetQuantity, setBudgetQuantity] = useState(row?.budget_quantity ?? "");
  const [alertAmounts, setAlertAmounts] = useState(
    (row?.budget_alert_amounts ?? []).join(", "),
  );
  // 2026-10 A4, D1 (Q1, Q13): what the phone fills in when this category is
  // chosen - its one unit, its suppliers, its designated manufacturers.
  const [defaultUnit, setDefaultUnit] = useState(row?.default_unit ?? "");
  const [supplierIds, setSupplierIds] = useState<string[]>(row?.suppliers ?? []);
  const [manufacturerIds, setManufacturerIds] = useState<string[]>(row?.manufacturers ?? []);
  const [supplierTerm, setSupplierTerm] = useState("");
  const [manufacturerTerm, setManufacturerTerm] = useState("");
  const supplierSearch = useDebounce(supplierTerm.trim(), 300);
  const manufacturerSearch = useDebounce(manufacturerTerm.trim(), 300);
  const [error, setError] = useState("");
  const isMaterial = form.kind === "MATERIAL";
  const isEquipment = form.kind === "EQUIPMENT";
  // The major classes it may go under: this project's top-level equipment
  // categories, not itself (X1). One with sub classes of its own stays a
  // major class, so the choice is not offered.
  const equipmentClasses = useEquipmentClasses(isEquipment ? form.project : "");
  const majorChoices = equipmentClasses.tree.majors.filter((major) => major.id !== row?.id);
  const hasSubClasses = Boolean(row && equipmentClasses.tree.subClasses(row.id).length);
  const units = useMaterialUnits({ enabled: isMaterial });
  const unitName = useUnitName();
  const supplierChoices = useQuery({
    queryKey: ["suppliers", "category-dialog", supplierSearch],
    queryFn: () =>
      getSuppliers({ page_size: 100, sort_by: "name", ...(supplierSearch ? { search: supplierSearch } : {}) }),
    enabled: isMaterial,
  });
  const manufacturerChoices = useQuery({
    queryKey: ["manufacturers", "category-dialog", manufacturerSearch],
    queryFn: () =>
      getManufacturers({ page_size: 100, ...(manufacturerSearch ? { search: manufacturerSearch } : {}) }),
    enabled: isMaterial,
  });
  const parsedAlerts = parseAlertPercentages(alerts);
  const alertsInvalid = isMaterial && tracksSpend && parsedAlerts === null;
  const parsedAmounts = parseAlertAmounts(alertAmounts);
  const amountsInvalid = isMaterial && tracksSpend && parsedAmounts === null;
  const quantityMode = budgetMode === "QUANTITY";
  // 500 what? A quantity budget is counted in the category's unit.
  const quantityNeedsUnit =
    isMaterial && tracksSpend && quantityMode && Boolean(budgetQuantity.trim()) && !defaultUnit;
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
            budget_mode: budgetMode,
            budget_quantity:
              tracksSpend && quantityMode && budgetQuantity.trim() ? budgetQuantity.trim() : null,
            budget_alert_amounts: parsedAmounts ?? row?.budget_alert_amounts ?? [],
            default_unit: defaultUnit,
            suppliers: supplierIds,
            manufacturers: manufacturerIds,
          }
        : isEquipment
          ? { ...form, parent: form.parent || null }
          : // A parent means nothing outside equipment (D-265); not sent.
            { ...form, parent: undefined };
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
                {/* 2026-10 B1: 隐患整改分类 are read-only, so no column is
                    made into one here; progress, clearance, consultant and
                    sundry have no categories at all (X5). */}
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
          {/* 大类 → 小类 (2026-10 B2, X1): equipment only. Empty makes it a
              major class; a machine is registered on a sub class. */}
          {isEquipment && (
            <FieldWrapper
              label={modules("equipment.majorClassOf")}
              hint={modules("equipment.majorClassHint")}
            >
              <Select
                value={form.parent || "__major__"}
                onValueChange={(value) => set("parent", value === "__major__" ? null : value)}
                disabled={hasSubClasses}
              >
                <SelectTrigger className="w-full" aria-label={modules("equipment.majorClassOf")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__major__">{modules("equipment.isMajorClass")}</SelectItem>
                  {majorChoices.map((major) => (
                    <SelectItem key={major.id} value={major.id}>
                      {major.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <QueryFailedNote query={equipmentClasses.query} what={t("what.columns")} />
            </FieldWrapper>
          )}
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
                <h4 className="text-sm font-semibold">{modules("material.title")}</h4>
                <p className="mt-1 text-xs text-muted-foreground">{modules("material.help")}</p>
              </div>
              <FieldWrapper
                label={modules("material.defaultUnit")}
                hint={modules("material.defaultUnitHint")}
                error={quantityNeedsUnit ? modules("budget.quantityNeedsUnit") : undefined}
              >
                <Select
                  value={defaultUnit || "__none__"}
                  onValueChange={(value) => setDefaultUnit(value === "__none__" ? "" : value)}
                >
                  <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{modules("material.noUnit")}</SelectItem>
                    {(units.data ?? []).map((unit) => (
                      <SelectItem key={unit.code} value={unit.code}>{unitName(unit.code, unit.label)}</SelectItem>
                    ))}
                    {/* A unit switched off since it was chosen stays chosen. */}
                    {defaultUnit && !(units.data ?? []).some((unit) => unit.code === defaultUnit) && (
                      <SelectItem value={defaultUnit}>{unitName(defaultUnit, row?.default_unit_label)}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <QueryFailedNote query={units} what={modules("units.what")} />
              </FieldWrapper>
              <FieldWrapper label={modules("material.suppliers")} hint={modules("material.suppliersHint")}>
                <MultiPickList
                  selected={supplierIds}
                  onChange={setSupplierIds}
                  options={(supplierChoices.data?.results ?? [])
                    .filter((option) => option.is_active || supplierIds.includes(option.id))
                    .map((option) => ({
                      ...option,
                      // 「有退场资料」 (2026-10 C10), as a mark in the list.
                      suffix: <SupplierReturnBadge supplier={option} interactive={false} />,
                    }))}
                  knownNames={Object.fromEntries(
                    (row?.supplier_options ?? []).map((option) => [option.id, option.name]),
                  )}
                  search={supplierTerm}
                  onSearch={setSupplierTerm}
                  searchPlaceholder={modules("material.search")}
                  ariaLabel={modules("material.suppliers")}
                />
                <QueryFailedNote query={supplierChoices} what={modules("material.what.suppliers")} />
              </FieldWrapper>
              <FieldWrapper label={modules("material.manufacturers")} hint={modules("material.manufacturersHint")}>
                <MultiPickList
                  selected={manufacturerIds}
                  onChange={setManufacturerIds}
                  options={(manufacturerChoices.data?.results ?? []).filter(
                    (option) => option.is_active || manufacturerIds.includes(option.id),
                  )}
                  knownNames={Object.fromEntries(
                    (row?.manufacturer_options ?? []).map((option) => [option.id, option.name]),
                  )}
                  search={manufacturerTerm}
                  onSearch={setManufacturerTerm}
                  searchPlaceholder={modules("material.search")}
                  ariaLabel={modules("material.manufacturers")}
                />
                <QueryFailedNote query={manufacturerChoices} what={tRoot("manufacturers.what")} />
              </FieldWrapper>
            </div>
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
                  <FieldWrapper label={modules("budget.mode")} className="sm:col-span-2">
                    <Select value={budgetMode} onValueChange={(value) => setBudgetMode(value as BudgetMode)}>
                      <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AMOUNT">{modules("budget.modeAmount")}</SelectItem>
                        <SelectItem value="QUANTITY">{modules("budget.modeQuantity")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldWrapper>
                  {quantityMode ? (
                    <FieldWrapper
                      label={modules("budget.quantity")}
                      hint={
                        defaultUnit
                          ? modules("budget.quantityHint", { unit: unitName(defaultUnit, row?.default_unit_label) })
                          : modules("budget.quantityNeedsUnit")
                      }
                      error={quantityNeedsUnit ? modules("budget.quantityNeedsUnit") : undefined}
                    >
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.001"
                        value={budgetQuantity}
                        onChange={(event) => setBudgetQuantity(event.target.value)}
                      />
                    </FieldWrapper>
                  ) : (
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
                  )}
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
                  <FieldWrapper
                    label={modules("budget.thresholdAmounts")}
                    hint={modules("budget.thresholdAmountsHint")}
                    error={amountsInvalid ? modules("budget.thresholdAmountsInvalid") : undefined}
                    className="sm:col-span-2"
                  >
                    <Input
                      value={alertAmounts}
                      onChange={(event) => setAlertAmounts(event.target.value)}
                    />
                  </FieldWrapper>
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    {modules("budget.recipients")}
                  </p>
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
              alertsInvalid
                ? modules("budget.alertsInvalid")
                : amountsInvalid
                  ? modules("budget.thresholdAmountsInvalid")
                  : quantityNeedsUnit
                    ? modules("budget.quantityNeedsUnit")
                    : undefined
            }
            disabled={save.isPending || alertsInvalid || amountsInvalid || quantityNeedsUnit}
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
  // The four 「这次要顾问看什么」 answers by name, not by code (2026-10 F4).
  const askFor = useTranslations("fieldStaffPwa.consultantCapture");
  // A phone submission's title names its type in the reader's words (F4).
  const taskTitle = (row: FieldTask) =>
    consultantTaskTitle(row, (code) =>
      askFor.has(`askOption.${code}`) ? askFor(`askOption.${code}` as never) : null,
    );
  const { can, user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  // A task card links here with ?task=<id>: show that one task, with a way
  // back to the whole list.
  const searchParams = useSearchParams();
  // The top bar's 「当前项目」 (B13); a link's `?project=` moves it.
  const [project, setProject] = usePageProject(searchParams.get("project") ?? "");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<FieldTask | null>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const [addingRefsTo, setAddingRefsTo] = useState<FieldTask | null>(null);
  const focusedTaskId = searchParams.get("task");
  const showAllTasks = useClearSearchParam("task");
  // The detail of a head-office task (C17): opened by hand, or by the
  // assignee's My Tasks card, which links here with ?task=.
  const [openedTask, setOpenedTask] = useState<string | null>(null);
  // The 公司总部 Dashboard's 未完成 / 逾期 figures (C13) link here with the
  // same filter the server counted them by, so the list shows exactly them.
  const drill = searchParams.get("overdue") === "1"
    ? "overdue"
    : searchParams.get("open") === "1"
      ? "open"
      : null;
  const clearOverdue = useClearSearchParam("overdue");
  const clearOpen = useClearSearchParam("open");
  const rows = useQuery({
    queryKey: ["field-tasks", project, taskType, drill],
    queryFn: () =>
      getFieldTasks({
        page_size: 200,
        project: project || undefined,
        task_type: taskType,
        ...(drill ? { [drill]: "1" } : {}),
      }),
  });
  const linkedHeadOffice = rows.data?.results.find(
    (row) => row.id === focusedTaskId && row.origin === "HQ",
  );
  const sheetTask = openedTask ?? linkedHeadOffice?.id ?? null;
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
  // Which strips are open (B17). A task opened by its id is open anyway.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      {drill && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">
            {t(drill === "overdue" ? "tasks.onlyOverdue" : "tasks.onlyOpen")}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={drill === "overdue" ? clearOverdue : clearOpen}
          >
            {t("tasks.showAll")}
          </Button>
        </div>
      )}
      {sheetTask && (
        <FieldTaskSheet
          id={sheetTask}
          onClose={() => {
            setOpenedTask(null);
            if (linkedHeadOffice) showAllTasks();
          }}
        />
      )}
      {focusedTaskId && !rows.isLoading && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">
            {rows.data?.results.some((row) => row.id === focusedTaskId)
              ? t("tasks.focused")
              : t("tasks.focusedMissing")}
          </span>
          <Button size="sm" variant="outline" onClick={showAllTasks}>
            {t("tasks.showAll")}
          </Button>
        </div>
      )}
      <WorkspaceState
        loading={rows.isLoading}
        error={rows.isError}
        empty={!rows.data?.count}
      />
      {!!rows.data?.count && (
        /*
         * One compact strip per task (B17): 项目、任务名称、负责人、期限、状态、
         * 照片摘要、处理入口. The reference material and every returned photo
         * open under the strip, so a page of tasks is a list rather than a
         * wall of photographs. A task opened by its id (?task=) opens expanded.
         */
        <div className="grid gap-2">
          {rows.data.results
            .filter((row) => !focusedTaskId || row.id === focusedTaskId)
            .map((row) => {
            const gpsPhoto = row.photos.find(
              (photo) => photo.latitude && photo.longitude,
            );
            // B15: the site sends the request to the manager, who checks it,
            // talks it through, and sends it on to the consultant from this
            // same item - once. A request already sent on links to it.
            const sentOn = row.consultant_application ?? null;
            const canPrepareApplication =
              taskType === "CONSULTANT" &&
              can("consultant.submit") &&
              !user?.is_field_staff &&
              !sentOn &&
              ["SUBMITTED", "ACCEPTED"].includes(row.status);
            const isOpen = expanded.has(row.id) || row.id === focusedTaskId;
            const canEdit =
              can("field_task.manage") && ["OPEN", "RETURNED"].includes(row.status);
            // A head-office task (C17) is reported and decided in its own
            // detail: only its publisher confirms it, and the assignee
            // submits words and files from the desk.
            const headOffice = row.origin === "HQ";
            const canReview =
              can("field_task.manage") && row.status === "SUBMITTED" && !headOffice;
            return (
              <article
                key={row.id}
                data-testid="field-task-row"
                className="overflow-hidden surface-panel rounded-xl"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-label={t(isOpen ? "tasks.collapse" : "tasks.expand", { task: taskTitle(row) })}
                    onClick={() => toggleExpanded(row.id)}
                    className="flex min-w-0 flex-[1_1_18rem] items-center gap-2.5 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <ChevronRight
                      className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                    />
                    <span className="grid min-w-0 flex-1 gap-0.5 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-3">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{taskTitle(row)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {row.project_name}
                        </span>
                      </span>
                      <span className="truncate text-sm">{row.assigned_to_name}</span>
                      <span className="tabular truncate text-sm text-muted-foreground">
                        {row.due_at
                          ? t("tasks.dueShort", { value: new Date(row.due_at).toLocaleString() })
                          : t("tasks.noDue")}
                      </span>
                    </span>
                  </button>
                  <StatusBadge
                    label={t(`taskStatus.${row.status}`)}
                    tone={tone(row.status)}
                  />
                  <span
                    className="flex items-center gap-1"
                    title={t("tasks.photos", {
                      current: row.photos.length,
                      required: row.evidence_required,
                    })}
                  >
                    {/* The task's photograph, all of them on click (E3). */}
                    <PhotoThumb
                      coverUrl={row.cover_photo_url}
                      count={row.photo_count}
                      icon={ListTodo}
                      reference={row.title}
                      photos={rowPhotos(row.photos, row.title)}
                    />
                    <span className="tabular text-xs text-muted-foreground">
                      {row.photos.length}/{row.evidence_required}
                    </span>
                  </span>
                  {(canEdit || canReview || canPrepareApplication || headOffice) && (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {headOffice ? (
                        <Button size="sm" onClick={() => setOpenedTask(row.id)}>
                          <ClipboardList />
                          {t("tasks.openHeadOffice")}
                        </Button>
                      ) : null}
                      {canEdit ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
                            <Pencil />
                            {t("tasks.edit")}
                          </Button>
                          <Button
                            size="sm"
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
                      {canReview ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={transition.isPending}
                            onClick={() => review(row, "RETURNED")}
                          >
                            <RotateCcw />
                            {t("action.return")}
                          </Button>
                          <Button
                            size="sm"
                            disabled={transition.isPending}
                            onClick={() => review(row, "ACCEPTED")}
                          >
                            <Check />
                            {t("tasks.confirmDone")}
                          </Button>
                        </>
                      ) : null}
                      {canPrepareApplication ? (
                        <Button
                          size="sm"
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
                </div>
                {isOpen && (
                  <div className="border-t px-4 py-3" data-testid="field-task-detail">
                    {row.submission_category && (
                      <p className="text-xs font-semibold text-primary">
                        {askFor.has(`askOption.${row.submission_category}`)
                          ? askFor(`askOption.${row.submission_category}` as never)
                          : row.submission_category}
                      </p>
                    )}
                    <div className="mt-1 grid gap-1 text-xs text-muted-foreground">
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
                            value: new Date(row.submitted_at).toLocaleString(),
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
                      {/* B18: who closed or returned it, and when. */}
                      {row.reviewed_at &&
                        ["ACCEPTED", "RETURNED"].includes(row.status) && (
                          <p>
                            {t(
                              row.status === "ACCEPTED"
                                ? "tasks.confirmedBy"
                                : "tasks.returnedBy",
                              {
                                name: row.reviewed_by_name || t("state.unknown"),
                                value: new Date(row.reviewed_at).toLocaleString(),
                              },
                            )}
                          </p>
                        )}
                      {row.status === "RETURNED" && row.review_note && (
                        <p className="text-destructive">
                          {t("tasks.returnReasonShown", { reason: row.review_note })}
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
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
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
                )}
                {sentOn && (
                  <div className="border-t bg-muted/20 px-3 py-2 text-sm">
                    <Link
                      href={`/consultant-applications/${sentOn.id}`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {t(sentOn.forwarded_at ? "tasks.forwardedAs" : "tasks.draftedAs", {
                        reference: sentOn.application_no,
                      })}
                    </Link>
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
 * Progress, clearance and consultant tasks name none either since 2026-10
 * (B1, X5): their modules no longer have categories.
 */
export const TASK_CATEGORY_KIND: Partial<
  Record<FieldTaskPayload["task_type"], ProjectCategoryKind>
> = {
  MATERIAL: "MATERIAL",
  EQUIPMENT: "EQUIPMENT",
  SAFETY: "EHS",
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

/** The dropdown's value for 「新设备」 - never a machine's id. */
const NEW_MACHINE = "__new__";

/**
 * 「名称 · 车牌」 (F3), and the code only to tell apart two machines that
 * share both.
 */
export function machineLabeller(rows: readonly SiteEquipment[]) {
  const plain = (row: SiteEquipment) =>
    row.registration_no ? `${row.name} · ${row.registration_no}` : row.name;
  const seen = new Map<string, number>();
  for (const row of rows) seen.set(plain(row), (seen.get(plain(row)) ?? 0) + 1);
  return (row: SiteEquipment) =>
    (seen.get(plain(row)) ?? 0) > 1 ? `${plain(row)} (${row.code})` : plain(row);
}

/**
 * The phone's 设备进退场 (D-273, T-393; 2026-10 C8, F3, A9, Q27).
 *
 * 「设备进退场的数据是不需要显示的，他们的工作就只是拍照而已」: the field
 * worker takes the photos, the office reads the figures. So this screen has no
 * totals, no equipment data cards and no movement history - those live on the
 * office list (`SiteEquipmentOffice`).
 *
 * What is left: the project (locked to the worker's site), 进场 or 退场, and
 * one dropdown, 「名称 · 车牌」 with no category anywhere on the phone (F3).
 * 进场 offers 「新设备」 first, because nobody knows in advance which machine
 * will arrive (Lucas 2026-10-07), then the machines on file that are not on
 * site, for one coming back. 退场 offers the machines on site on this
 * project (Q27). Either way the movement is taken in one step like 材料进场
 * (X2): photos, DO, the supplier's QR, both signatures, GPS - and the office
 * accepts it. A machine whose movement is waiting for that says so instead of
 * offering a second one. Nothing is applied for (F3: no 「申请」 on the phone).
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
  // Kept in the draft, so tapping this 挂号 again reopens the way, the
  // machine and the form it was in (D-259). Outside a draft this is ordinary
  // state.
  const [direction, setDirection] = useDraftState<"ENTRY" | "EXIT">(
    "open:equipmentDirection",
    searchParams.get("direction") === "EXIT" ? "EXIT" : "ENTRY",
  );
  const [chosen, setChosen] = useDraftState("open:chosenEquipment", "");
  const [entering, setEntering] = useDraftState("open:enteringEquipment", false);
  const rows = useQuery({
    queryKey: ["site-equipment", "field", project],
    queryFn: () =>
      getSiteEquipment({
        project: project || undefined,
        page_size: 200,
      }),
  });
  const going = direction === "EXIT";
  // A machine switched off is not offered for a new entry or exit. 退场 takes
  // a machine on site on this project; 进场 one that is not (Q27).
  const equipment = (rows.data?.results ?? []).filter((row) => row.is_active);
  const offered = equipment.filter((row) => (row.status === "ON_SITE") === going);
  const machine = offered.find((row) => row.id === chosen) ?? null;
  const isNew = !going && chosen === NEW_MACHINE;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["site-equipment"] });
    void qc.invalidateQueries({ queryKey: ["equipment-movements"] });
    void qc.invalidateQueries({ queryKey: ["equipment-summary"] });
  };
  const equipmentError =
    rows.error instanceof Error ? rows.error.message : undefined;
  const label = machineLabeller(equipment);
  // 「进场待验收」 / 「退场待验收」: already submitted this way, so not again.
  const waitingWord = t(going ? "equipment.exitWaiting" : "equipment.entryWaiting");
  const isWaiting = (row: SiteEquipment) => row.awaiting_acceptance === direction;
  const waiting = machine ? isWaiting(machine) : false;
  return (
    <div className="space-y-5">
      <ListHeader
        title={t("equipment.title")}
        subtitle={t("equipment.subtitle")}
        action={
          can("equipment.manage") ? (
            <Button
              requires={[[project, t("field.project")]]}
              onClick={() => setCreating(true)}
            >
              <Plus />
              {t("equipment.add")}
            </Button>
          ) : undefined
        }
      />
      <FieldWrapper label={t("field.project")} required className="rounded-lg border bg-card px-3 py-2 shadow-sm">
        <ProjectPicker
          value={project}
          onValueChange={(next) => {
            setProject(next === "all" ? "" : next);
            setChosen("");
          }}
          placeholder={t("field.selectProject")}
          className="w-full sm:w-72"
          // The worker's site decides it (C8: 项目锁定); reached without one,
          // the picker stays usable.
          disabled={Boolean(initialProject)}
        />
      </FieldWrapper>
      <WorkspaceState
        loading={rows.isLoading}
        error={rows.isError}
        errorMessage={equipmentError}
        empty={false}
      />
      {/* 进场 or 退场 first (Q27): it decides which machines are offered. */}
      <div className="grid grid-cols-2 gap-2" data-testid="field-equipment-direction">
        {(["ENTRY", "EXIT"] as const).map((way) => (
          <Button
            key={way}
            type="button"
            variant={direction === way ? "default" : "outline"}
            aria-pressed={direction === way}
            className="h-12 text-base"
            onClick={() => {
              setDirection(way);
              setChosen("");
              setEntering(false);
            }}
          >
            {t(`direction.${way}`)}
          </Button>
        ))}
      </div>
      {/* A9: one dropdown instead of the long list of every machine. */}
      <FieldWrapper label={t("equipment.chooseMachine")} required>
        <Select
          value={chosen || undefined}
          onValueChange={(next) => {
            setChosen(next);
            setEntering(false);
          }}
          disabled={!project || rows.isLoading}
        >
          <SelectTrigger className="h-12 w-full" data-testid="field-equipment-select">
            <SelectValue
              placeholder={t(going ? "equipment.chooseOnSiteMachine" : "equipment.chooseMachinePlaceholder")}
            />
          </SelectTrigger>
          <SelectContent>
            {/* First, not a fallback (2026-10-07): nobody knows in advance
                which machine will arrive, so most entries start here. */}
            {!going && can("equipment.capture") && (
              <SelectItem value={NEW_MACHINE}>{t("equipment.newMachine")}</SelectItem>
            )}
            {offered.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {isWaiting(row) ? `${label(row)} · ${waitingWord}` : label(row)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {going && rows.isSuccess && offered.length === 0 && (
          <p className="mt-1 text-sm text-muted-foreground">{t("equipment.noMachineOnSite")}</p>
        )}
      </FieldWrapper>
      {machine && (
        <section
          data-testid="field-equipment-next-step"
          className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-3 shadow-sm"
        >
          <span className="min-w-0 flex-1 truncate font-medium">{label(machine)}</span>
          {waiting ? (
            <span className="text-sm text-warning">{waitingWord}</span>
          ) : (
            can("equipment.capture") && (
              <Button onClick={() => setEntering(true)}>
                <Camera />
                {t(going ? "equipment.recordExit" : "equipment.recordEntry")}
              </Button>
            )
          )}
        </section>
      )}
      {isNew && !entering && can("equipment.capture") && (
        <Button className="h-12 w-full" onClick={() => setEntering(true)}>
          <Camera />
          {t("equipment.newMachineEntry")}
        </Button>
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
      {entering && (machine || isNew) && !waiting && (
        <EquipmentEntryDialog
          direction={direction}
          project={project || machine?.project || ""}
          machine={isNew ? null : machine}
          fieldTaskId={fieldTaskId}
          onClose={() => setEntering(false)}
          onSaved={() => {
            refresh();
            setEntering(false);
            setChosen("");
            onRecordSaved?.();
          }}
        />
      )}
    </div>
  );
}

/**
 * Register a machine, or complete and correct its profile (2026-10 A8, X4).
 *
 * Optional ahead of time: nobody knows which machine will arrive (Lucas
 * 2026-10-07), so this is also where a 「新设备」 reported from site is
 * completed at acceptance - its sub class picked, or made inline. The project
 * is chosen here on a new machine, and the sub classes offered are that
 * project's - grouped under their major class (X1). The plate is the 「车牌号码」;
 * the serial number is no longer asked (its data stays). The movements
 * already logged against a machine are untouched, which is also why the site
 * is not offered when correcting.
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
  onSaved: (row: SiteEquipment) => void;
}) {
  const t = useTranslations("contractorOps");
  const suppliers = useQuery({
    queryKey: ["suppliers", "equipment-options"],
    queryFn: () => getSuppliers({ page_size: 200, sort_by: "name" }),
  });
  const [createdClassName, setCreatedClassName] = useState<string | null>(null);
  const [form, setForm] = useState<EquipmentPayload>({
    project: equipment?.project ?? project,
    code: equipment?.code ?? "",
    name: equipment?.name ?? "",
    registration_no: equipment?.registration_no ?? "",
    supplier: equipment?.supplier ?? null,
    category: equipment?.category ?? null,
    description: equipment?.description ?? "",
    certificate_expires_on: equipment?.certificate_expires_on ?? null,
    insurance_expires_on: equipment?.insurance_expires_on ?? null,
    pma_expires_on: equipment?.pma_expires_on ?? null,
    permit_expires_on: equipment?.permit_expires_on ?? null,
    road_tax_expires_on: equipment?.road_tax_expires_on ?? null,
    is_active: equipment?.is_active ?? true,
  });
  const set = <K extends keyof EquipmentPayload>(
    key: K,
    value: EquipmentPayload[K],
  ) => setForm((old) => ({ ...old, [key]: value }));
  /*
   * This project's equipment classes (T-242, X1). Filed here rather than
   * picked from a platform-wide list: the machines on a site belong to the
   * project, and so does the vocabulary that files them (F-369).
   */
  const classes = useEquipmentClasses(form.project);
  // Whether this project has a sub class to file a machine in at all (D-169).
  const hasSubClasses = classes.tree.allSubClasses.length > 0;
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => equipment
      ? updateSiteEquipment(equipment.id, {
          code: form.code,
          name: form.name,
          registration_no: form.registration_no,
          supplier: form.supplier,
          category: form.category,
          description: form.description,
          certificate_expires_on: form.certificate_expires_on,
          insurance_expires_on: form.insurance_expires_on,
          pma_expires_on: form.pma_expires_on,
          permit_expires_on: form.permit_expires_on,
          road_tax_expires_on: form.road_tax_expires_on,
          is_active: form.is_active,
        })
      : createSiteEquipment(form),
    onMutate: () => setError(""),
    onSuccess: onSaved,
    onError: (reason) =>
      setError(
        reason instanceof ApiError
          ? Object.values(reason.errors).join("; ") || reason.message
          : t("state.loadError"),
      ),
  });
  const dateField = (
    key:
      | "certificate_expires_on"
      | "insurance_expires_on"
      | "pma_expires_on"
      | "permit_expires_on"
      | "road_tax_expires_on",
    labelKey: string,
    hint?: string,
  ) => (
    <FieldWrapper label={t(labelKey)} hint={hint}>
      <Input
        type="date"
        aria-label={t(labelKey)}
        value={form[key] ?? ""}
        onChange={(e) => set(key, e.target.value || null)}
      />
    </FieldWrapper>
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t(equipment ? "equipment.editTitle" : "equipment.createTitle")}</DialogTitle>
          <DialogDescription>{t("equipment.formHelp")}</DialogDescription>
        </DialogHeader>
        {equipment?.needs_profile && (
          <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            {t("equipment.needsProfileHelp")}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* The office registers the machine first (A8); a project chosen
              here, not borrowed from the page's filter. Fixed once registered. */}
          <FieldWrapper label={t("field.project")} required className="sm:col-span-2">
            <ProjectPicker
              value={form.project}
              onValueChange={(next) =>
                setForm((old) => ({
                  ...old,
                  project: next === "all" ? "" : next,
                  // A class belongs to one project.
                  category: null,
                }))
              }
              placeholder={t("field.selectProject")}
              className="w-full"
              disabled={Boolean(equipment)}
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
          <FieldWrapper label={t("field.plateNo")}>
            <Input
              aria-label={t("field.plateNo")}
              value={form.registration_no}
              onChange={(e) => set("registration_no", e.target.value.toUpperCase())}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.equipmentSubClass")} required>
            {!form.project ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                {t("field.chooseProjectFirst")}
              </p>
            ) : (
              <>
                {/*
                  Required since D-169; a sub class since X1. When the project
                  has none, this does not present an empty dropdown to be stared
                  at - it says so and points at where classes are made.
                */}
                <EquipmentClassSelect
                  tree={classes.tree}
                  value={form.category ?? null}
                  currentName={createdClassName ?? equipment?.category_name}
                  disabled={!hasSubClasses && !form.category}
                  onChange={(value) => set("category", value)}
                />
                <QueryFailedNote query={classes.query} what={t("what.columns")} className="mt-2" />
                {!classes.query.isLoading && !classes.query.isError && !hasSubClasses && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("field.noEquipmentSubClassYet")}
                  </p>
                )}
                {/* Made here when none fits (2026-10-07): the office files a
                    machine when it arrives, without leaving this dialog. */}
                {!classes.query.isLoading && !classes.query.isError && (
                  <InlineClassCreator
                    project={form.project}
                    tree={classes.tree}
                    onCreated={(subClass) => {
                      // Its name at once, not its id, until the list refetches
                      // (Fable B4 #22).
                      setCreatedClassName(subClass.name);
                      set("category", subClass.id);
                    }}
                  />
                )}
              </>
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
                    <SupplierReturnBadge supplier={item} interactive={false} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* 「有退场资料」 (2026-10 C10). */}
            <SupplierReturnBadge
              supplier={(suppliers.data?.results ?? []).find((item) => item.id === form.supplier)}
            />
            <QueryFailedNote query={suppliers} what={t("what.suppliers")} />
          </FieldWrapper>
          {/* Where the reminders get their dates (B14, X4). Optional, because a
              contractor may not hold the paperwork for every item and a
              required field would be filled with a guess. */}
          {dateField("road_tax_expires_on", "field.roadTaxExpiresOn", t("field.expiryHelp"))}
          {dateField("certificate_expires_on", "field.certificateExpiresOn")}
          {dateField("insurance_expires_on", "field.insuranceExpiresOn")}
          {dateField("pma_expires_on", "field.pmaExpiresOn")}
          {dateField("permit_expires_on", "field.permitExpiresOn")}
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
          {/* The machine's entries and exits, on 设备进退场 (B2). */}
          {equipment && (
            <Link
              href={`/site-equipment?equipment=${equipment.id}`}
              // Closes the dialog: on /site-equipment the list changes under it
              // otherwise (Fable B4 #22).
              onClick={onClose}
              className="text-sm text-primary underline-offset-2 hover:underline sm:col-span-2"
            >
              {t("equipment.movementsLink")}
            </Link>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
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
              [form.category, t("field.equipmentSubClass")],
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

/**
 * 设备进场 in one step, the way 材料进场 is taken (2026-10 X2, C8, F3).
 *
 * The machine is one already on file, or - most often, since nobody knows in
 * advance which will arrive - a 「新设备」: a name and, if it has one, a plate;
 * then the photographs (`FieldEvidenceGrid`, the same as 材料进场), the DO -
 * photographed and read, its number filled in - the supplier's QR, both
 * signatures and the GPS fix. No category, no quantity, no unit: one entry is
 * one machine, and its class is the office's business. Offline-capable
 * through the same queue as every capture; the office then accepts it.
 *
 * 设备退场 is this same form (Lucas 2026-10-08, Q27: 「跟设备进场一样」): a
 * machine on site, the same evidence - DO number required - and an optional
 * reason; no application and no Return Note. Until the office accepts it the
 * machine stays on site.
 */
export function EquipmentEntryDialog({
  direction = "ENTRY",
  project,
  machine,
  fieldTaskId,
  onClose,
  onSaved,
}: {
  /**
   * 进场, or 退场 (2026-10 Q27): the exit takes the same evidence in the same
   * one step, for a machine on site, and adds an optional reason.
   */
  direction?: "ENTRY" | "EXIT";
  project: string;
  /** Null for a 「新设备」 nobody registered yet (an entry only). */
  machine: SiteEquipment | null;
  fieldTaskId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps");
  const field = useTranslations("fieldStaffPwa");
  const { user } = useAuth();
  const isFieldStaff = Boolean(user?.is_field_staff);
  const going = direction === "EXIT";
  // The exit's draft is its own: an exit begun for a machine must not
  // reopen as that machine's next entry.
  const key = going ? `exit:${machine?.id ?? ""}` : machine?.id ?? "new";
  const [newName, setNewName] = useDraftState(`entryName:${key}`, "");
  // Optional: not every machine has a plate. One already on file is that
  // machine coming back - the server files the entry on it.
  const [newPlate, setNewPlate] = useDraftState(`entryPlate:${key}`, "");
  const [deliveryNote, setDeliveryNote] = useDraftState(`entryDeliveryNote:${key}`, "");
  const [supplier, setSupplier] = useDraftState<ReturnBadgeSupplier | null>(`entrySupplier:${key}`, null);
  const [notes, setNotes] = useDraftState(`entryNotes:${key}`, "");
  const [photos, setPhotos] = useDraftState<File[]>(`entryPhotos:${key}`, []);
  const [fieldEvidence, setFieldEvidence] = useDraftState(`entryEvidence:${key}`, createEmptyFieldEvidence);
  const [deliveryNotePhoto, setDeliveryNotePhoto] = useDraftState<File | undefined>(`entryDeliveryNotePhoto:${key}`);
  const [ocrProof, setOcrProof] = useDraftState(`entryOcrProof:${key}`, "");
  const [receiverSignature, setReceiverSignature] = useDraftState<File | undefined>(`entryReceiverSignature:${key}`);
  const [supplierSignature, setSupplierSignature] = useDraftState<File | undefined>(`entrySupplierSignature:${key}`);
  const clearDraft = useClearDraft();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [location, setLocation] = useState<Coordinates | null>(null);
  const fieldPhotos = completedFieldEvidence(fieldEvidence);
  const submissionPhotos = isFieldStaff ? fieldPhotos : photos;
  const evidenceLabels = [
    t("equipmentEvidence.overview"),
    t("equipmentEvidence.identity"),
    t("equipmentEvidence.transport"),
    t("equipmentEvidence.condition"),
  ];
  const ocr = useDeliveryNoteReader({
    read: ocrEquipmentDeliveryNote,
    onRead: (result) => {
      setOcrProof(result.proof ?? "");
      const suggestions = result.suggestions as Record<string, string | undefined>;
      if (suggestions.delivery_note_no) setDeliveryNote(suggestions.delivery_note_no);
    },
    onReset: () => setOcrProof(""),
  });
  // A docket or a supplier card - only the supplier's card names a supplier
  // for a machine; it needs the network, and a failed scan leaves it blank.
  const scan = useMutation({
    mutationFn: (token: string) => scanSupplierQr(token),
    onMutate: () => setError(""),
    onSuccess: (row) =>
      setSupplier({ id: row.id, name: row.name, completed_return_count: row.completed_return_count }),
    onError: (reason) =>
      setError(reason instanceof ApiError ? reason.message : t("equipment.scanFailed")),
  });
  const save = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Authentication required.");
      return submitEquipmentMovementOfflineAware(user.id, {
        // One client_event_id for the job, kept across every retry of it.
        entry: !going,
        exit: going,
        project,
        equipment: machine?.id ?? "",
        equipment_name: machine ? undefined : newName.trim(),
        registration_no: machine ? undefined : newPlate.trim().toUpperCase() || undefined,
        supplier: supplier?.id,
        direction,
        operator_name: user.full_name,
        delivery_note_no: deliveryNote.trim(),
        vehicle_plate: machine?.registration_no || undefined,
        notes: notes.trim(),
        ocr_confirmed: Boolean(deliveryNotePhoto || deliveryNote.trim()),
        ocr_proof: deliveryNotePhoto && ocrProof ? ocrProof : undefined,
        original_occurred_at: new Date().toISOString(),
        client_event_id: crypto.randomUUID(),
        field_task: fieldTaskId,
        latitude: location?.latitude,
        longitude: location?.longitude,
        accuracy_m: location?.accuracy,
        photos: submissionPhotos,
        delivery_note_photo: deliveryNotePhoto,
        receiver_signature: receiverSignature,
        supplier_signature: supplierSignature,
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
        setError(Object.values(reason.errors).join(" ") || reason.message || t("equipment.submissionError"));
        return;
      }
      setFieldErrors({});
      setError(t("state.loadError"));
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {machine
              ? t(going ? "equipment.exitTitle" : "equipment.entryTitle", {
                  name: machineLabeller([machine])(machine),
                })
              : t("equipment.newMachineEntry")}
          </DialogTitle>
          <DialogDescription>{t(going ? "equipment.exitHelp" : "equipment.entryHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {!machine && (
            <FieldWrapper
              label={t("equipment.newMachineName")}
              required
              hint={t("equipment.newMachineHelp")}
              error={fieldErrors.equipment}
              className="sm:col-span-2"
            >
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            </FieldWrapper>
          )}
          {!machine && (
            <FieldWrapper
              label={t("field.plateNo")}
              hint={t("equipment.newMachinePlateHelp")}
              className="sm:col-span-2"
            >
              <Input
                aria-label={t("field.plateNo")}
                value={newPlate}
                onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
              />
            </FieldWrapper>
          )}
          <FieldWrapper
            label={t("field.photos")}
            required
            error={fieldErrors.photos}
            className="sm:col-span-2"
          >
            {isFieldStaff ? (
              <>
                <FieldEvidenceGrid
                  labels={evidenceLabels}
                  files={fieldEvidence}
                  progressLabel={t("evidenceProgress", {
                    current: fieldPhotos.length,
                    required: FIELD_EVIDENCE_PHOTO_COUNT,
                  })}
                  onChange={setFieldEvidence}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("equipment.photoMinimum", { min: EQUIPMENT_PHOTO_MIN })}
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
          <FieldWrapper label={t("equipment.deliveryNotePhoto")} className="sm:col-span-2">
            <FieldCamera
              label={
                deliveryNotePhoto
                  ? t("equipment.deliveryNoteReady")
                  : t("equipment.takeDeliveryNote")
              }
              file={deliveryNotePhoto}
              fileCount={deliveryNotePhoto ? 1 : 0}
              onCapture={(image) => {
                setDeliveryNotePhoto(image);
                ocr.inspect(project, image);
              }}
              onClear={() => {
                setDeliveryNotePhoto(undefined);
                ocr.cancel();
              }}
            />
            <DeliveryNoteReadStatus reader={ocr} className="mt-2" />
          </FieldWrapper>
          <FieldWrapper label={t("field.deliveryNoteNo")} required error={fieldErrors.delivery_note_no}>
            <Input
              aria-label={t("field.deliveryNoteNo")}
              value={deliveryNote}
              onChange={(e) => setDeliveryNote(e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.supplier")} error={fieldErrors.supplier}>
            {supplier ? (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{supplier.name}</span>
                {/* 「有退场资料」 (2026-10 C10), as wherever a supplier is chosen. */}
                <SupplierReturnBadge supplier={supplier} />
                <Button size="sm" variant="ghost" onClick={() => setSupplier(null)}>
                  {t("action.remove")}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full"
                disabled={scan.isPending}
                onClick={() => setScannerOpen(true)}
              >
                {scan.isPending ? <Loader2 className="animate-spin" /> : <ScanLine />}
                {t("equipment.scanSupplier")}
              </Button>
            )}
          </FieldWrapper>
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
            <FieldSignaturePad
              label={t("equipment.siteSignature")}
              clearLabel={field("action.clearSignature")}
              required
              value={receiverSignature}
              onChange={setReceiverSignature}
            />
            <FieldSignaturePad
              label={t("equipment.supplierSignature")}
              clearLabel={field("action.clearSignature")}
              required
              value={supplierSignature}
              onChange={setSupplierSignature}
            />
          </div>
          <LocationField
            className="sm:col-span-2"
            label={t("field.location")}
            actionLabel={t("action.getLocation")}
            readyLabel={t("action.locationReady")}
            value={location}
            onChange={setLocation}
            required
            error={fieldErrors.latitude || fieldErrors.longitude || fieldErrors.accuracy_m}
          />
          <FieldWrapper
            label={going ? t("equipment.exitReason") : t("field.notes")}
            className="sm:col-span-2"
          >
            <Textarea
              aria-label={going ? t("equipment.exitReason") : t("field.notes")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FieldWrapper>
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [machine || newName.trim(), t("equipment.newMachineName")],
              [
                isFieldStaff
                  ? hasRequiredFieldEvidence(fieldEvidence)
                  : submissionPhotos.length + (deliveryNotePhoto ? 1 : 0) >= EQUIPMENT_PHOTO_MIN,
                t("field.photos"),
              ],
              [deliveryNote.trim(), t("field.deliveryNoteNo")],
              [receiverSignature, t("equipment.siteSignature")],
              [supplierSignature, t("equipment.supplierSignature")],
              [location, t("field.location")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Camera />}
            {t(going ? "equipment.exitSubmit" : "equipment.entrySubmit")}
          </Button>
        </DialogFooter>
        <SupplierQrScanner
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onDetected={(token) => {
            setScannerOpen(false);
            scan.mutate(token);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * 「直接交接」 of an application made before the one-step flow (B13, then X2
 * for entries and Q27 for exits): at least four photographs, no ceiling
 * (B14), and both signatures - the site person and the supplier or driver.
 * It then waits for the office's acceptance like any movement recorded on
 * site. One movement is one machine (F3): no quantity or unit is asked.
 * Opened from the office's detail of the old application; the phone records
 * an exit in one step instead, which finishes the old application too.
 */
export function MovementDialog({
  row,
  movement,
  fieldTaskId,
  onClose,
  onSaved,
}: {
  row: SiteEquipment;
  /** The open application this handover completes. */
  movement: EquipmentMovement;
  fieldTaskId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps");
  const field = useTranslations("fieldStaffPwa");
  const { user } = useAuth();
  const isFieldStaff = Boolean(user?.is_field_staff);
  const direction = movement.direction;
  const [receiverSignature, setReceiverSignature] = useDraftState<File | undefined>(`receiverSignature:${row.id}`);
  const [supplierSignature, setSupplierSignature] = useDraftState<File | undefined>(`supplierSignature:${row.id}`);
  // F-282. Keys carry `row.id` because this dialog opens per equipment row
  // while the draft store is scoped per *task*: without the suffix, typing
  // against excavator A and then opening excavator B would show A's figures
  // under B's name, which is a wrong record rather than a recovered one.
  const [operator, setOperator] = useDraftState(`operator:${row.id}`, "");
  const [vehicle, setVehicle] = useDraftState(`vehicle:${row.id}`, "");
  const [deliveryNote, setDeliveryNote] = useDraftState(`deliveryNote:${row.id}`, "");
  const [notes, setNotes] = useDraftState(`notes:${row.id}`, "");
  const [photos, setPhotos] = useDraftState<File[]>(`photos:${row.id}`, []);
  const [fieldEvidence, setFieldEvidence] = useDraftState(`fieldEvidence:${row.id}`, createEmptyFieldEvidence);
  const [deliveryNotePhoto, setDeliveryNotePhoto] = useDraftState<File | undefined>(`deliveryNotePhoto:${row.id}`);
  // The signed read of that photo, sent with the handover so the server
  // does not read it again inside the upload (A9). Kept with the draft: the
  // photo is, and a reopened draft should not lose the read that goes with it.
  const [ocrProof, setOcrProof] = useDraftState(`ocrProof:${row.id}`, "");
  const clearDraft = useClearDraft();
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [location, setLocation] = useState<Coordinates | null>(null);
  const fieldPhotos = completedFieldEvidence(fieldEvidence);
  const submissionPhotos = isFieldStaff ? fieldPhotos : photos;
  const equipmentEvidenceLabels = [
    t("equipmentEvidence.overview"),
    t("equipmentEvidence.identity"),
    t("equipmentEvidence.transport"),
    t("equipmentEvidence.condition"),
  ];
  // Read the moment the delivery order is photographed, exactly as 材料进场
  // does (useDeliveryNoteReader) - no 【读取】 button.
  const ocr = useDeliveryNoteReader({
    read: ocrEquipmentDeliveryNote,
    onRead: (result) => {
      setOcrProof(result.proof ?? "");
      const suggestions = result.suggestions as Record<string, string | undefined>;
      if (suggestions.delivery_note_no) setDeliveryNote(suggestions.delivery_note_no);
      if (suggestions.vehicle_plate) setVehicle(suggestions.vehicle_plate);
    },
    // A new or removed photo: the old read no longer describes it.
    onReset: () => setOcrProof(""),
  });
  const save = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Authentication required.");
      return submitEquipmentMovementOfflineAware(user.id, {
        project: row.project,
        equipment: row.id,
        direction,
        operator_name: isFieldStaff ? user.full_name : operator.trim(),
        vehicle_plate: vehicle.trim(),
        delivery_note_no: deliveryNote.trim(),
        notes: notes.trim(),
        ocr_confirmed: Boolean(deliveryNotePhoto || deliveryNote.trim()),
        ocr_proof: deliveryNotePhoto && ocrProof ? ocrProof : undefined,
        original_occurred_at: new Date().toISOString(),
        client_event_id: crypto.randomUUID(),
        field_task: fieldTaskId,
        movement: movement.id,
        latitude: location?.latitude,
        longitude: location?.longitude,
        accuracy_m: location?.accuracy,
        photos: submissionPhotos,
        delivery_note_photo: deliveryNotePhoto,
        receiver_signature: receiverSignature,
        supplier_signature: supplierSignature,
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
          <DialogDescription>{t("equipment.handoverHelp")}</DialogDescription>
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
              onCapture={(image) => {
                setDeliveryNotePhoto(image);
                ocr.inspect(row.project, image);
              }}
              onClear={() => {
                setDeliveryNotePhoto(undefined);
                ocr.cancel();
              }}
            />
            <DeliveryNoteReadStatus reader={ocr} className="mt-2" />
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
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("equipment.photoMinimum", { min: EQUIPMENT_PHOTO_MIN })}
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
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
            <FieldSignaturePad
              label={t("equipment.siteSignature")}
              clearLabel={field("action.clearSignature")}
              required
              value={receiverSignature}
              onChange={setReceiverSignature}
            />
            <FieldSignaturePad
              label={t("equipment.supplierSignature")}
              clearLabel={field("action.clearSignature")}
              required
              value={supplierSignature}
              onChange={setSupplierSignature}
            />
          </div>
          <LocationField
            className="sm:col-span-2"
            label={t("field.location")}
            actionLabel={t("action.getLocation")}
            readyLabel={t("action.locationReady")}
            value={location}
            onChange={setLocation}
            required
            error={fieldErrors.latitude || fieldErrors.longitude || fieldErrors.accuracy_m}
          />
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
              [
                // The office counts four too now (L6), the delivery-order
                // photo included, the way the server counts.
                isFieldStaff
                  ? hasRequiredFieldEvidence(fieldEvidence)
                  : submissionPhotos.length + (deliveryNotePhoto ? 1 : 0) >= EQUIPMENT_PHOTO_MIN,
                t("field.photos"),
              ],
              [receiverSignature, t("equipment.siteSignature")],
              [supplierSignature, t("equipment.supplierSignature")],
              [location, t("field.location")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Camera />
            {t("equipment.handoverSubmit")}
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
            <div key={key} className="surface-panel rounded-xl p-3">
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
              className="overflow-hidden surface-panel rounded-xl"
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
                {/* Progress has no categories since 2026-10 (B1, X5): a
                    record filed in one before keeps it, shown here as it
                    was; nothing new is filed. */}
                {row.category_name && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
                    <span className="text-xs text-muted-foreground">
                      {t("field.category")}
                    </span>
                    <span className="font-medium">{row.category_name}</span>
                  </div>
                )}
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
  // Removing a phase made by mistake (p23): armed by a switch, no confirm
  // dialog (spec rule 8). One a progress record points at is refused by the
  // server, which names the records; that sentence stays beside the switch.
  const [removeArmed, setRemoveArmed] = useState(false);
  const [removeRefusal, setRemoveRefusal] = useState("");
  const removal = useMutation({
    mutationFn: () => deleteConstructionPhase(phase!.id),
    onSuccess: onSaved,
    onError: (error) =>
      setRemoveRefusal(error instanceof ApiError ? error.message : t("progress.phaseRemove.failed")),
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
        {phase && (
          <div className="space-y-2 rounded-md border border-destructive/20 p-3">
            <label className="flex items-start gap-3">
              <Switch
                checked={removeArmed}
                onCheckedChange={(next) => {
                  setRemoveArmed(next);
                  setRemoveRefusal("");
                }}
                aria-label={t("progress.phaseRemove.switch")}
              />
              <span>
                <span className="block text-sm font-medium">
                  {t("progress.phaseRemove.switch")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("progress.phaseRemove.hint")}
                </span>
              </span>
            </label>
            {removeArmed && (
              <Button
                variant="destructive"
                className="w-full"
                disabled={removal.isPending || save.isPending}
                onClick={() => removal.mutate()}
              >
                {removal.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                {t("progress.phaseRemove.confirm")}
              </Button>
            )}
            {removeRefusal && (
              <p role="alert" className="text-sm text-destructive">
                {removeRefusal}
              </p>
            )}
          </div>
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
  // No category (2026-10 B1, X5): a draft saved with one before simply
  // leaves it unread.
  const [percent, setPercent] = useDraftState("percent", "");
  const [description, setDescription] = useDraftState("description", "");
  const [photos, setPhotos] = useDraftState<File[]>("photos", []);
  const [fieldEvidence, setFieldEvidence] = useDraftState("fieldEvidence", createEmptyFieldEvidence);
  const clearDraft = useClearDraft();
  const [location, setLocation] = useState<Coordinates | null>(null);
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
            }}
            placeholder={t("field.selectProject")}
          />
        </FieldWrapper>
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
        <LocationField
          label={t("field.location")}
          actionLabel={t("action.getLocation")}
          readyLabel={t("action.locationReady")}
          value={location}
          onChange={setLocation}
          required
        />
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
  const unitName = useUnitName();
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
  // The 「已批准」 notice links `/field-staff?...&outgoing=<id>` (audit #15):
  // that return opens at the step it is at - the exit, for the site, while it
  // waits for the lorry; otherwise its detail. Closing takes the id back out
  // of the address, so the same notice pressed again opens it again.
  const [linkedId, setLinkedId] = useUrlSelection("outgoing");
  const linked = useQuery({
    queryKey: ["material-outgoing", "detail", linkedId],
    queryFn: () => getMaterialOutgoingRecord(linkedId as string),
    enabled: Boolean(linkedId),
  });
  const linkedRow = linkedId && linked.data?.id === linkedId ? linked.data : null;
  const linkedExit =
    linkedRow?.status === "APPROVED" && can("material_outgoing.submit") ? linkedRow : null;
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
        // DO and plate head every record that has them (2026-10 C12).
        { key: "delivery_note_no", label: t("field.deliveryNote") },
        { key: "vehicle_plate", label: t("field.vehiclePlate") },
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
      {linkedId && linked.isError ? (
        <LoadFailed what={t("what.outgoingRecord")} onRetry={() => void linked.refetch()} />
      ) : null}
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
              className="surface-panel rounded-xl p-4"
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
                    {row.material_name} · {row.quantity} {unitName(row.unit, row.unit_label)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("outgoing.executor")}: {row.executor_name}
                  </p>
                  {/* Who it goes back to (2026-10 C7), not the destination
                      text; since C9 a return may name no supplier: 「—」. */}
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("field.supplier")}: {row.supplier_name || "—"}
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
      {(returning ?? linkedExit) && (
        <ReturnProcessingDialog
          row={(returning ?? linkedExit) as MaterialOutgoing}
          onClose={() => {
            setReturning(null);
            setLinkedId(null);
          }}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["material-outgoing"] });
            void qc.invalidateQueries({ queryKey: ["my-submissions"] });
            setReturning(null);
            setLinkedId(null);
          }}
        />
      )}
      {(viewing ?? (linkedRow && !linkedExit ? linkedRow : null)) && (
        <OutgoingDetailDialog
          id={(viewing ?? linkedRow)!.id}
          onClose={() => {
            setViewing(null);
            setLinkedId(null);
          }}
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
 *
 * 2026-10 C9: the office fills the Return Note first - 【批准】 stays off,
 * saying why, until it is filled (the server refuses it too). The note's
 * dialog lives here, so every place that shows these buttons offers it.
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
  const qc = useQueryClient();
  const [noting, setNoting] = useState(false);
  const needsNote = !row.has_return_note;
  return (
    <>
      {can("material_outgoing.approve") && row.status === "PENDING" && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant={needsNote ? "default" : "outline"} onClick={() => setNoting(true)}>
            <FileText />
            {needsNote ? t("returnNote.fill") : t("returnNote.edit")}
          </Button>
          {/* Return ends the application: a reason, no conversation first (C9). */}
          <Button variant="outline" onClick={() => onReview("REJECTED")}>
            <RotateCcw />
            {t("outgoing.returnAction")}
          </Button>
          <Button
            disabled={pending || needsNote}
            disabledReason={needsNote ? t("returnNote.needNoteFirst") : undefined}
            onClick={() => onReview("APPROVED")}
          >
            <Check />
            {t("action.approve")}
          </Button>
        </div>
      )}
      {/* 已批准 / 等待退场: the site records the exit with both signatures. */}
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
      {/* 待后台确认: the office confirms what left, which closes it. */}
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
      {noting && (
        <ReturnNoteDialog
          row={row}
          onClose={() => setNoting(false)}
          onSaved={() => {
            setNoting(false);
            void qc.invalidateQueries({ queryKey: ["material-outgoing"] });
          }}
        />
      )}
    </>
  );
}

/**
 * Apply to send material back to its supplier (2026-10 C9).
 *
 * As little as the phone can ask (「手机端越简单越好」): the material - a
 * category, whose unit comes with it (A4) - how much, the lorry's plate,
 * why, and the photographs. The supplier is optional, chosen or scanned; no
 * original delivery is asked for any more (X20, the 「原进场记录」 the
 * customer circled in 图 4). The office fills the Return Note and approves;
 * both sides sign when the material actually leaves (`ReturnProcessingDialog`).
 */
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
  const t = useTranslations("contractorOps");
  const tRoot = useTranslations();
  const { user } = useAuth();
  const isFieldStaff = Boolean(user?.is_field_staff);
  // F-282
  const [project, setProject] = useDraftState("project", initialProject);
  const [form, setForm] = useDraftState("form", {
    category: "",
    unit: "",
    supplier: "",
    quantity: "",
    executor_name: "",
    vehicle_plate: "",
    reason: "",
    // Whose make (2026-10 D1): the category's one designated maker, if any.
    manufacturer: "",
  });
  const [scannedSupplier, setScannedSupplier] = useState("");
  const [photos, setPhotos] = useDraftState("photos", createEmptyFieldEvidence);
  const clearDraft = useClearDraft();
  const [location, setLocation] = useState<Coordinates | null>(null);
  const columns = useQuery({
    queryKey: ["project-categories", "outgoing", project],
    queryFn: () =>
      getProjectCategories({
        project,
        kind: "MATERIAL",
        is_active: true,
        page_size: 200,
        sort_by: "sort_order",
        sort_order: "asc",
      }),
    enabled: Boolean(project),
    staleTime: 30_000,
  });
  const columnRows: ProjectCategory[] = columns.data?.results ?? [];
  const selected = columnRows.find((row) => row.id === form.category);
  const fill = columnAutofill(
    selected,
    { unit: form.unit, supplier: form.supplier, manufacturer: form.manufacturer },
    { scannedSupplier },
  );
  const unit = fill.unitLocked ? fill.unit : form.unit;
  const units = useMaterialUnits();
  const unitName = useUnitName();
  const chooseMaterial = (category: string) =>
    setForm((old) => {
      const filled = columnAutofill(
        columnRows.find((row) => row.id === category),
        { unit: old.unit, supplier: old.supplier, manufacturer: old.manufacturer },
        { scannedSupplier },
      );
      return {
        ...old,
        category,
        unit: filled.unit,
        supplier: filled.supplier,
        manufacturer: filled.manufacturer,
      };
    });
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
        category: form.category,
        unit,
        supplier: form.supplier || undefined,
        manufacturer: form.manufacturer || undefined,
        quantity: form.quantity,
        vehicle_plate: form.vehicle_plate,
        reason: form.reason,
        executor_name: isFieldStaff ? user.full_name : form.executor_name,
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
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("outgoing.createTitle")}</DialogTitle>
          <DialogDescription>{t("outgoing.returnFormHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper
            label={t("field.project")}
            required
            className="sm:col-span-2"
          >
            <ProjectPicker
              value={project}
              onValueChange={(next) => {
                setProject(next);
                // A category belongs to one site.
                setForm((old) => ({ ...old, category: "", unit: "" }));
              }}
              placeholder={t("field.selectProject")}
              disabled={Boolean(initialProject) && isFieldStaff}
            />
          </FieldWrapper>
          <FieldWrapper label={t("outgoing.material")} required className="sm:col-span-2">
            <Select
              value={form.category || undefined}
              disabled={!project || columns.isLoading}
              onValueChange={chooseMaterial}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder={t("outgoing.chooseMaterial")} />
              </SelectTrigger>
              <SelectContent>
                {columnRows.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <QueryFailedNote query={columns} what={t("what.materials")} />
            {project && columns.isSuccess && !columnRows.length ? (
              <p className="text-xs text-muted-foreground">{t("outgoing.noMaterials")}</p>
            ) : null}
          </FieldWrapper>
          <FieldWrapper label={t("outgoing.returnQuantity")} required>
            <Input
              type="number"
              min="0.001"
              step="0.001"
              inputMode="decimal"
              value={form.quantity}
              onChange={(e) => set("quantity", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.unit")} required>
            {fill.unitLocked ? (
              // The category decided it (A4, Q1): shown, not asked.
              <div className="flex h-11 items-center justify-between rounded-md border bg-muted/40 px-3">
                <span className="text-sm font-medium">{unitName(unit, selected?.default_unit_label)}</span>
                <span className="text-xs text-muted-foreground">{t("outgoing.autoFilled")}</span>
              </div>
            ) : (
              <>
                <Select value={form.unit || undefined} onValueChange={(next) => set("unit", next)}>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder={t("field.unit")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(units.data ?? []).map((row) => (
                      <SelectItem key={row.code} value={row.code}>
                        {unitName(row.code, row.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <QueryFailedNote query={units} what={t("field.unit")} />
              </>
            )}
          </FieldWrapper>
          <OutgoingSupplierField
            className="sm:col-span-2"
            value={form.supplier}
            allowedIds={fill.supplierIds}
            onChange={(supplier, scanned) => {
              setScannedSupplier(scanned ? supplier : "");
              set("supplier", supplier);
            }}
          />
          {selected ? (
            <FieldWrapper label={tRoot("manufacturers.column")} className="sm:col-span-2">
              <ManufacturerPicker
                value={form.manufacturer ?? ""}
                onChange={(manufacturer) => set("manufacturer", manufacturer)}
                designated={selected.manufacturer_options ?? []}
                autoFilled={fill.manufacturerFromColumn}
                triggerClassName="h-11"
              />
            </FieldWrapper>
          ) : null}
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
          <LocationField
            className="sm:col-span-2"
            label={t("field.location")}
            actionLabel={t("action.getLocation")}
            readyLabel={t("action.locationReady")}
            value={location}
            onChange={setLocation}
            required={isFieldStaff}
          />
          <FieldWrapper
            label={t("field.reason")}
            required
            className="sm:col-span-2"
          >
            <Textarea
              value={form.reason}
              placeholder={t("outgoing.reasonPlaceholder")}
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
              [form.category, t("outgoing.material")],
              [unit, t("field.unit")],
              [Number(form.quantity) > 0, t("outgoing.returnQuantity")],
              [isFieldStaff || form.executor_name, t("field.executor")],
              [form.reason.trim(), t("field.reason")],
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
 * The material actually leaving, on the same record (2026-10 C9, F3).
 *
 * After approval (已批准 / 等待退场): photographs of what leaves, the
 * material as it left, how much actually went, the lorry's plate and the DO,
 * the supplier (scanned if possible) and both signatures - the site person's
 * and the supplier's or driver's. It then waits for the office's
 * confirmation (待后台确认); only that takes it off the net quantity (Q4).
 *
 * Reads the record itself, so the phone's history sheet - which only holds
 * the id and the number - opens it with everything filled in.
 *
 * Works without signal (Q29.3): what is typed, photographed and signed is
 * kept in this exit's own draft until it has gone - uploaded, or into the
 * phone's queue with its photos and both signatures - and an exit already
 * waiting in the queue is said so, not asked for a second time.
 */
export function ReturnProcessingDialog({
  row,
  onClose,
  onSaved,
}: {
  /** The phone's history row carries only the id and the reference. */
  row: Pick<MaterialOutgoing, "id" | "reference_no"> &
    Partial<Pick<MaterialOutgoing, "quantity" | "unit">>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps");
  const { user } = useAuth();
  const record = useQuery({
    queryKey: ["material-outgoing", "detail", row.id],
    queryFn: () => getMaterialOutgoingRecord(row.id),
  });
  // query-failure: a phone that cannot read its own queue shows the form, as before
  const queued = useQuery({
    queryKey: ["material-outgoing", "exit-queued", row.id],
    queryFn: () => queuedOutgoingExit(user!.id, row.id),
    enabled: Boolean(user?.id),
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
        {queued.data ? (
          <p role="status" className="rounded-lg border border-info/25 bg-info/5 px-3 py-2 text-sm">
            {t("outgoing.exitWaitingUpload")}
          </p>
        ) : record.isError ? (
          <LoadFailed what={t("what.outgoingRecord")} onRetry={() => void record.refetch()} />
        ) : !record.data ? (
          <div className="grid min-h-32 place-items-center">
            <Loader2 className="size-7 animate-spin text-primary" />
          </div>
        ) : (
          <FieldDraft scope={`outgoing-exit:${record.data.id}`}>
            <ExitForm record={record.data} onClose={onClose} onSaved={onSaved} />
          </FieldDraft>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExitForm({
  record,
  onClose,
  onSaved,
}: {
  record: MaterialOutgoing;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps");
  const common = useTranslations("common");
  const field = useTranslations("fieldStaffPwa");
  const { user } = useAuth();
  const isFieldStaff = Boolean(user?.is_field_staff);
  const unitName = useUnitName();
  // In this exit's draft (Q29.3): a send that fails, a closed dialog or a
  // reload at the gate loses none of the photos or signatures.
  const draft = (name: string) => `exit:${record.id}:${name}`;
  const [photos, setPhotos] = useDraftState(draft("photos"), createEmptyFieldEvidence);
  const [note, setNote] = useDraftState(draft("note"), "");
  const [category, setCategory] = useDraftState(draft("category"), record.category ?? "");
  const [returned, setReturned] = useDraftState(
    draft("returned"),
    String(Number(record.return_note_quantity ?? record.quantity ?? 0) || ""),
  );
  const [plate, setPlate] = useDraftState(draft("plate"), record.vehicle_plate ?? "");
  const [doNo, setDoNo] = useDraftState(
    draft("doNo"),
    record.delivery_note_no || record.return_note_delivery_note_no || "",
  );
  const [supplier, setSupplier] = useDraftState(draft("supplier"), record.supplier ?? "");
  const [siteSignature, setSiteSignature] = useDraftState<File | undefined>(draft("siteSignature"));
  const [supplierSignature, setSupplierSignature] = useDraftState<File | undefined>(draft("supplierSignature"));
  // One id for this exit, minted at the first press and kept with the draft:
  // every try - online, queued, replayed - is the same exit to the server.
  const [clientEventId, setClientEventId] = useDraftState(draft("clientEventId"), "");
  const clearDraft = useClearDraft();
  const [location, setLocation] = useState<LocationFix | null>(null);
  const [error, setError] = useState("");
  const columns = useQuery({
    queryKey: ["project-categories", "outgoing", record.project],
    queryFn: () =>
      getProjectCategories({
        project: record.project,
        kind: "MATERIAL",
        is_active: true,
        page_size: 200,
        sort_by: "sort_order",
        sort_order: "asc",
      }),
    staleTime: 30_000,
  });
  const columnRows: ProjectCategory[] = columns.data?.results ?? [];
  const chosen = columnRows.find((row) => row.id === category);
  const unit = chosen?.default_unit || record.unit;
  const taken = photos.filter((file): file is File => Boolean(file));
  const save = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Authentication required.");
      const eventId = clientEventId || newClientEventId("outgoing-exit");
      if (!clientEventId) setClientEventId(eventId);
      return submitMaterialOutgoingExitOfflineAware(user.id, {
        outgoing: record.id,
        reference_no: record.reference_no,
        photos: taken,
        note: note.trim() || undefined,
        latitude: location ? String(location.latitude) : undefined,
        longitude: location ? String(location.longitude) : undefined,
        returned_quantity: returned,
        site_signature: siteSignature as File,
        supplier_signature: supplierSignature as File,
        vehicle_plate: plate.trim() || undefined,
        delivery_note_no: doNo.trim() || undefined,
        supplier: supplier || undefined,
        category: category && category !== record.category ? category : undefined,
        client_event_id: eventId,
      });
    },
    // Uploaded, or safely in the phone's queue: the draft has done its job.
    onSuccess: () => {
      clearDraft();
      onSaved();
    },
    onError: (failure) =>
      setError(failure instanceof ApiError ? Object.values(failure.errors).join("; ") || failure.message : t("outgoing.returnFailed")),
  });
  return (
    <>
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
      <FieldWrapper label={t("outgoing.material")} required>
        <Select value={category || undefined} onValueChange={setCategory}>
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder={record.material_name || t("outgoing.chooseMaterial")} />
          </SelectTrigger>
          <SelectContent>
            {columnRows.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <QueryFailedNote query={columns} what={t("what.materials")} />
      </FieldWrapper>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldWrapper
          label={`${t("outgoing.returnedQuantity")} (${unitName(unit, record.unit_label)})`}
          required
        >
          <Input
            type="number"
            min="0.001"
            step="0.001"
            inputMode="decimal"
            value={returned}
            onChange={(event) => setReturned(event.target.value)}
          />
        </FieldWrapper>
        <FieldWrapper label={t("field.vehiclePlate")}>
          <Input value={plate} onChange={(event) => setPlate(event.target.value.toUpperCase())} />
        </FieldWrapper>
        <FieldWrapper label={t("field.deliveryNote")} className="sm:col-span-2">
          <Input value={doNo} onChange={(event) => setDoNo(event.target.value)} />
        </FieldWrapper>
      </div>
      <OutgoingSupplierField value={supplier} onChange={(next) => setSupplier(next)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldSignaturePad
          label={t("outgoing.siteSignature")}
          clearLabel={field("action.clearSignature")}
          required
          value={siteSignature}
          onChange={setSiteSignature}
        />
        <FieldSignaturePad
          label={t("outgoing.supplierSignature")}
          clearLabel={field("action.clearSignature")}
          required
          value={supplierSignature}
          onChange={setSupplierSignature}
        />
      </div>
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
            [category || record.material_name, t("outgoing.material")],
            [Number(returned) > 0, t("outgoing.returnedQuantity")],
            [siteSignature, t("outgoing.siteSignature")],
            [supplierSignature, t("outgoing.supplierSignature")],
          ]}
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
          {t("outgoing.sendReturn")}
        </Button>
      </DialogFooter>
    </>
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
  const tRootDetail = useTranslations();
  const unitNameDetail = useUnitName();
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
            // B11: the supplier and the delivery it sends back, on the same
            // record as the application, the approval and the signatures.
            ...(row.supplier_name
              ? [{ label: t("outgoing.supplier"), value: row.supplier_name }]
              : []),
            // D1: whose make, with 「非指定厂商」 when the category names others.
            ...(row.manufacturer_name
              ? [{
                  label: tRootDetail("manufacturers.column"),
                  value: <ManufacturerCell name={row.manufacturer_name} offList={row.manufacturer_off_list} />,
                }]
              : []),
            ...(row.source_receipt_no
              ? [{ label: t("outgoing.sourceReceipt"), value: row.source_receipt_no }]
              : []),
            {
              label: t("field.material"),
              value: [row.material_name, row.material_specification].filter(Boolean).join(" · "),
            },
            { label: t("outgoing.returnQuantity"), value: `${row.quantity} ${unitNameDetail(row.unit, row.unit_label)}` },
            ...(row.returned_quantity
              ? [{ label: t("outgoing.returnedQuantity"), value: `${row.returned_quantity} ${unitNameDetail(row.unit, row.unit_label)}` }]
              : []),
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
          signatures={[
            ...(
              [
                ["siteSignature", row.site_signature],
                ["supplierSignature", row.supplier_signature],
              ] as const
            )
              .filter(([, source]) => Boolean(source))
              .map(([who, source]) => ({ label: t(`outgoing.${who}`), url: source as string })),
            // The Return Note's approver (2026-10 C9).
            ...(row.approver_signature
              ? [{ label: t("returnNote.approverSignature"), url: row.approver_signature }]
              : []),
          ]}
          panel={
            <>
            {/* The Return Note it is approved on (2026-10 C9). */}
            <ReturnNotePanel row={row} />
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
            </>
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
          // 【确认归档】 once the return is finished (C4).
          closure={{ kind: "MATERIAL_OUTGOING", recordId: row.id }}
        />
      )}
    </RecordDetailDialog>
  );
}
