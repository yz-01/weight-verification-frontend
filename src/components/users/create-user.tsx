"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Save, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { useFinishForm } from "@/components/shared/dialog-navigation";
import {
  SelectField,
  TextField,
  type BoundField,
} from "@/components/shared/form-fields";
import {
  FormSection,
  FormShell,
  applyServerErrors,
  required,
  requiredEmail,
} from "@/components/shared/form-shell";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { roleName } from "@/lib/role-labels";
import { ApiError } from "@/interfaces/api";
import type { Role, UserDetail, UserPayload } from "@/interfaces/auth";
import { toastSuccess } from "@/services/api-client";
import { createUser, getRoles, updateUser } from "@/services/users.service";

/**
 * The user form, shared by invite and edit.
 *
 * No password field, on either path. A new user is created in the INVITED
 * state with no usable password and finishes onboarding through the link they
 * are emailed, so a plaintext password never passes through an administrator's
 * hands and cannot be reused or shared.
 */
/** A driver role by what it can do, not by what it is called.

 * Mirrors `UserWriteSerializer._is_driver_role`: role codes belong to the
 * tenant and can be renamed, so the rule reads the permissions instead. A
 * driver submits its own trips and cannot see the whole yard's.
 */
function isDriverRole(role: Role): boolean {
  const permissions = new Set(role.permissions);
  return permissions.has("task.submit") && !permissions.has("task.view_all");
}

/** The phone's roles: made from 现场人员管理's link, never here (JB104 F7). */
const PHONE_ROLE_CODES = ["site_staff", "gate_guard", "equipment_operator"];

function isPhoneRole(role: Role): boolean {
  return role.kind === "phone" || PHONE_ROLE_CODES.includes(role.code);
}

/**
 * The roles the 角色 field offers. A new person: never a phone role (every
 * one, not only 工地人员 - JB219 sibling: 设备操作人员 and 门岗保安 were offered
 * and then refused) and never the driver's. Editing: whatever they hold too.
 */
export function invitableRoles(roles: Role[], isEdit: boolean): Role[] {
  return roles.filter((role) => isEdit || (!isPhoneRole(role) && !isDriverRole(role)));
}

/** Whether a builder has made no role of its own yet - 公司管理员 alone (JB219). */
export function hasNoOwnRoles(roles: Role[]): boolean {
  const builder = roles.some((role) => role.kind === "head_office" || role.kind === "project");
  return (
    builder &&
    !roles.some((role) => !role.is_system && (role.kind === "head_office" || role.kind === "project"))
  );
}

/**
 * The dialog's one 「保存」: the user's fields first, then whatever the panel
 * below them holds (the 权限开关), then close. ``false`` - and the dialog
 * stays open - when the second part did not save; the first part did.
 */
export async function saveUserThenAfter({
  saveUser,
  saveAfter,
  finish,
}: {
  saveUser: () => Promise<unknown>;
  saveAfter?: () => Promise<boolean>;
  finish: () => void;
}): Promise<boolean> {
  await saveUser();
  if (saveAfter && !(await saveAfter())) return false;
  finish();
  return true;
}

export function CreateUser({
  user,
  after,
  saveAfter,
}: {
  user?: UserDetail;
  /**
   * Shown after the fields, inside the same dialog (the 权限开关 when editing).
   * A function is given the 角色 chosen on the form, so the panel can follow it
   * before 保存 (JB126).
   */
  after?: React.ReactNode | ((role: string) => React.ReactNode);
  /**
   * Saves the ``after`` panel once the fields have saved (the 权限开关's
   * changes). ``false`` keeps the dialog open; the panel says why.
   */
  saveAfter?: () => Promise<boolean>;
}) {
  const t = useTranslations();
  const finish = useFinishForm();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const isEdit = user !== undefined;
  const [formError, setFormError] = useState<string | null>(null);

  // Platform staff manage a named tenant's users; a tenant admin manages their
  // own. Either way the roles offered must come from the same company as the
  // user, or the backend rejects the pairing.
  //
  // The tenant comes from `?company=` when a platform admin adds a user from a
  // company's page — without it, platform staff can only ever create more
  // platform staff, and a tenant's first user could never be made. A tenant
  // admin has their own company and ignores the parameter.
  const companyFromUrl = searchParams.get("company") ?? undefined;
  const companyId = user?.company ?? me?.company ?? companyFromUrl ?? undefined;
  const companyReturnHref =
    !isEdit && me?.portal === "MSE_ADMIN" && companyFromUrl
      ? `/companies/${companyFromUrl}`
      : undefined;
  const userListHref =
    me?.portal === "MSE_ADMIN" ? "/users/admin/management" : "/users";

  const rolesQuery = useQuery({
    queryKey: ["roles", "options", companyId ?? "platform"],
    queryFn: () =>
      getRoles({
        page_size: 100,
        ...(companyId ? { company: companyId } : {}),
      }),
  });
  const roles = rolesQuery.data;

  const mutation = useMutation({
    mutationFn: (values: UserPayload) =>
      isEdit
        ? updateUser(user.id, values, { quiet: Boolean(saveAfter) })
        : createUser(
            { ...values, ...(companyId ? { company: companyId } : {}) },
            {
              subject: t("email.invite.subject"),
              body: t("email.invite.body"),
            },
          ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
  const [savingAfter, setSavingAfter] = useState(false);

  const form = useForm({
    defaultValues: {
      email: user?.email ?? "",
      full_name: user?.full_name ?? "",
      phone: user?.phone ?? "",
      role: user?.role ?? "",
      language: user?.language ?? me?.company_preferences?.language ?? "en",
      timezone:
        user?.timezone ??
        me?.company_preferences?.timezone ??
        "Asia/Kuala_Lumpur",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      // The fields go every time, changed or not: the PATCH of unchanged
      // values is harmless, and a dialog where only the switches changed
      // must still save them.
      try {
        await saveUserThenAfter({
          saveUser: () =>
            mutation.mutateAsync({
              ...value,
              role: value.role || null,
            } as UserPayload),
          saveAfter: saveAfter
            ? async () => {
                setSavingAfter(true);
                try {
                  return await saveAfter();
                } finally {
                  setSavingAfter(false);
                }
              }
            : undefined,
          finish: () => {
            // The one toast for the fields and the switches together.
            if (isEdit && saveAfter) toastSuccess("users.toast.updated");
            finish(companyReturnHref ?? userListHref);
          },
        });
      } catch (error) {
        if (error instanceof ApiError && error.isValidation) {
          const leftover = applyServerErrors(
            error.errors,
            form as unknown as Parameters<typeof applyServerErrors>[1],
          );
          if (leftover.length > 0) setFormError(leftover[0]);
        }
      }
    },
  });

  // Field staff and drivers are both created on their own screens, where the
  // login is made together with the record it needs — the field login link
  // screen, and Drivers, which also requires the lorry. The server refuses
  // both here, so neither is offered: a role that can only ever come back as
  // an error is not a choice.
  const roleOptions =
    (roles ? invitableRoles(roles.results, isEdit) : undefined)
      ?.map((role) => ({
        value: role.id,
        label: roleName(role, t),
      })) ?? [];
  // JB219 (客户 11-18 事项 4): a builder starts with 公司管理员 alone and makes
  // its own roles. A new person needs one chosen - left blank, the company's
  // default is the phone's 工地人员, which an email invitation cannot be - and
  // with only 公司管理员 to choose, the form says how to make a smaller one.
  const builder = (roles?.results ?? []).some(
    (role) => role.kind === "head_office" || role.kind === "project",
  );
  const noOwnRoles = hasNoOwnRoles(roles?.results ?? []);
  const roleRequired = builder && !isEdit;

  return (
    <FormShell
      backHref={companyReturnHref ?? userListHref}
      backLabel={
        companyReturnHref ? t("companies.viewTitle") : t("users.title")
      }
      title={isEdit ? t("users.editTitle") : t("users.createTitle")}
      isSubmitting={mutation.isPending || savingAfter}
      submitLabel={isEdit ? t("common.save") : t("users.new")}
      submitIcon={isEdit ? Save : UserPlus}
      onSubmit={() => void form.handleSubmit()}
      after={
        typeof after === "function" ? (
          <form.Subscribe selector={(state) => state.values.role}>
            {(role) => after(role)}
          </form.Subscribe>
        ) : (
          after
        )
      }
    >
      <FormSection title={t("users.section.identity")}>
        <form.Field
          name="full_name"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("users.field.fullName")}
              required
            />
          )}
        </form.Field>

        <form.Field
          name="email"
          validators={{
            onSubmit: requiredEmail(
              t("validation.required"),
              t("validation.email"),
            ),
          }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("users.field.email")}
              required
              type="email"
              autoComplete="off"
            />
          )}
        </form.Field>

        <form.Field name="phone">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("users.field.phone")}
              optional
              type="tel"
              disabled={user?.is_field_staff}
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("users.section.access")}>
        <form.Field
          name="role"
          validators={{
            onSubmit: ({ value }) =>
              roleRequired && !value ? t("users.field.roleRequired") : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-1 md:col-span-2">
              <SelectField
                field={field as unknown as BoundField}
                label={t("users.field.role")}
                required={roleRequired}
                options={roleOptions}
                // JB208-12 (Lucas 11-16 audit): an MSE account saved with no
                // role signs in to a dashboard that shows nothing.
                hint={
                  me?.portal === "MSE_ADMIN" && !companyId
                    ? t("users.field.roleHint")
                    : undefined
                }
              />
              <QueryFailedNote query={rolesQuery} what={t("users.what.roles")} />
              {noOwnRoles && (
                <p role="note" data-no-own-roles className="text-sm leading-6 text-muted-foreground">
                  {t("users.field.noOwnRoles")}{" "}
                  {me?.portal === "MSE_TRACE" ? (
                    <Link href="/roles" className="font-medium text-primary underline-offset-4 hover:underline">
                      {t("users.field.noOwnRolesLink")}
                    </Link>
                  ) : null}
                </p>
              )}
            </div>
          )}
        </form.Field>

        {!isEdit && (
          <div className="flex items-start gap-2 rounded-lg border border-info/25 bg-info/8 p-3 md:col-span-2">
            <Info className="mt-0.5 size-4 shrink-0 text-info" />
            <p className="text-sm text-foreground">{t("users.invite.hint")}</p>
          </div>
        )}
      </FormSection>

      <FormSection title={t("users.section.preferences")}>
        <form.Field name="language">
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("users.field.language")}
              options={LOCALES.map((locale) => ({
                value: locale,
                label: LOCALE_LABELS[locale],
              }))}
            />
          )}
        </form.Field>

        <form.Field name="timezone">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("users.field.timezone")}
            />
          )}
        </form.Field>

        {formError && (
          <p className="text-sm font-medium text-destructive md:col-span-2">
            {formError}
          </p>
        )}
      </FormSection>
    </FormShell>
  );
}
