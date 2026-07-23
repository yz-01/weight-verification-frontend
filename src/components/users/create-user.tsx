"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Save, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
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
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { roleName } from "@/lib/role-labels";
import { ApiError } from "@/interfaces/api";
import type { UserDetail, UserPayload } from "@/interfaces/auth";
import { createUser, getRoles, updateUser } from "@/services/users.service";

/**
 * The user form, shared by invite and edit.
 *
 * No password field, on either path. A new user is created in the INVITED
 * state with no usable password and finishes onboarding through the link they
 * are emailed, so a plaintext password never passes through an administrator's
 * hands and cannot be reused or shared.
 */
export function CreateUser({ user }: { user?: UserDetail }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const isEdit = user !== undefined;
  const [formError, setFormError] = useState<string | null>(null);

  // Platform staff manage a named tenant's users; a tenant admin manages their
  // own. Either way the roles offered must come from the same company as the
  // user, or the backend rejects the pairing.
  const companyId = user?.company ?? me?.company ?? undefined;

  const { data: roles } = useQuery({
    queryKey: ["roles", "options", companyId ?? "platform"],
    queryFn: () =>
      getRoles({
        page_size: 100,
        ...(companyId ? { company: companyId } : {}),
      }),
  });

  const mutation = useMutation({
    mutationFn: (values: UserPayload) =>
      isEdit
        ? updateUser(user.id, values)
        : createUser({ ...values, ...(companyId ? { company: companyId } : {}) }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      router.push(`/users/${saved.id}`);
    },
  });

  const form = useForm({
    defaultValues: {
      email: user?.email ?? "",
      full_name: user?.full_name ?? "",
      phone: user?.phone ?? "",
      role: user?.role ?? "",
      language: user?.language ?? "en",
      timezone: user?.timezone ?? "Asia/Kuala_Lumpur",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await mutation.mutateAsync({
          ...value,
          role: value.role || null,
        } as UserPayload);
      } catch (error) {
        if (error instanceof ApiError && error.isValidation) {
          const leftover = applyServerErrors(error.errors, form as unknown as Parameters<typeof applyServerErrors>[1]);
          if (leftover.length > 0) setFormError(leftover[0]);
        }
      }
    },
  });

  const roleOptions =
    roles?.results.map((role) => ({
      value: role.id,
      label: roleName(role, t),
    })) ?? [];

  return (
    <FormShell
      backHref={isEdit ? `/users/${user.id}` : "/users"}
      backLabel={t("users.title")}
      title={isEdit ? t("users.editTitle") : t("users.createTitle")}
      isSubmitting={mutation.isPending}
      submitLabel={isEdit ? t("common.save") : t("users.new")}
      submitIcon={isEdit ? Save : UserPlus}
      onSubmit={() => void form.handleSubmit()}
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
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("users.section.access")}>
        <form.Field name="role">
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("users.field.role")}
              options={roleOptions}
              className="md:col-span-2"
            />
          )}
        </form.Field>

        {!isEdit && (
          <div className="flex items-start gap-2.5 rounded-md border border-info/25 bg-info/8 px-3 py-2.5 md:col-span-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
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
