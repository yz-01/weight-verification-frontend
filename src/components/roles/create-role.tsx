"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, HardHat, Lock, Plus, Save, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { PermissionMatrix, roleKindOf } from "@/components/roles/permission-matrix";
import { CURRENT_USER_KEY, useAuth } from "@/components/providers/auth-provider";
import { useFinishForm } from "@/components/shared/dialog-navigation";
import {
  TextAreaField,
  TextField,
  type BoundField,
} from "@/components/shared/form-fields";
import {
  FormSection,
  FormShell,
  applyServerErrors,
  required,
} from "@/components/shared/form-shell";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/interfaces/api";
import type { Role, RolePayload } from "@/interfaces/auth";
import { roleDescription, roleName } from "@/lib/role-labels";
import {
  approvesPermitsWithoutSeeingProjects,
  withProjectView,
} from "@/lib/role-permission-hints";
import { cn } from "@/lib/utils";
import { getPermissionCatalogue } from "@/services/auth.service";
import { createRole, updateRole } from "@/services/users.service";

/**
 * The line the role window owes the people already in the role, if any
 * (JB219, lead 11-18): a new type re-sets their 总部权限 from the role; a
 * change of its A / B ticks reaches them as a change of those codes only.
 */
export function holdersNotice({
  holders,
  typeChanged,
  before,
  after,
  pageOf,
}: {
  holders: number;
  typeChanged: boolean;
  before: string[];
  after: string[];
  pageOf: (code: string) => string | undefined;
}): "type" | "ticks" | null {
  if (holders <= 0) return null;
  if (typeChanged) return "type";
  const headOffice = (codes: string[]) =>
    codes
      .filter((code) => pageOf(code) === "hq_reserved" || pageOf(code) === "hq_grantable")
      .sort()
      .join(",");
  return headOffice(before) === headOffice(after) ? null : "ticks";
}

/** The role form, shared by create and edit. */
export function CreateRole({ role }: { role?: Role }) {
  const t = useTranslations();
  const finish = useFinishForm();
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const isEdit = role !== undefined;
  const [formError, setFormError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>(
    role?.permissions ?? [],
  );

  // JB219 (客户 11-18 事项 3、4): a builder's role is 总部角色 or 项目角色, and
  // the company says which. A recycler's or MSE's role is not split (plain).
  const builder = role ? role.kind !== undefined && role.kind !== "plain" : me?.portal === "MSE_TRACE";
  const kindFixed = Boolean(role?.is_system);
  const initialHeadOffice = role ? roleKindOf(role) === "head_office" : null;
  const [headOffice, setHeadOffice] = useState<boolean | null>(builder ? initialHeadOffice : null);
  const [kindMissing, setKindMissing] = useState(false);
  const holders = role?.user_count ?? 0;

  // Which codes are 总部权限 A / B, for the line about the role's people.
  // query-failure: the matrix below reads the same catalogue and says it could not load, with 重试.
  const catalogue = useQuery({
    queryKey: ["permissions", "catalogue"],
    queryFn: getPermissionCatalogue,
    staleTime: 60 * 60_000,
    enabled: builder,
  });
  const pageByCode = useMemo(
    () => new Map((catalogue.data ?? []).map((entry) => [entry.code, entry.page ?? "project"])),
    [catalogue.data],
  );
  const typeChanged = isEdit && builder && headOffice !== initialHeadOffice;
  // Lead 11-18: a change of the role's A / B ticks reaches the people in it.
  const notice =
    isEdit && builder
      ? holdersNotice({
          holders,
          typeChanged,
          before: role.permissions,
          after: permissions,
          pageOf: (code) => pageByCode.get(code),
        })
      : null;

  const mutation = useMutation({
    mutationFn: (values: RolePayload) =>
      isEdit ? updateRole(role.id, values) : createRole(values),
    onSuccess: async (saved) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["roles"] }),
        queryClient.invalidateQueries({ queryKey: ["users"] }),
        queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY }),
      ]);
      finish(`/roles/${saved.id}`);
    },
  });

  const form = useForm({
    defaultValues: {
      code: role?.code ?? "",
      // A preset is shown in the reader's language; saving it keeps that
      // name as the company's own (JB219: 「由建筑公司自行创建及命名」).
      name: role ? (role.is_system ? role.name : roleName(role, t)) : "",
      description: role ? (role.is_system ? role.description : roleDescription(role, t)) : "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      if (builder && headOffice === null) {
        setKindMissing(true);
        return;
      }
      try {
        await mutation.mutateAsync({
          ...value,
          permissions,
          ...(builder && !kindFixed ? { head_office: headOffice === true } : {}),
        });
      } catch (error) {
        if (error instanceof ApiError && error.isValidation) {
          const leftover = applyServerErrors(error.errors, form as unknown as Parameters<typeof applyServerErrors>[1]);
          // The backend rejects codes outside this account's audience. That is
          // a whole-form problem rather than one field's, so it surfaces here.
          if (leftover.length > 0) setFormError(leftover[0]);
          const permissionError = error.fieldError("permissions");
          if (permissionError) setFormError(permissionError);
        }
      }
    },
  });

  function chooseKind(next: boolean) {
    setKindMissing(false);
    setHeadOffice(next);
    // A project role never holds A (the server drops it too).
    if (!next) setPermissions((codes) => codes.filter((code) => pageByCode.get(code) !== "hq_reserved"));
  }

  const matrixKind = !builder ? "plain" : headOffice ? "head_office" : "project";

  return (
    <FormShell
      backHref={isEdit ? `/roles/${role.id}` : "/roles"}
      backLabel={t("roles.title")}
      title={isEdit ? t("roles.editTitle") : t("roles.createTitle")}
      isSubmitting={mutation.isPending}
      submitLabel={isEdit ? t("common.save") : t("common.create")}
      submitIcon={isEdit ? Save : Plus}
      onSubmit={() => void form.handleSubmit()}
      after={
        notice === "ticks" ? (
          <p
            role="status"
            data-role-followers
            className="flex gap-2 rounded-lg border border-info/25 bg-info/8 p-3 text-sm leading-6 text-foreground"
          >
            <Users className="mt-1 size-4 shrink-0 text-info" />
            <span>{t("roles.followers", { count: holders })}</span>
          </p>
        ) : undefined
      }
    >
      <FormSection title={t("roles.section.identity")}>
        <form.Field
          name="name"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("roles.field.name")}
              required
            />
          )}
        </form.Field>

        {/* 角色编号 is the system's: ROLE-0001 on for a new role (JB100, 客户 11-05
            事项 4 第 3 点), shown but not changed afterwards - permissions are
            keyed to it in exports and the audit trail. */}
        {isEdit && (
          <form.Field name="code">
            {(field) => (
              <TextField
                field={field as unknown as BoundField}
                label={t("roles.field.code")}
                disabled
                hint={role?.is_system ? t("roles.systemHint") : undefined}
              />
            )}
          </form.Field>
        )}

        <form.Field name="description">
          {(field) => (
            <TextAreaField
              field={field as unknown as BoundField}
              label={t("roles.field.description")}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>
      </FormSection>

      {builder && (
        <FormSection title={t("roles.kind.label")}>
          <div className="space-y-2 md:col-span-2" data-role-kind>
            {kindFixed ? (
              <p className="flex items-center gap-2 text-sm text-foreground" data-role-kind-fixed>
                <Lock className="size-4 shrink-0 text-muted-foreground" />
                {t("roles.kind.adminFixed")}
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("roles.kind.label")}>
                {([true, false] as const).map((value) => {
                  const active = headOffice === value;
                  const Icon = value ? Building2 : HardHat;
                  return (
                    <button
                      key={String(value)}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      data-role-kind-option={value ? "head_office" : "project"}
                      onClick={() => chooseKind(value)}
                      className={cn(
                        "flex min-w-0 items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        active
                          ? "border-primary bg-primary/8 ring-1 ring-primary"
                          : "border-border bg-card hover:bg-muted/50",
                      )}
                    >
                      <Icon className={cn("mt-0.5 size-5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                      <span className="min-w-0 space-y-0.5">
                        <span className="block text-sm font-semibold text-foreground">
                          {t(value ? "roles.kind.headOffice" : "roles.kind.project")}
                        </span>
                        <span className="block text-xs leading-5 text-muted-foreground">
                          {t(value ? "roles.kind.headOfficeHelp" : "roles.kind.projectHelp")}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {kindMissing && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {t("roles.kind.required")}
              </p>
            )}
            {notice === "type" && (
              <p role="status" data-role-type-holders className="text-sm text-foreground">
                {t("roles.kind.changeHolders", { count: holders })}
              </p>
            )}
          </div>
        </FormSection>
      )}

      <section className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h3 className="panel-title">
            {t("roles.section.permissions")}
          </h3>
          {role?.is_system && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
              <Lock className="h-2.5 w-2.5" />
              {t("roles.system")}
            </span>
          )}
        </div>

        {/* A builder office role's people hold 查看项目 by default (JB139), so
            only a role whose boxes are all its own can miss it. */}
        {approvesPermitsWithoutSeeingProjects(permissions) && !builder && !role?.is_system && (
          <div
            role="status"
            className="mb-4 flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="flex gap-2 leading-6">
              <AlertTriangle className="mt-1 size-4 shrink-0 text-warning" />
              <span>{t("roles.permitHint.text")}</span>
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => setPermissions(withProjectView(permissions))}
            >
              <Plus className="size-4" />
              {t("roles.permitHint.add")}
            </Button>
          </div>
        )}

        {builder && headOffice === null ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground" data-role-kind-first>
            {t("roles.kind.chooseFirst")}
          </p>
        ) : role?.is_system ? (
          // 公司管理员 has everything and nothing changes it (事项 4 第 1 点).
          <div className="space-y-3">
            <p className="rounded-lg border border-primary/30 bg-primary/8 px-3 py-2 text-sm" data-admin-locked>
              {t("roles.adminLocked")}
            </p>
            <PermissionMatrix selected={permissions} readOnly kind={matrixKind} />
          </div>
        ) : (
          <PermissionMatrix
            // A fresh matrix for a new type: 总部角色 and 项目角色 open on 总部权限.
            key={matrixKind}
            selected={permissions}
            onChange={setPermissions}
            kind={matrixKind}
          />
        )}

        {formError && (
          <p className="mt-4 text-sm font-medium text-destructive">{formError}</p>
        )}
      </section>
    </FormShell>
  );
}
