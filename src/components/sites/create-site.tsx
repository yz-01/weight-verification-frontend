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
  required,
} from "@/components/shared/form-shell";
import { ApiError } from "@/interfaces/api";
import type { RecyclingSite, RecyclingSitePayload } from "@/interfaces/weighing";
import { createSite, getSite, updateSite } from "@/services/weighing.service";

/** The yard form, shared by create and edit. */
export function CreateSite({ site }: { site?: RecyclingSite }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = site !== undefined;
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (values: RecyclingSitePayload) =>
      isEdit ? updateSite(site.id, values) : createSite(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sites"] });
      router.push("/sites");
    },
  });

  const form = useForm({
    defaultValues: {
      code: site?.code ?? "",
      name: site?.name ?? "",
      address_line_1: site?.address_line_1 ?? "",
      address_line_2: site?.address_line_2 ?? "",
      city: site?.city ?? "",
      state: site?.state ?? "",
      postcode: site?.postcode ?? "",
      contact_person: site?.contact_person ?? "",
      contact_phone: site?.contact_phone ?? "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await mutation.mutateAsync(value);
      } catch (error) {
        if (error instanceof ApiError && error.isValidation) {
          const leftover = applyServerErrors(error.errors, form as unknown as Parameters<typeof applyServerErrors>[1]);
          if (leftover.length > 0) setFormError(leftover[0]);
        }
      }
    },
  });

  return (
    <FormShell
      backHref="/sites"
      backLabel={t("sites.title")}
      title={isEdit ? t("sites.editTitle") : t("sites.createTitle")}
      isSubmitting={mutation.isPending}
      submitLabel={isEdit ? t("common.save") : t("common.create")}
      submitIcon={isEdit ? Save : Plus}
      onSubmit={() => void form.handleSubmit()}
    >
      <FormSection title={t("sites.section.identity")}>
        <form.Field
          name="code"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("sites.field.code")}
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
              label={t("sites.field.name")}
              required
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("sites.section.address")}>
        <form.Field name="address_line_1">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("sites.field.addressLine1")}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>
        <form.Field name="address_line_2">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("sites.field.addressLine2")}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>
        <form.Field name="city">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("sites.field.city")}
              optional
            />
          )}
        </form.Field>
        <form.Field name="state">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("sites.field.state")}
              optional
            />
          )}
        </form.Field>
        <form.Field name="postcode">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("sites.field.postcode")}
              optional
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("sites.section.contact")}>
        <form.Field name="contact_person">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("sites.field.contactPerson")}
              optional
            />
          )}
        </form.Field>
        <form.Field name="contact_phone">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("sites.field.contactPhone")}
              optional
              type="tel"
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
export function EditSite({ id }: { id: string }) {
  const t = useTranslations();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["sites", "detail", id],
    queryFn: () => getSite(id),
  });

  if (isLoading) return <FormSkeleton sections={3} />;
  if (isError || !data) {
    return <LoadErrorCard backHref="/sites" backLabel={t("sites.title")} />;
  }
  return <CreateSite site={data} />;
}
