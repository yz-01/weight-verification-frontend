"use client";

/**
 * 现场人员管理 (JB114, 客户 11-06 第二轮事项 4).
 *
 * 「项目经理后台需要增加「现场人员管理」，与总部的用户管理分开。这个功能只负责生成、
 * 查看及管理现场人员手机登录链接，包括工地人员、设备操作人员和门岗保安。项目经理只能
 * 管理自己负责项目的现场人员，不能查看或管理其他项目人员。不需要开放总部后台账号管理、
 * 角色权限及公司设置功能。」
 *
 * The list, 生成现场人员链接, 链接 / 二维码 (the same dialog head office uses, which
 * also re-issues and unbinds a phone) and 删除. The server keeps every call to
 * the reader's own projects; head office, who may also open it, sees them all.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Smartphone, Trash2, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldAccessManagementDialog } from "@/components/field-staff/field-access-management";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  EmptyState,
  FieldWrapper,
  FilterBar,
  ListHeader,
  LoadFailed,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { roleLabel } from "@/lib/role-labels";
import { getProjects } from "@/services/contractor.service";
import { getFieldStaff, removeFieldStaff, type FieldStaffRow } from "@/services/field-access.service";

export function FieldStaffManagementPage() {
  const t = useTranslations("fieldStaffManagement");
  const tAll = useTranslations();
  const queryClient = useQueryClient();
  const [project, setProject] = useState("");
  const [search, setSearch] = useState("");
  const [dialogFor, setDialogFor] = useState<FieldStaffRow | "new" | null>(null);
  const [removing, setRemoving] = useState<FieldStaffRow | null>(null);

  const projects = useQuery({
    queryKey: ["projects", "field-staff-management"],
    queryFn: () => getProjects({ page_size: 500, sort_by: "name", sort_order: "asc" }),
  });
  const staff = useQuery({
    queryKey: ["field-access", "staff", project, search.trim()],
    queryFn: () => getFieldStaff({ project: project || undefined, search: search.trim() || undefined }),
  });
  const removal = useMutation({
    mutationFn: (person: FieldStaffRow) => removeFieldStaff(person.id),
    onSuccess: () => {
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ["field-access", "staff"] });
    },
  });

  const rows = staff.data?.results ?? [];

  return (
    <div className="flex flex-col gap-4">
      <ListHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <Button onClick={() => setDialogFor("new")} data-testid="field-staff-new">
            <UserPlus />
            {t("new")}
          </Button>
        }
      />

      <div className="rounded-lg border border-panel-border bg-muted/40 p-3 text-sm" data-testid="field-staff-help">
        <p className="font-semibold">{t("howTitle")}</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted-foreground">
          <li>{t("how1")}</li>
          <li>{t("how2")}</li>
          <li>{t("how3")}</li>
        </ol>
      </div>

      <FilterBar>
        <FieldWrapper label={t("project")}>
          <ProjectPicker
            value={project}
            onValueChange={setProject}
            placeholder={t("project")}
            allowAll
            allLabel={t("allProjects")}
            projects={projects.data?.results}
            projectsLoading={projects.isLoading}
            projectsError={projects.isError}
            className="w-full sm:w-70"
          />
        </FieldWrapper>
        <FieldWrapper label={t("search")}>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full sm:w-64"
          />
        </FieldWrapper>
      </FilterBar>

      {staff.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : staff.isError ? (
        <LoadFailed onRetry={() => void staff.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Smartphone}
          title={t("emptyTitle")}
          description={t("emptyHelp")}
          action={
            <Button variant="outline" onClick={() => setDialogFor("new")}>
              <UserPlus />
              {t("new")}
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" data-testid="field-staff-list">
          {rows.map((person) => (
            <li key={person.id} className="surface-panel flex flex-col gap-3 rounded-xl p-4" data-testid="field-staff-row">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{person.full_name}</p>
                  <p className="text-sm text-muted-foreground tabular">{person.phone || "—"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <TypeBadge label={roleLabel(person.role_code, person.role_name, tAll)} />
                  <StatusBadge
                    label={person.status === "ACTIVE" ? (person.last_login_at ? t("signedIn") : t("notYet")) : t("off")}
                    tone={person.status === "ACTIVE" ? (person.last_login_at ? "positive" : "warning") : "neutral"}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {person.projects.map((place) => (
                  <TypeBadge key={place.id} label={`${place.code} · ${place.name}`} />
                ))}
                {/* 「不允许同时挂在两个项目」 (JB148, 客户 11-10 事项 5 第 3 点): a
                    double from before shows, so its 链接 can pick one. */}
                {(person.open_project_count ?? 0) > 1 && (
                  <StatusBadge
                    label={t("onTwoProjects", { count: person.open_project_count ?? 0 })}
                    tone="warning"
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setDialogFor(person)}>
                  <Link2 />
                  {t("link")}
                </Button>
                <Button size="sm" variant="outline-destructive" onClick={() => setRemoving(person)}>
                  <Trash2 />
                  {t("remove")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialogFor && (
        <FieldAccessManagementDialog
          initialUser={dialogFor === "new" ? undefined : dialogFor}
          onClose={() => {
            setDialogFor(null);
            void queryClient.invalidateQueries({ queryKey: ["field-access", "staff"] });
          }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={t("removeTitle")}
        description={t("removeConfirm", { name: removing?.full_name ?? "" })}
        confirmLabel={t("remove")}
        isPending={removal.isPending}
        onConfirm={() => {
          if (removing) removal.mutate(removing);
        }}
      />
    </div>
  );
}
