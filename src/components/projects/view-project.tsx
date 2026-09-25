"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  BadgeCheck,
  CalendarDays,
  Camera,
  ClipboardCheck,
  Construction,
  FileText,
  Loader2,
  Package,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Truck,
  UserCog,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { ProjectDockets } from "@/components/projects/project-dockets";
import { ProjectQrPanel } from "@/components/projects/project-qr-panel";
import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  FormSection,
  FormSkeleton,
  LoadErrorCard,
} from "@/components/shared/form-shell";
import {
  DetailHeader,
  FieldWrapper,
  LoadFailed,
  QueryFailedNote,
  ReadField,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { PROJECT_STATUS_TONE } from "@/components/projects/projects";
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
import type {
  ProjectAssignment,
  ProjectStatisticsPeriod,
} from "@/interfaces/contractor";
import type { ProjectResponsibility } from "@/interfaces/contractor-ops";
import {
  archiveProject,
  assignUserToProject,
  getAssignableProjectUsers,
  getProject,
  getProjectAssignments,
  getProjectStatistics,
  unassignUserFromProject,
} from "@/services/contractor.service";
import {
  createProjectResponsibility,
  deleteProjectResponsibility,
  getProjectResponsibilities,
  updateProjectResponsibility,
} from "@/services/contractor-ops.service";
import { useDateFormat } from "@/lib/dates";

export function ViewProject({ id }: { id: string }) {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [archiving, setArchiving] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["projects", "detail", id],
    queryFn: () => getProject(id),
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveProject(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "detail", id] });
      setArchiving(false);
    },
  });

  if (isLoading) return <FormSkeleton sections={4} />;
  if (isError || !data) {
    return <LoadErrorCard backHref="/projects" backLabel={t("projects.title")} />;
  }

  return (
    <div className="space-y-4">
      <DetailHeader
        backHref="/projects"
        backLabel={t("projects.title")}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {can("project.assign") && (
              <Button asChild size="sm" variant="outline" className="rounded-full px-4">
                <a href="#project-team">
                  <UserPlus className="h-4 w-4" />
                  {t("projects.team.add")}
                </a>
              </Button>
            )}
            {can("project.update") && (
              <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
                <Link href={`/projects/${data.id}/edit`}>
                  <Pencil className="h-4 w-4" />
                  {t("common.edit")}
                </Link>
              </Button>
            )}
            {can("project.update") && data.status === "COMPLETED" && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full px-4"
                onClick={() => setArchiving(true)}
              >
                <Archive className="h-4 w-4" />
                {t("projects.archive.action")}
              </Button>
            )}
          </div>
        }
      />

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <h2 className="text-base font-semibold text-foreground">{data.name}</h2>
          <StatusBadge
            label={t(`projects.status.${data.status}`)}
            tone={PROJECT_STATUS_TONE[data.status]}
          />
          <span className="tabular ml-auto text-sm text-muted-foreground">
            {data.code}
          </span>
        </div>

        <div className="divide-y border-t">
          <FormSection title={t("projects.section.identity")}>
            <ReadField
              label={t("projects.field.clientName")}
              value={data.client_name}
            />
            <ReadField
              label={t("projects.field.mainContractor")}
              value={data.main_contractor}
            />
            <ReadField
              label={t("projects.field.consultant")}
              value={data.consultant}
            />
            <ReadField
              label={t("projects.field.createdAt")}
              value={df.date(data.created_at)}
            />
            <ReadField
              label={t("projects.field.description")}
              value={data.description}
              className="md:col-span-2"
            />
          </FormSection>

          <FormSection title={t("projects.section.address")}>
            <ReadField
              label={t("projects.field.addressLine1")}
              value={data.address_line_1}
              className="md:col-span-2"
            />
            <ReadField
              label={t("projects.field.addressLine2")}
              value={data.address_line_2}
              className="md:col-span-2"
            />
            <ReadField label={t("projects.field.city")} value={data.city} />
            <ReadField label={t("projects.field.state")} value={data.state} />
            <ReadField
              label={t("projects.field.postcode")}
              value={data.postcode}
            />
          </FormSection>

          <FormSection title={t("projects.section.location")}>
            <ReadField
              label={t("projects.field.latitude")}
              value={data.latitude}
            />
            <ReadField
              label={t("projects.field.longitude")}
              value={data.longitude}
            />
            <ReadField
              label={t("projects.field.geofenceRadius")}
              value={
                data.geofence_radius_m
                  ? t("projects.geofenceRadiusValue", {
                      count: data.geofence_radius_m,
                    })
                  : null
              }
              className="md:col-span-2"
            />
          </FormSection>

          <FormSection title={t("projects.section.schedule")}>
            <ReadField
              label={t("projects.field.startDate")}
              value={
                data.start_date
                  ? df.date(data.start_date)
                  : null
              }
            />
            <ReadField
              label={t("projects.field.endDate")}
              value={
                data.end_date
                  ? df.date(data.end_date)
                  : null
              }
            />
          </FormSection>

          <FormSection title={t("projects.section.contact")}>
            <ReadField
              label={t("projects.field.siteManager")}
              value={data.site_manager}
            />
            <ReadField
              label={t("projects.field.sitePhone")}
              value={data.site_phone}
            />
          </FormSection>
        </div>
      </div>

      <ProjectStatistics projectId={id} />

      {can("project.update") && (
        <ProjectQrPanel
          projectId={id}
          projectName={data.name}
          archived={data.status === "ARCHIVED"}
        />
      )}
      <ProjectTeam projectId={id} />
      <ProjectResponsibilities projectId={id} />
      <ProjectDockets projectId={id} />

      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title={t("projects.archive.title", { name: data.name })}
        description={t("projects.archive.description")}
        confirmLabel={t("projects.archive.confirm")}
        confirmIcon={Archive}
        isPending={archiveMutation.isPending}
        onConfirm={() => archiveMutation.mutate()}
      />
    </div>
  );
}

const PROJECT_STATISTIC_PERIODS: ProjectStatisticsPeriod[] = [
  "day",
  "month",
  "year",
  "all",
];

function ProjectStatistics({ projectId }: { projectId: string }) {
  const t = useTranslations("projects.statistics");
  const [period, setPeriod] = useState<ProjectStatisticsPeriod>("month");
  const statistics = useQuery({
    queryKey: ["projects", "statistics", projectId, period],
    queryFn: () => getProjectStatistics(projectId, period),
  });
  const rows = statistics.data
    ? [
        ["material_receipts", statistics.data.totals.material_receipts, Package, "/receipts"],
        ["equipment_movements", statistics.data.totals.equipment_movements, Construction, "/site-equipment"],
        ["progress_records", statistics.data.totals.progress_records, ClipboardCheck, "/progress"],
        ["safety_incidents", statistics.data.totals.safety_incidents, ShieldAlert, "/safety"],
        ["attendance_events", statistics.data.totals.attendance_events, CalendarDays, "/attendance"],
        ["waste_dispatches", statistics.data.totals.waste_dispatches, Truck, "/dispatches"],
        ["consultant_applications", statistics.data.totals.consultant_applications, BadgeCheck, "/consultant-applications"],
        ["field_tasks", statistics.data.totals.field_tasks, UserCog, "/field-tasks"],
        ["photos", statistics.data.totals.photos, Camera, "/evidence"],
        ["documents", statistics.data.totals.documents, FileText, "/documents"],
      ] as const
    : [];

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-5">
        <div>
          <h3 className="text-base font-semibold">{t("title")}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex rounded-lg border bg-muted/30 p-1">
          {PROJECT_STATISTIC_PERIODS.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={period === value ? "default" : "ghost"}
              className="h-7 px-3"
              onClick={() => setPeriod(value)}
            >
              {t(`period.${value}`)}
            </Button>
          ))}
        </div>
      </div>
      {statistics.isLoading ? (
        <p className="border-t px-6 py-8 text-center text-sm text-muted-foreground">
          {t("loading")}
        </p>
      ) : statistics.isError ? (
        <p className="border-t px-6 py-8 text-center text-sm text-destructive">
          {t("loadError")}
        </p>
      ) : (
        <div className="grid border-t sm:grid-cols-2 lg:grid-cols-5">
          {rows.map(([key, value, Icon, href]) => (
            <Link
              key={key}
              href={`${href}?project=${projectId}`}
              className="flex min-h-24 items-center gap-3 border-b px-5 py-4 transition-colors hover:bg-muted/40 sm:border-r"
            >
              <Icon className="size-5 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">{t(`metric.${key}`)}</span>
                <span className="mt-1 block text-xl font-semibold tabular-nums">{value}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

const RESPONSIBILITY_OPTIONS = [
  "PROJECT_MANAGER",
  "SITE_ENGINEER",
  "SAFETY_OFFICER",
  "QS",
  "QA_QC",
  "DOCUMENT_CONTROLLER",
  "ADMIN",
  "SUPERVISOR",
] as const;

function ProjectResponsibilities({ projectId }: { projectId: string }) {
  const t = useTranslations();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ProjectResponsibility | "new" | null>(null);
  const [removing, setRemoving] = useState<ProjectResponsibility | null>(null);
  const responsibilities = useQuery({
    queryKey: ["project-responsibilities", projectId],
    queryFn: () => getProjectResponsibilities({ project: projectId, page_size: 100 }),
  });
  const removal = useMutation({
    mutationFn: (id: string) => deleteProjectResponsibility(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["project-responsibilities", projectId],
      });
      setRemoving(null);
    },
  });
  const rows = responsibilities.data?.results ?? [];
  const roleLabel = (value: string) =>
    RESPONSIBILITY_OPTIONS.includes(value as (typeof RESPONSIBILITY_OPTIONS)[number])
      ? t(`projects.responsibilities.role.${value}`)
      : value;

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">
            {t("projects.responsibilities.title")}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("projects.responsibilities.description")}
          </p>
        </div>
        {can("project.assign") && (
          <Button
            size="sm"
            className="rounded-full px-4 shadow-sm"
            onClick={() => setEditing("new")}
          >
            <UserCog className="h-4 w-4" />
            {t("projects.responsibilities.add")}
          </Button>
        )}
      </div>
      <div className="divide-y border-t">
        {responsibilities.isLoading ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            {t("common.loading")}
          </p>
        ) : responsibilities.isError ? (
          <p className="px-6 py-8 text-center text-sm text-destructive">
            {t("projects.responsibilities.loadError")}
          </p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            {t("projects.responsibilities.empty")}
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-3 px-6 py-4"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <UserCog className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{row.user_name}</p>
                  {row.is_primary && (
                    <StatusBadge
                      label={t("projects.responsibilities.primary")}
                      tone="positive"
                    />
                  )}
                  {!row.is_active && (
                    <StatusBadge
                      label={t("projects.responsibilities.inactive")}
                      tone="neutral"
                    />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {roleLabel(row.responsibility)}
                  {row.user_phone ? ` · ${row.user_phone}` : ""}
                </p>
                {row.can_confirm_progress && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-primary">
                    <ShieldCheck className="size-3.5" />
                    {t("projects.responsibilities.canConfirmProgress")}
                  </p>
                )}
              </div>
              {can("project.assign") && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title={t("common.edit")}
                    onClick={() => setEditing(row)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10"
                    title={t("common.remove")}
                    onClick={() => setRemoving(row)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {editing && (
        <ResponsibilityDialog
          projectId={projectId}
          row={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={() => setRemoving(null)}
          title={t("projects.responsibilities.removeTitle", {
            name: removing.user_name,
          })}
          description={t("projects.responsibilities.removeDescription")}
          confirmLabel={t("common.remove")}
          confirmIcon={Trash2}
          isPending={removal.isPending}
          onConfirm={() => removal.mutate(removing.id)}
        />
      )}
    </section>
  );
}

function ResponsibilityDialog({
  projectId,
  row,
  onClose,
}: {
  projectId: string;
  row?: ProjectResponsibility;
  onClose: () => void;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const assignments = useQuery({
    queryKey: ["projects", "assignments", projectId],
    queryFn: () => getProjectAssignments(projectId),
  });
  const isKnownRole = row
    ? RESPONSIBILITY_OPTIONS.includes(
        row.responsibility as (typeof RESPONSIBILITY_OPTIONS)[number],
      )
    : true;
  const [user, setUser] = useState(row?.user ?? "");
  const [role, setRole] = useState(row ? (isKnownRole ? row.responsibility : "OTHER") : "PROJECT_MANAGER");
  const [customRole, setCustomRole] = useState(row && !isKnownRole ? row.responsibility : "");
  const [primary, setPrimary] = useState(row?.is_primary ?? false);
  const [canConfirmProgress, setCanConfirmProgress] = useState(
    row?.can_confirm_progress ?? false,
  );
  const [active, setActive] = useState(row?.is_active ?? true);
  const responsibility = role === "OTHER" ? customRole.trim() : role;
  const save = useMutation({
    mutationFn: () =>
      row
        ? updateProjectResponsibility(row.id, {
            responsibility,
            is_primary: primary,
            can_confirm_progress: canConfirmProgress,
            is_active: active,
          })
        : createProjectResponsibility({
            project: projectId,
            user,
            responsibility,
            is_primary: primary,
            can_confirm_progress: canConfirmProgress,
            is_active: active,
          }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["project-responsibilities", projectId],
      });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(
              row
                ? "projects.responsibilities.editTitle"
                : "projects.responsibilities.addTitle",
            )}
          </DialogTitle>
          <DialogDescription>
            {t("projects.responsibilities.formHelp")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FieldWrapper label={t("projects.responsibilities.person")} required>
            <Select value={user || undefined} onValueChange={setUser} disabled={Boolean(row)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("common.selectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(assignments.data?.results ?? []).map((assignment) => (
                  <SelectItem key={assignment.user} value={assignment.user}>
                    {assignment.user_name} - {assignment.user_email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <QueryFailedNote query={assignments} what={t("projects.team.whatMembers")} />
          </FieldWrapper>
          <FieldWrapper label={t("projects.responsibilities.responsibility")} required>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESPONSIBILITY_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`projects.responsibilities.role.${option}`)}
                  </SelectItem>
                ))}
                <SelectItem value="OTHER">
                  {t("projects.responsibilities.role.OTHER")}
                </SelectItem>
              </SelectContent>
            </Select>
          </FieldWrapper>
          {role === "OTHER" && (
            <FieldWrapper label={t("projects.responsibilities.customRole")} required>
              <Input value={customRole} onChange={(event) => setCustomRole(event.target.value)} />
            </FieldWrapper>
          )}
          <label className="flex min-h-12 items-center gap-3 rounded-lg border p-3">
            <Checkbox checked={primary} onCheckedChange={(checked) => setPrimary(checked === true)} />
            <span>
              <span className="flex items-center gap-2 font-medium"><BadgeCheck className="size-4 text-primary" />{t("projects.responsibilities.primary")}</span>
              <span className="block text-xs text-muted-foreground">{t("projects.responsibilities.primaryHelp")}</span>
            </span>
          </label>
          <label className="flex min-h-12 items-center gap-3 rounded-lg border p-3">
            <Checkbox checked={canConfirmProgress} onCheckedChange={(checked) => setCanConfirmProgress(checked === true)} />
            <span>
              <span className="flex items-center gap-2 font-medium"><ShieldCheck className="size-4 text-primary" />{t("projects.responsibilities.canConfirmProgress")}</span>
              <span className="block text-xs text-muted-foreground">{t("projects.responsibilities.progressHelp")}</span>
            </span>
          </label>
          {row && (
            <label className="flex min-h-12 items-center gap-3 rounded-lg border p-3">
              <Checkbox checked={active} onCheckedChange={(checked) => setActive(checked === true)} />
              <span className="font-medium">{t("projects.responsibilities.active")}</span>
            </label>
          )}
          {save.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t("projects.responsibilities.saveError")}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            requires={[[user, t("projects.responsibilities.person")], [responsibility, t("projects.responsibilities.responsibility")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <UserCog />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Who can see this project.
 *
 * The second isolation axis made visible. Assignment is not a convenience: a
 * site clerk without one sees nothing of this project at all, so the list of
 * names here is the list of people who can record a delivery on this site.
 */
function ProjectTeam({ projectId }: { projectId: string }) {
  const t = useTranslations();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ProjectAssignment | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["projects", "assignments", projectId],
    queryFn: () => getProjectAssignments(projectId),
  });

  const removal = useMutation({
    mutationFn: (userId: string) => unassignUserFromProject(projectId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["projects", "assignments", projectId],
      });
      setRemoving(null);
    },
  });

  const rows = data?.results ?? [];

  return (
    <div id="project-team" className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">
            {t("projects.team.title")}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("projects.team.description")}
          </p>
        </div>
        {can("project.assign") && (
          <Button
            size="sm"
            className="shrink-0 rounded-full px-4 shadow-sm"
            onClick={() => setAdding(true)}
          >
            <UserPlus className="h-4 w-4" />
            {t("projects.team.add")}
          </Button>
        )}
      </div>

      <div className="divide-y border-t">
        {isLoading ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            {t("common.loading")}
          </p>
        ) : isError ? (
          <LoadFailed className="m-4" what={t("projects.team.whatMembers")} onRetry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            {t("projects.team.empty")}
          </p>
        ) : (
          rows.map((assignment) => (
            <div
              key={assignment.id}
              className="flex items-center justify-between gap-4 px-6 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {assignment.user_name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {assignment.user_email}
                </p>
              </div>
              {can("project.assign") && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  title={t("projects.team.remove")}
                  onClick={() => setRemoving(assignment)}
                >
                  <UserMinus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      {adding && (
        <AssignUserDialog
          projectId={projectId}
          assignedIds={rows.map((row) => row.user)}
          onClose={() => setAdding(false)}
        />
      )}

      {removing && (
        <ConfirmDialog
          open
          onOpenChange={() => setRemoving(null)}
          title={t("projects.team.removeTitle", { name: removing.user_name })}
          description={t("projects.team.removeDescription")}
          confirmLabel={t("projects.team.removeConfirm")}
          confirmIcon={UserMinus}
          isPending={removal.isPending}
          onConfirm={() => removal.mutate(removing.user)}
        />
      )}
    </div>
  );
}

function AssignUserDialog({
  projectId,
  assignedIds,
  onClose,
}: {
  projectId: string;
  assignedIds: string[];
  onClose: () => void;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState("");

  const { data, isError } = useQuery({
    queryKey: ["users", "assignable", projectId],
    queryFn: () => getAssignableProjectUsers(projectId),
  });

  const assignment = useMutation({
    mutationFn: (userId: string) => assignUserToProject(projectId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["projects", "assignments", projectId],
      });
      onClose();
    },
  });

  const options = (data?.results ?? []).filter(
    (user) => !assignedIds.includes(user.id),
  );

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[440px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("projects.team.add")}</DialogTitle>
          <DialogDescription>
            {t("projects.team.description")}
          </DialogDescription>
        </DialogHeader>

        <FieldWrapper label={t("projects.team.person")} required>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-full bg-card">
              <SelectValue placeholder={t("common.selectPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {isError ? (
                <div className="px-2 py-3 text-center text-sm text-destructive">
                  {t("projects.team.loadError")}
                </div>
              ) : options.length === 0 ? (
                <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                  {t("common.noOptions")}
                </div>
              ) : (
                options.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.full_name} ({user.role_name ?? "-"}) — {user.email}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </FieldWrapper>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            className="rounded-full px-4 shadow-sm"
            requires={[[selected, t("projects.team.person")]]}
            disabled={assignment.isPending}
            onClick={() => assignment.mutate(selected)}
          >
            <Plus className="h-4 w-4" />
            {t("projects.team.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
