"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  SelectField,
  TextField,
  type BoundField,
} from "@/components/shared/form-fields";
import {
  FormSection,
  FormShell,
  applyServerErrors,
  optionalEmail,
  required,
} from "@/components/shared/form-shell";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { ApiError } from "@/interfaces/api";
import type { CompanyDetail, CompanyPayload } from "@/interfaces/company";
import { createCompany, updateCompany } from "@/services/companies.service";

const TIMEZONES = [
  "Asia/Kuala_Lumpur",
  "Asia/Singapore",
  "Asia/Jakarta",
  "Asia/Bangkok",
  "UTC",
];

/**
 * The company form, shared by create and edit.
 *
 * Edit passes the existing record; create passes nothing. Keeping one
 * component means a field added for one is present in the other, which is the
 * failure this arrangement exists to prevent.
 */
export function CreateCompany({ company }: { company?: CompanyDetail }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = company !== undefined;
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (values: CompanyPayload) =>
      isEdit ? updateCompany(company.id, values) : createCompany(values),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
      router.push(`/companies/${saved.id}`);
    },
  });

  const form = useForm({
    defaultValues: {
      name: company?.name ?? "",
      type: company?.type ?? "",
      registration_no: company?.registration_no ?? "",
      tax_id: company?.tax_id ?? "",
      address_line_1: company?.address_line_1 ?? "",
      address_line_2: company?.address_line_2 ?? "",
      city: company?.city ?? "",
      state: company?.state ?? "",
      postcode: company?.postcode ?? "",
      country: company?.country ?? "Malaysia",
      contact_person: company?.contact_person ?? "",
      contact_phone: company?.contact_phone ?? "",
      contact_email: company?.contact_email ?? "",
      default_language: company?.default_language ?? "en",
      timezone: company?.timezone ?? "Asia/Kuala_Lumpur",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await mutation.mutateAsync(value as CompanyPayload);
      } catch (error) {
        if (error instanceof ApiError && error.isValidation) {
          // Put the server's field messages beside the inputs they belong to.
          // A duplicate registration number is only detectable server-side, and
          // a toast leaves the user hunting for which field it meant.
          const leftover = applyServerErrors(error.errors, (field, message) =>
            form.setFieldMeta(field as never, (meta) => ({
              ...meta,
              errorMap: { ...meta.errorMap, onSubmit: message },
              errors: [message],
            })),
          );
          if (leftover.length > 0) setFormError(leftover[0]);
        }
      }
    },
  });

  return (
    <FormShell
      backHref={isEdit ? `/companies/${company.id}` : "/companies"}
      backLabel={t("companies.title")}
      title={isEdit ? t("companies.editTitle") : t("companies.createTitle")}
      isSubmitting={mutation.isPending}
      submitLabel={isEdit ? t("common.save") : t("common.create")}
      submitIcon={isEdit ? Save : Plus}
      onSubmit={() => void form.handleSubmit()}
    >
      <FormSection title={t("companies.section.identity")}>
        <form.Field
          name="name"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.name")}
              required
              className="md:col-span-2"
            />
          )}
        </form.Field>

        <form.Field
          name="type"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("companies.field.type")}
              required
              // A contractor's projects and a recycler's weigh sessions do not
              // interchange, so the backend refuses to change this after
              // creation. Locking it here says so before the request fails.
              disabled={isEdit}
              hint={isEdit ? t("companies.typeLocked") : undefined}
              options={[
                { value: "CONTRACTOR", label: t("companies.type.CONTRACTOR") },
                { value: "RECYCLER", label: t("companies.type.RECYCLER") },
              ]}
            />
          )}
        </form.Field>

        <form.Field name="registration_no">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.registrationNo")}
              optional
            />
          )}
        </form.Field>

        <form.Field name="tax_id">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.taxId")}
              optional
              hint={t("companies.taxIdHint")}
              className="md:col-span-2"
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("companies.section.contact")}>
        <form.Field name="contact_person">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.contactPerson")}
              optional
            />
          )}
        </form.Field>

        <form.Field name="contact_phone">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.contactPhone")}
              optional
              type="tel"
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
              label={t("companies.field.contactEmail")}
              optional
              type="email"
              className="md:col-span-2"
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("companies.section.address")}>
        <form.Field name="address_line_1">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.addressLine1")}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>

        <form.Field name="address_line_2">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.addressLine2")}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>

        <form.Field name="city">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.city")}
              optional
            />
          )}
        </form.Field>

        <form.Field name="state">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.state")}
              optional
            />
          )}
        </form.Field>

        <form.Field name="postcode">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.postcode")}
              optional
            />
          )}
        </form.Field>

        <form.Field name="country">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.country")}
              optional
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("companies.section.preferences")}>
        <form.Field name="default_language">
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("companies.field.defaultLanguage")}
              hint={t("companies.languageHint")}
              options={LOCALES.map((locale) => ({
                value: locale,
                label: LOCALE_LABELS[locale],
              }))}
            />
          )}
        </form.Field>

        <form.Field name="timezone">
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("companies.field.timezone")}
              options={TIMEZONES.map((zone) => ({
                value: zone,
                label: zone.replace("_", " "),
              }))}
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
