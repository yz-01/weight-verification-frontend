"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FolderOpen,
  FileText,
  FilePlus2,
  HardHat,
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
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ExportButton } from "@/components/shared/export-button";
import { FieldCamera } from "@/components/shared/field-camera";
import {
  FieldWrapper,
  ListHeader,
  StatusBadge,
} from "@/components/shared/page-primitives";
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
  reorderProjectCategories,
  deleteProjectCategory,
  exportEquipmentMovements,
  getConstructionPhases,
  getEquipmentMovements,
  getEquipmentSummary,
  getFieldTasks,
  getMaterialOutgoing,
  ocrEquipmentDeliveryNote,
  getProjectCategories,
  getSiteEquipment,
  getSiteProgressRecords,
  getSiteProgressSummary,
  reviewMaterialOutgoing,
  fileProgressRecord,
  reviewSiteProgressRecord,
  transitionFieldTask,
  updateFieldTask,
  updateProjectCategory,
  updateSiteEquipment,
} from "@/services/contractor-ops.service";
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

function tone(
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
 * The five column schemes this one screen serves, and the Category Management
 * module each is named after (D-161).
 *
 * One screen rather than five, because the fields, the permissions, the
 * ordering and the delete protection are identical - five screens with one
 * meaning is what D-125 refuses. What the kind decides is the title, the list
 * and what a new column defaults to.
 *
 * `MATERIAL` is deliberately absent: deliveries and the money they cost are
 * managed on `/material-columns`, which carries a unit, a BQ target and a
 * supplier list this screen has no fields for (T-161).
 */
const CATEGORY_SCREENS: Record<string, string> = {
  FIELD: "field",
  EQUIPMENT: "equipment",
  PROGRESS: "progress",
  EHS: "ehs",
  CONSTRUCTION_WASTE: "debris",
};

export function ProjectCategoriesWorkspace() {
  const t = useTranslations("contractorOps");
  const modules = useTranslations("categoryManagement");
  const common = useTranslations("common");
  const { can } = useAuth();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const requestedProject = searchParams.get("project")?.trim() ?? "";
  /*
   * Which scheme this screen is showing (F-372).
   *
   * It used to be `FIELD` and nothing else, while Category Management sent
   * five of its nine module rows here. So "Open the module" on Equipment,
   * Progress, EHS and Construction waste all landed on the site-record list,
   * and an equipment column could not be created anywhere at all - the screen
   * that was supposed to hold it could not even list it.
   *
   * An unknown value falls back to site records rather than showing nothing:
   * a hand-typed address is not a reason to present an empty screen.
   */
  const kind =
    (searchParams.get("kind")?.trim().toUpperCase() ?? "") in CATEGORY_SCREENS
      ? (searchParams.get("kind") as string).trim().toUpperCase()
      : "FIELD";
  const moduleKey = CATEGORY_SCREENS[kind];
  const [project, setProject] = useState(requestedProject);
  const [editing, setEditing] = useState<ProjectCategory | "new" | null>(
    searchParams.get("create") === "1" &&
      can("category.manage") &&
      requestedProject
      ? "new"
      : null,
  );
  const [removing, setRemoving] = useState<ProjectCategory | null>(null);
  const rows = useQuery({
    queryKey: ["project-categories", kind, project],
    // The other half of the split (T-161). This screen never lists the
    // material columns, which are managed on /material-columns; which of the
    // remaining schemes it lists is the address's business (D-161).
    queryFn: () =>
      getProjectCategories({
        page_size: 200,
        project: project || undefined,
        // Spelled out rather than shorthand: `check-category-kinds.mjs` reads
        // the call to prove every category list says which scheme it wants.
        kind: kind,
      }),
  });
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["project-categories"] });
  const removal = useMutation({
    mutationFn: deleteProjectCategory,
    onSuccess: () => {
      void refresh();
      setRemoving(null);
    },
  });
  const reorder = useMutation({
    mutationFn: reorderProjectCategories,
    onSuccess: refresh,
  });
  const ordered = rows.data?.results ?? [];
  // Only offered on one site at a time. Across projects the card above a card
  // belongs to a different list, so "move up" would have nothing meaningful
  // to swap places with.
  const canReorder = can("category.manage") && Boolean(project);
  /** Swap this category with its neighbour, sending both places at once. */
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= ordered.length) return;
    reorder.mutate([
      { id: ordered[index].id, sort_order: target },
      { id: ordered[target].id, sort_order: index },
    ]);
  };
  const dialogProject =
    editing === "new" ? project : editing?.project ?? "";
  return (
    <div className="space-y-5">
      <ListHeader
        /* Named after the Category Management row this screen was opened
           from, so the two agree on what the list is called. Reusing those
           strings rather than writing a second set: two names for one list is
           how a reader ends up unsure they are in the right place. */
        title={modules(`module.${moduleKey}`)}
        subtitle={modules(`moduleHelp.${moduleKey}`)}
        action={
          can("category.manage") ? (
            <Button
              requires={[[project, t("field.project")]]}
              onClick={() => setEditing("new")}
            >
              <Plus />
              {t("categories.add")}
            </Button>
          ) : undefined
        }
      />
      <ProjectFilter value={project} onChange={setProject} />
      {can("category.manage") && !project && !!rows.data?.count && (
        <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
          {t("categories.reorderNeedsProject")}
        </p>
      )}
      <WorkspaceState
        loading={rows.isLoading}
        error={rows.isError}
        empty={!rows.data?.count}
      />
      {!!rows.data?.count && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ordered.map((row, index) => (
            <article
              key={row.id}
              className="rounded-lg border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <ListTree className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {row.code}
                  </p>
                  <h3 className="truncate font-semibold">{row.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {row.description || t("state.noDescription")}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
                <StatusBadge
                  label={t(row.is_active ? "status.active" : "status.inactive")}
                  tone={row.is_active ? "positive" : "neutral"}
                />
                <StatusBadge
                  label={t(
                    row.is_visible_in_pwa
                      ? "status.pwaVisible"
                      : "status.pwaHidden",
                  )}
                  tone={row.is_visible_in_pwa ? "info" : "neutral"}
                />
                <StatusBadge
                  label={t(
                    row.access_mode === "ALL"
                      ? "status.accessAll"
                      : "status.accessRestricted",
                  )}
                  tone={row.access_mode === "ALL" ? "neutral" : "warning"}
                />
                {can("category.manage") && (
                  <div className="ml-auto flex gap-1">
                    {canReorder && (
                      <>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title={t("categories.moveUp")}
                          disabledReason={
                            index === 0 ? common("alreadyFirst") : undefined
                          }
                          disabled={index === 0 || reorder.isPending}
                          onClick={() => move(index, -1)}
                        >
                          <ChevronUp />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title={t("categories.moveDown")}
                          disabledReason={
                            index === ordered.length - 1
                              ? common("alreadyLast")
                              : undefined
                          }
                          disabled={
                            index === ordered.length - 1 || reorder.isPending
                          }
                          onClick={() => move(index, 1)}
                        >
                          <ChevronDown />
                        </Button>
                      </>
                    )}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title={t("action.edit")}
                      onClick={() => setEditing(row)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-destructive"
                      title={t("action.remove")}
                      onClick={() => setRemoving(row)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && dialogProject && (
        <CategoryDialog
          project={dialogProject}
          defaultKind={kind as ProjectCategoryKind}
          row={editing === "new" ? null : editing}
          categories={(rows.data?.results ?? []).filter(
            (item) => item.project === dialogProject,
          )}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void refresh();
            setEditing(null);
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={() => setRemoving(null)}
          title={t("categories.removeTitle", { name: removing.name })}
          description={t("categories.removeBody")}
          confirmLabel={t("action.remove")}
          confirmIcon={Trash2}
          isPending={removal.isPending}
          onConfirm={() => removal.mutate(removing.id)}
        />
      )}
    </div>
  );
}

export function CategoryDialog({
  project,
  defaultKind,
  row,
  categories,
  onClose,
  onSaved,
}: {
  project: string;
  /** The scheme the screen is listing, so a new column joins that list. */
  defaultKind: ProjectCategoryKind;
  row: ProjectCategory | null;
  categories: ProjectCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps");
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
    parent: row?.parent ?? null,
    code: row?.code ?? "",
    name: row?.name ?? "",
    // A new column joins the list it was created from - which is not always
    // site records any more (D-161). An existing row keeps whatever it
    // already is, including the BOTH marker on a column the split could not
    // classify; the picker below is where somebody who knows settles it.
    kind: row?.kind ?? defaultKind,
    submission_mode: row?.submission_mode ?? "REVIEW",
    description: row?.description ?? "",
    sort_order: row?.sort_order ?? categories.length,
    is_visible_in_pwa: row?.is_visible_in_pwa ?? true,
    is_active: row?.is_active ?? true,
    access_mode: row?.access_mode ?? "ALL",
    allowed_roles: row?.allowed_roles ?? [],
    allowed_users: row?.allowed_users ?? [],
    upload_roles: row?.upload_roles ?? [],
    upload_users: row?.upload_users ?? [],
    edit_roles: row?.edit_roles ?? [],
    edit_users: row?.edit_users ?? [],
  });
  const save = useMutation({
    mutationFn: () =>
      row ? updateProjectCategory(row.id, form) : createProjectCategory(form),
    onSuccess: onSaved,
  });
  const set = <K extends keyof ProjectCategoryPayload>(
    key: K,
    value: ProjectCategoryPayload[K],
  ) => setForm((old) => ({ ...old, [key]: value }));
  const toggle = (
    key:
      | "allowed_roles"
      | "allowed_users"
      | "upload_roles"
      | "upload_users"
      | "edit_roles"
      | "edit_users",
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
                <SelectItem value="FIELD">
                  {t("categories.kindField")}
                </SelectItem>
                <SelectItem value="MATERIAL">
                  {t("categories.kindMaterial")}
                </SelectItem>
                {/* The modules Category Management groups by (D-125).
                    Offered here as well as there, because a field the server
                    accepts and no screen can set is a field nobody can fill.
                    Choosing one moves the column out of this screen's list,
                    which is what reclassifying it means - and the server
                    refuses the move outright if deliveries or site records
                    are already filed in it. */}
                {/* The machines a contractor registers on a site (T-242).
                    Missing here until T-244, which is exactly the shape the
                    comment above warns about: `SiteEquipment.category` was
                    served, counted and offered on the equipment form, and no
                    screen could create a column to put in it (F-372). */}
                <SelectItem value="EQUIPMENT">
                  {t("categories.kindEquipment")}
                </SelectItem>
                <SelectItem value="PROGRESS">
                  {t("categories.kindProgress")}
                </SelectItem>
                <SelectItem value="EHS">
                  {t("categories.kindEhs")}
                </SelectItem>
                <SelectItem value="CONSTRUCTION_WASTE">
                  {t("categories.kindConstructionWaste")}
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
          <FieldWrapper label={t("field.parent")} className="sm:col-span-2">
            <Select
              value={form.parent ?? "none"}
              onValueChange={(value) =>
                set("parent", value === "none" ? null : value)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("field.noParent")}</SelectItem>
                {categories
                  .filter((item) => item.id !== row?.id)
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.code} - {item.name}
                    </SelectItem>
                  ))}
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
                  {!roles.isLoading && !roles.data?.results.length && (
                    <p className="text-sm text-muted-foreground">
                      {t("categories.noRoles")}
                    </p>
                  )}
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
                  {!people.isLoading && !people.data?.results.length && (
                    <p className="text-sm text-muted-foreground">
                      {t("categories.noUsers")}
                    </p>
                  )}
                </div>
              </FieldWrapper>
            </>
          )}
          <div className="border-t pt-4 sm:col-span-2">
            <h4 className="text-sm font-semibold">{t("categories.uploadTitle")}</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("categories.uploadHelp")}
            </p>
          </div>
          <FieldWrapper label={t("categories.uploadRoles")}>
            <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border p-3">
              {(roles.data?.results ?? []).map((role) => (
                <label key={role.id} className="flex min-h-10 items-center gap-3">
                  <Checkbox
                    checked={form.upload_roles?.includes(role.id)}
                    onCheckedChange={(checked) =>
                      toggle("upload_roles", role.id, checked === true)
                    }
                  />
                  <span className="text-sm font-medium">{role.name}</span>
                </label>
              ))}
              {!roles.isLoading && !roles.data?.results.length && (
                <p className="text-sm text-muted-foreground">{t("categories.noRoles")}</p>
              )}
            </div>
          </FieldWrapper>
          <FieldWrapper label={t("categories.uploadUsers")}>
            <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border p-3">
              {(people.data?.results ?? []).map((person) => (
                <label key={person.user} className="flex min-h-10 items-center gap-3">
                  <Checkbox
                    checked={form.upload_users?.includes(person.user)}
                    onCheckedChange={(checked) =>
                      toggle("upload_users", person.user, checked === true)
                    }
                  />
                  <span className="text-sm font-medium">{person.user_name}</span>
                </label>
              ))}
              {!people.isLoading && !people.data?.results.length && (
                <p className="text-sm text-muted-foreground">{t("categories.noUsers")}</p>
              )}
            </div>
          </FieldWrapper>
          <div className="border-t pt-4 sm:col-span-2">
            <h4 className="text-sm font-semibold">{t("categories.editPermissionTitle")}</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("categories.editPermissionHelp")}
            </p>
          </div>
          <FieldWrapper label={t("categories.editRoles")}>
            <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border p-3">
              {(roles.data?.results ?? []).map((role) => (
                <label key={role.id} className="flex min-h-10 items-center gap-3">
                  <Checkbox
                    checked={form.edit_roles?.includes(role.id)}
                    onCheckedChange={(checked) =>
                      toggle("edit_roles", role.id, checked === true)
                    }
                  />
                  <span className="text-sm font-medium">{role.name}</span>
                </label>
              ))}
              {!roles.isLoading && !roles.data?.results.length && (
                <p className="text-sm text-muted-foreground">{t("categories.noRoles")}</p>
              )}
            </div>
          </FieldWrapper>
          <FieldWrapper label={t("categories.editUsers")}>
            <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border p-3">
              {(people.data?.results ?? []).map((person) => (
                <label key={person.user} className="flex min-h-10 items-center gap-3">
                  <Checkbox
                    checked={form.edit_users?.includes(person.user)}
                    onCheckedChange={(checked) =>
                      toggle("edit_users", person.user, checked === true)
                    }
                  />
                  <span className="text-sm font-medium">{person.user_name}</span>
                </label>
              ))}
              {!people.isLoading && !people.data?.results.length && (
                <p className="text-sm text-muted-foreground">{t("categories.noUsers")}</p>
              )}
            </div>
          </FieldWrapper>
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
            disabled={save.isPending}
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
  const review = (row: FieldTask, status: FieldTask["status"]) => {
    const note =
      status === "RETURNED"
        ? (window.prompt(t("tasks.returnPrompt")) ?? "")
        : "";
    if (status === "RETURNED" && !note.trim()) return;
    transition.mutate({ id: row.id, status, note });
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
  });
  const team = useQuery({
    queryKey: ["project-assignments", form.project],
    queryFn: () => getProjectAssignments(form.project),
    enabled: Boolean(form.project),
  });
  const categories = useQuery({
    queryKey: ["project-categories", form.project, "task-options", form.task_type],
    queryFn: () =>
      getProjectCategories({
        project: form.project,
        page_size: 200,
        kind: ({ PHOTO: "FIELD", MATERIAL: "MATERIAL", EQUIPMENT: "EQUIPMENT", PROGRESS: "PROGRESS", SAFETY: "EHS", WASTE: "CONSTRUCTION_WASTE", CONSULTANT: "FIELD", OTHER: "FIELD" } as const)[form.task_type] ?? "FIELD",
        is_active: true,
      }),
    enabled: Boolean(form.project),
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
          </FieldWrapper>
          <FieldWrapper label={t("field.taskType")} required>
            <Select
              value={form.task_type}
              onValueChange={(v) => {
                set("task_type", v as FieldTaskPayload["task_type"]);
                set("category", null);
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
          </FieldWrapper>
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
              [form.category, t("field.category")],
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

export function SiteEquipmentWorkspace({ initialProject = "", fieldTaskId, onRecordSaved }: { initialProject?: string; fieldTaskId?: string; onRecordSaved?: () => void } = {}) {
  const t = useTranslations("contractorOps");
  const { can } = useAuth();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const expiringOnly = searchParams.get("expiring") === "1";
  const [project, setProject] = useState(initialProject);
  const [movementSearch, setMovementSearch] = useState("");
  const [movementEquipment, setMovementEquipment] = useState("");
  const [movementSupplier, setMovementSupplier] = useState("");
  const [deliveryNoteNo, setDeliveryNoteNo] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [creating, setCreating] = useState(searchParams.get("create") === "1");
  const [moving, setMoving] = useState<SiteEquipment | null>(null);
  const [editingEquipment, setEditingEquipment] = useState<SiteEquipment | null>(null);
  const rows = useQuery({
    queryKey: ["site-equipment", project, expiringOnly],
    queryFn: () =>
      getSiteEquipment({
        project: project || undefined,
        expiring: expiringOnly ? "1" : undefined,
        page_size: 200,
      }),
  });
  const suppliers = useQuery({
    queryKey: ["equipment-suppliers"],
    queryFn: () => getSuppliers({ page_size: 200, is_active: true }),
  });
  const movementQuery = {
    project: project || undefined,
    search: movementSearch.trim() || undefined,
    equipment: movementEquipment || undefined,
    supplier: movementSupplier || undefined,
    delivery_note_no: deliveryNoteNo.trim() || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    page_size: 20,
  };
  const movements = useQuery({
    queryKey: ["equipment-movements", movementQuery],
    queryFn: () => getEquipmentMovements(movementQuery),
  });
  const summary = useQuery({
    queryKey: ["equipment-summary", project],
    queryFn: () => getEquipmentSummary(project || undefined),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["site-equipment"] });
    void qc.invalidateQueries({ queryKey: ["equipment-movements"] });
    void qc.invalidateQueries({ queryKey: ["equipment-summary"] });
  };
  const equipmentError =
    rows.error instanceof Error ? rows.error.message : undefined;
  const movementError =
    movements.error instanceof Error ? movements.error.message : undefined;
  const clearMovementFilters = () => {
    setMovementSearch("");
    setMovementEquipment("");
    setMovementSupplier("");
    setDeliveryNoteNo("");
    setDateFrom("");
    setDateTo("");
  };
  const runExport = (format: "xlsx" | "pdf") =>
    exportEquipmentMovements({
      format,
      title: t("equipment.title"),
      subtitle: t("equipment.recentMovements"),
      emptyLabel: t("state.empty"),
      query: movementQuery,
      columns: [
        { key: "occurred_at", label: t("equipment.occurredAt") },
        { key: "project_name", label: t("field.project") },
        { key: "equipment_code", label: t("field.code") },
        { key: "equipment_name", label: t("field.name") },
        {
          key: "direction",
          label: t("equipment.directionLabel"),
          values: {
            ENTRY: t("direction.ENTRY"),
            EXIT: t("direction.EXIT"),
          },
        },
        { key: "quantity", label: t("field.quantity") },
        { key: "unit", label: t("field.unit") },
        { key: "supplier_name", label: t("field.supplier") },
        { key: "delivery_note_no", label: t("field.deliveryNote") },
        { key: "vehicle_plate", label: t("field.vehiclePlate") },
        { key: "operator_name", label: t("field.operator") },
      ],
    });
  return (
    <div className="space-y-5">
      <ListHeader
        title={t("equipment.title")}
        subtitle={t("equipment.subtitle")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {can("report.export") && (
              <ExportButton
                onExport={runExport}
                disabled={!movements.data?.count}
              />
            )}
            {can("equipment.manage") && (
              <Button
                requires={[[project, t("field.project")]]}
                onClick={() => setCreating(true)}
              >
                <Plus />
                {t("equipment.add")}
              </Button>
            )}
          </div>
        }
      />
      <ProjectFilter value={project} onChange={setProject} />
      {summary.data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {(
            [
              "today",
              "month",
              "year",
              "project_total",
              "quantity_on_site",
            ] as const
          ).map((key) => (
            <div key={key} className="rounded-lg border bg-card p-3 shadow-sm">
              <p className="text-xs text-muted-foreground">
                {t(`equipment.summary.${key}`)}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {summary.data[key]}
              </p>
            </div>
          ))}
        </div>
      )}
      <WorkspaceState
        loading={rows.isLoading}
        error={rows.isError}
        errorMessage={equipmentError}
        empty={!rows.data?.count}
      />
      {!!rows.data?.count && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.data.results.map((row) => (
            <article
              key={row.id}
              className="rounded-lg border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <HardHat className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {row.code}
                  </p>
                  <h3 className="truncate font-semibold">{row.name}</h3>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {row.registration_no ||
                      row.serial_no ||
                      t("state.noIdentifier")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("field.quantity")}: {row.quantity_on_site}
                  </p>
                  {/* The column it files under, shown where it was filed
                      (T-242). A classification nobody can see on the record
                      is a field somebody fills once and never trusts. */}
                  {row.category_name && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {t("field.equipmentColumn")}: {row.category_name}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <StatusBadge
                    label={t(`equipmentStatus.${row.status}`)}
                    tone={tone(row.status)}
                  />
                  {can("equipment.manage") && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title={t("action.edit")}
                      onClick={() => setEditingEquipment(row)}
                    >
                      <Pencil />
                    </Button>
                  )}
                </div>
              </div>
              {can("equipment.capture") && (
                <Button
                  className="mt-4 w-full"
                  variant="outline"
                  onClick={() => setMoving(row)}
                >
                  <Camera />
                  {t(
                    row.status === "ON_SITE"
                      ? "equipment.recordExit"
                      : "equipment.recordEntry",
                  )}
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {t("equipment.recentMovements")}
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={clearMovementFilters}>
            <RotateCcw />
            {t("equipmentFilter.clear")}
          </Button>
        </div>
        <div className="grid gap-3 rounded-lg border bg-card p-3 shadow-sm sm:grid-cols-2 xl:grid-cols-3">
          <FieldWrapper label={t("equipmentFilter.search")}>
            <Input
              value={movementSearch}
              onChange={(event) => setMovementSearch(event.target.value)}
              placeholder={t("equipmentFilter.searchPlaceholder")}
            />
          </FieldWrapper>
          <FieldWrapper label={t("equipmentFilter.equipment")}>
            <Select
              value={movementEquipment || "all"}
              onValueChange={(value) => setMovementEquipment(value === "all" ? "" : value)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("equipmentFilter.allEquipment")}</SelectItem>
                {(rows.data?.results ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>{row.code} - {row.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.supplier")}>
            <Select
              value={movementSupplier || "all"}
              onValueChange={(value) => setMovementSupplier(value === "all" ? "" : value)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("equipmentFilter.allSuppliers")}</SelectItem>
                {(suppliers.data?.results ?? []).map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("equipmentFilter.deliveryNoteNo")}>
            <Input value={deliveryNoteNo} onChange={(event) => setDeliveryNoteNo(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("equipmentFilter.dateFrom")}>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("equipmentFilter.dateTo")}>
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </FieldWrapper>
        </div>
        <WorkspaceState
          loading={movements.isLoading}
          error={movements.isError}
          errorMessage={movementError}
          empty={!movements.data?.count}
        />
        {!movements.isError &&
          (movements.data?.results ?? []).map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm"
            >
              <StatusBadge
                label={t(`direction.${row.direction}`)}
                tone={row.direction === "ENTRY" ? "positive" : "neutral"}
              />
              <strong>
                {row.equipment_code} - {row.equipment_name}
              </strong>
              <span className="text-muted-foreground">
                {row.quantity} {row.unit} · {row.operator_name}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(row.occurred_at).toLocaleString()}
              </span>
            </div>
          ))}
      </section>
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
      {editingEquipment && (
        <EquipmentDialog
          project={editingEquipment.project}
          equipment={editingEquipment}
          onClose={() => setEditingEquipment(null)}
          onSaved={() => {
            refresh();
            setEditingEquipment(null);
          }}
        />
      )}
      {moving && (
        <MovementDialog
          row={moving}
          fieldTaskId={fieldTaskId}
          onClose={() => setMoving(null)}
          onSaved={() => {
            refresh();
            setMoving(null);
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
function EquipmentDialog({
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
            {!columns.isLoading && !hasColumns && (
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

function MovementDialog({
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
              <FieldEvidenceGrid
                labels={equipmentEvidenceLabels}
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
  const [addingRecord, setAddingRecord] = useState(
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
  const review = useMutation({
    mutationFn: ({
      id,
      status,
      note,
    }: {
      id: string;
      status: "CONFIRMED" | "RETURNED";
      note?: string;
    }) => reviewSiteProgressRecord(id, status, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["site-progress"] }),
  });
  const reviewRow = (
    row: SiteProgressRecord,
    status: "CONFIRMED" | "RETURNED",
  ) => {
    const note =
      status === "RETURNED"
        ? (window.prompt(t("progress.returnPrompt")) ?? "")
        : "";
    if (status === "RETURNED" && !note.trim()) return;
    review.mutate({ id: row.id, status, note });
  };
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
      {summary.data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(["today", "month", "year", "total"] as const).map((key) => (
            <div key={key} className="rounded-lg border bg-card p-3 shadow-sm">
              <p className="text-xs text-muted-foreground">
                {t(`progress.summary.${key}`)}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {summary.data[key]}
              </p>
            </div>
          ))}
        </div>
      )}
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
                {can("progress.confirm") && row.status === "SUBMITTED" && (
                  <div className="mt-4 flex justify-end gap-2 border-t pt-3">
                    <Button
                      variant="outline"
                      onClick={() => reviewRow(row, "RETURNED")}
                    >
                      <RotateCcw />
                      {t("action.return")}
                    </Button>
                    <Button onClick={() => reviewRow(row, "CONFIRMED")}>
                      <Check />
                      {t("action.confirm")}
                    </Button>
                  </div>
                )}
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

function PhaseDialog({
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
  const save = useMutation({
    mutationFn: () =>
      phase
        ? updateConstructionPhase(phase.id, {
            code,
            name,
            description,
            is_active: isActive,
          })
        : createConstructionPhase({ project, code, name, description }),
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

function ProgressDialog({
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
            !!project && !phases.isLoading && !options.length
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
  const { can } = useAuth();
  const qc = useQueryClient();
  const [project, setProject] = useState(initialProject);
  const [creating, setCreating] = useState(Boolean(fieldTaskId));
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
  const reviewRow = (
    row: MaterialOutgoing,
    status: MaterialOutgoing["status"],
  ) => {
    const note =
      status === "REJECTED"
        ? (window.prompt(t("outgoing.rejectPrompt")) ?? "")
        : "";
    if (status === "REJECTED" && !note.trim()) return;
    review.mutate({ id: row.id, status, note });
  };
  return (
    <div className="space-y-5">
      <ListHeader
        title={t("outgoing.title")}
        subtitle={t("outgoing.subtitle")}
        action={
          can("material_outgoing.submit") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              {t("outgoing.add")}
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
              {can("material_outgoing.approve") && row.status === "PENDING" && (
                <div className="mt-4 flex justify-end gap-2 border-t pt-3">
                  <Button
                    variant="outline"
                    onClick={() => reviewRow(row, "REJECTED")}
                  >
                    <RotateCcw />
                    {t("action.reject")}
                  </Button>
                  <Button onClick={() => reviewRow(row, "APPROVED")}>
                    <Check />
                    {t("action.approve")}
                  </Button>
                </div>
              )}
              {can("material_outgoing.approve") &&
                row.status === "APPROVED" && (
                  <Button
                    className="mt-4 w-full"
                    onClick={() => reviewRow(row, "RELEASED")}
                  >
                    <Check />
                    {t("action.release")}
                  </Button>
                )}
            </article>
          ))}
        </div>
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

function OutgoingDialog({
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
