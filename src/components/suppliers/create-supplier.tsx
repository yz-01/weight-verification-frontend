"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useFinishForm } from "@/components/shared/dialog-navigation";
import {
  TextAreaField,
  TextField,
  type BoundField,
} from "@/components/shared/form-fields";
import { SupplierQrPanel } from "@/components/suppliers/supplier-qr-panel";
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
  const finish = useFinishForm();
  const queryClient = useQueryClient();
  const isEdit = supplier !== undefined;
  // A supplier from before 「行业」/「主要产品」 existed: say why saving it now
  // asks for them.
  const missingProfile =
    isEdit && (!supplier.industry?.trim() || !supplier.main_products?.trim());
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (values: SupplierPayload) =>
      isEdit ? updateSupplier(supplier.id, values) : createSupplier(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      finish("/suppliers");
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
      industry: supplier?.industry ?? "",
      main_products: supplier?.main_products ?? "",
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

        {/* What the supplier is and sells (A3): required on every save, so a
            supplier saved before these existed is asked for them when edited. */}
        <form.Field
          name="industry"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("suppliers.field.industry")}
              placeholder={t("suppliers.placeholder.industry")}
              hint={missingProfile ? t("suppliers.hint.profileMissing") : undefined}
              required
            />
          )}
        </form.Field>

        <form.Field
          name="main_products"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextAreaField
              field={field as unknown as BoundField}
              label={t("suppliers.field.mainProducts")}
              placeholder={t("suppliers.placeholder.mainProducts")}
              rows={2}
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
      {supplier && <SupplierQrPanel supplier={supplier} />}
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
