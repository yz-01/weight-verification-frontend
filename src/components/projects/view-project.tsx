"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, UserMinus, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { ProjectDockets } from "@/components/projects/project-dockets";
import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  FormSection,
  FormSkeleton,
  LoadErrorCard,
} from "@/components/shared/form-shell";
import {
  DetailHeader,
  ReadField,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { PROJECT_STATUS_TONE } from "@/components/projects/projects";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectAssignment } from "@/interfaces/contractor";
import {
  assignUserToProject,
  getAssignableProjectUsers,
  getProject,
  getProjectAssignments,
  unassignUserFromProject,
} from "@/services/contractor.service";
import { useDateFormat } from "@/lib/dates";

export function ViewProject({ id }: { id: string }) {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["projects", "detail", id],
    queryFn: () => getProject(id),
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
          can("project.update") ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href={`/projects/${data.id}/edit`}>
                <Pencil className="h-4 w-4" />
                {t("common.edit")}
              </Link>
            </Button>
          ) : undefined
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

      <ProjectTeam projectId={id} />
      <ProjectDockets projectId={id} />
    </div>
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

  const { data, isLoading } = useQuery({
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
    <div className="rounded-xl border bg-card shadow-sm">
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
      <DialogContent className="sm:max-w-[440px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{t("projects.team.add")}</DialogTitle>
          <DialogDescription>
            {t("projects.team.description")}
          </DialogDescription>
        </DialogHeader>

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
                  {user.full_name} — {user.email}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

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
            disabled={selected === "" || assignment.isPending}
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
