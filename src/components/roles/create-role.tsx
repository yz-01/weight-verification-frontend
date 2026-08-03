"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PermissionMatrix } from "@/components/roles/permission-matrix";
import { CURRENT_USER_KEY } from "@/components/providers/auth-provider";
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
import { ApiError } from "@/interfaces/api";
import type { Role, RolePayload } from "@/interfaces/auth";
import { createRole, updateRole } from "@/services/users.service";

/** The role form, shared by create and edit. */
export function CreateRole({ role }: { role?: Role }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = role !== undefined;
  const [formError, setFormError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>(
    role?.permissions ?? [],
  );

  const mutation = useMutation({
    mutationFn: (values: RolePayload) =>
      isEdit ? updateRole(role.id, values) : createRole(values),
    onSuccess: async (saved) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["roles"] }),
        queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY }),
      ]);
      router.push(`/roles/${saved.id}`);
    },
  });

  const form = useForm({
    defaultValues: {
      code: role?.code ?? "",
      name: role?.name ?? "",
      description: role?.description ?? "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await mutation.mutateAsync({ ...value, permissions });
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

  return (
    <FormShell
      backHref={isEdit ? `/roles/${role.id}` : "/roles"}
      backLabel={t("roles.title")}
      title={isEdit ? t("roles.editTitle") : t("roles.createTitle")}
      isSubmitting={mutation.isPending}
      submitLabel={isEdit ? t("common.save") : t("common.create")}
      submitIcon={isEdit ? Save : Plus}
      onSubmit={() => void form.handleSubmit()}
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

        <form.Field
          name="code"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("roles.field.code")}
              required
              // A code is what permissions are keyed to in exports and in the
              // audit trail. Changing it on a built-in role would orphan both.
              disabled={role?.is_system}
              hint={role?.is_system ? t("roles.systemHint") : undefined}
            />
          )}
        </form.Field>

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

      <section className="px-6 py-5">
        <div className="mb-4 flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("roles.section.permissions")}
          </h3>
          {role?.is_system && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground ring-1 ring-inset ring-border">
              <Lock className="h-2.5 w-2.5" />
              {t("roles.system")}
            </span>
          )}
        </div>

        <PermissionMatrix selected={permissions} onChange={setPermissions} />

        {formError && (
          <p className="mt-4 text-sm font-medium text-destructive">{formError}</p>
        )}
      </section>
    </FormShell>
  );
}
