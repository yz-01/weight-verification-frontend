"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { TextField, type BoundField } from "@/components/shared/form-fields";
import {
  FormSection,
  FormShell,
  FormSkeleton,
  LoadErrorCard,
  applyServerErrors,
  optionalEmail,
  required,
} from "@/components/shared/form-shell";
import { ApiError } from "@/interfaces/api";
import type { Supplier, SupplierPayload } from "@/interfaces/contractor";
import {
  createSupplier,
  getSupplier,
  updateSupplier,
} from "@/services/contractor.service";

/** The supplier form, shared by create and edit. */
export function CreateSupplier({ supplier }: { supplier?: Supplier }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = supplier !== undefined;
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (values: SupplierPayload) =>
      isEdit ? updateSupplier(supplier.id, values) : createSupplier(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      router.push("/suppliers");
    },
  });

  const form = useForm({
    defaultValues: {
      code: supplier?.code ?? "",
      name: supplier?.name ?? "",
      contact_person: supplier?.contact_person ?? "",
      contact_phone: supplier?.contact_phone ?? "",
      contact_email: supplier?.contact_email ?? "",
      address_line_1: supplier?.address_line_1 ?? "",
      city: supplier?.city ?? "",
      state: supplier?.state ?? "",
      registration_no: supplier?.registration_no ?? "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await mutation.mutateAsync(value);
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

  return (
    <FormShell
      backHref="/suppliers"
      backLabel={t("suppliers.title")}
      title={isEdit ? t("suppliers.editTitle") : t("suppliers.createTitle")}
      isSubmitting={mutation.isPending}
      submitLabel={isEdit ? t("common.save") : t("common.create")}
      submitIcon={isEdit ? Save : Plus}
      onSubmit={() => void form.handleSubmit()}
    >
      <FormSection title={t("suppliers.section.identity")}>
        <form.Field
          name="code"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("suppliers.field.code")}
              required
            />
          )}
        </form.Field>

        <form.Field
          name="name"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("suppliers.field.name")}
              required
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("suppliers.section.contact")}>
        <form.Field name="contact_person">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("suppliers.field.contactPerson")}
              optional
            />
          )}
        </form.Field>
        <form.Field name="contact_phone">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("suppliers.field.contactPhone")}
              type="tel"
              optional
            />
          )}
        </form.Field>
        <form.Field
          name="contact_email"
          validators={{ onSubmit: optionalEmail(t("validation.email")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("suppliers.field.contactEmail")}
              type="email"
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("suppliers.section.address")}>
        <form.Field name="address_line_1">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("suppliers.field.addressLine1")}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>
        <form.Field name="city">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("suppliers.field.city")}
              optional
            />
          )}
        </form.Field>

        <form.Field name="state">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("suppliers.field.state")}
              optional
            />
          )}
        </form.Field>

        <form.Field name="registration_no">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("suppliers.field.registrationNo")}
              optional
              className="md:col-span-2"
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

/** Fetches the record, then hands it to the shared form. */
export function EditSupplier({ id }: { id: string }) {
  const t = useTranslations();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["suppliers", "detail", id],
    queryFn: () => getSupplier(id),
  });

  if (isLoading) return <FormSkeleton sections={3} />;
  if (isError || !data) {
    return (
      <LoadErrorCard backHref="/suppliers" backLabel={t("suppliers.title")} />
    );
  }
  return <CreateSupplier supplier={data} />;
}
