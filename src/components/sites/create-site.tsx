"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SelectField, TextField, type BoundField } from "@/components/shared/form-fields";
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
      weighing_mode: site?.weighing_mode ?? "TWO_PASS",
      requires_dispatch: site ? String(site.requires_dispatch) : "true",
      pairing_window_hours: String(site?.pairing_window_hours ?? 12),
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await mutation.mutateAsync({
          ...value,
          weighing_mode: value.weighing_mode as RecyclingSitePayload["weighing_mode"],
          requires_dispatch: value.requires_dispatch === "true",
          pairing_window_hours: Number(value.pairing_window_hours),
        });
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

      {/* How this yard weighs (T-382): the three rules the weighing engine
          reads for every weighing here. They used to be settable only by API. */}
      <FormSection title={t("sites.section.weighing")}>
        <form.Field name="weighing_mode">
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("sites.field.weighingMode")}
              hint={t("sites.hint.weighingMode")}
              options={[
                { value: "TWO_PASS", label: t("sites.weighingMode.TWO_PASS") },
                { value: "STORED_TARE", label: t("sites.weighingMode.STORED_TARE") },
              ]}
              required
            />
          )}
        </form.Field>
        <form.Field name="requires_dispatch">
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("sites.field.requiresDispatch")}
              hint={t("sites.hint.requiresDispatch")}
              options={[
                { value: "true", label: t("sites.requiresDispatch.true") },
                { value: "false", label: t("sites.requiresDispatch.false") },
              ]}
              required
            />
          )}
        </form.Field>
        <form.Field
          name="pairing_window_hours"
          validators={{
            onSubmit: ({ value }) =>
              /^[1-9]\d*$/.test(String(value)) ? undefined : t("sites.validation.pairingWindow"),
          }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("sites.field.pairingWindowHours")}
              hint={t("sites.hint.pairingWindowHours")}
              type="number"
              required
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
