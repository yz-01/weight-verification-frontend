"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  SelectField,
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
import type { DriverTaskPayload } from "@/interfaces/recycler";
import {
  createTask,
  getDrivers,
  getIncoming,
  getVehicles,
} from "@/services/recycler.service";
import { getSites } from "@/services/weighing.service";

/**
 * Rostering a trip.
 *
 * The load picker lists only what is actually waiting — released or already
 * collected, addressed to this yard. Offering everything and refusing on
 * submit would teach dispatchers to guess.
 */
export function CreateTask() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const { data: loadPage } = useQuery({
    queryKey: ["incoming", "options"],
    queryFn: () => getIncoming({ page_size: 100, state: "RELEASED" }),
  });
  const { data: sitePage } = useQuery({
    queryKey: ["sites", "options"],
    queryFn: () => getSites({ page_size: 100 }),
  });
  const { data: vehiclePage } = useQuery({
    queryKey: ["vehicles", "options"],
    queryFn: () => getVehicles({ page_size: 100, is_active: "true" }),
  });
  const { data: driverPage } = useQuery({
    queryKey: ["drivers", "options"],
    queryFn: () => getDrivers({ page_size: 100, is_active: "true" }),
  });

  const mutation = useMutation({
    mutationFn: (values: DriverTaskPayload) => createTask(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      router.push("/tasks");
    },
  });

  const form = useForm({
    defaultValues: {
      dispatch: "",
      site: "",
      vehicle: "",
      driver: "",
      scheduled_for: "",
      notes: "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await mutation.mutateAsync({
          ...value,
          dispatch: value.dispatch || null,
          scheduled_for: value.scheduled_for || null,
        });
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.isValidation) {
            const leftover = applyServerErrors(
              error.errors,
              form as unknown as Parameters<typeof applyServerErrors>[1],
            );
            if (leftover.length > 0) setFormError(leftover[0]);
          } else {
            setFormError(error.message);
          }
        }
      }
    },
  });

  return (
    <FormShell
      backHref="/tasks"
      backLabel={t("tasks.title")}
      title={t("tasks.createTitle")}
      isSubmitting={mutation.isPending}
      submitLabel={t("common.create")}
      submitIcon={Plus}
      onSubmit={() => void form.handleSubmit()}
    >
      <FormSection title={t("tasks.section.load")}>
        <form.Field name="dispatch">
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("tasks.field.dispatch")}
              optional
              options={(loadPage?.results ?? []).map((load) => ({
                value: load.id,
                label: `${load.dispatch_no} — ${load.project_name}`,
              }))}
            />
          )}
        </form.Field>

        <form.Field
          name="site"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("tasks.field.site")}
              required
              options={(sitePage?.results ?? []).map((site) => ({
                value: site.id,
                label: `${site.code} — ${site.name}`,
              }))}
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("tasks.section.crew")}>
        <form.Field
          name="vehicle"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("tasks.field.vehicle")}
              required
              options={(vehiclePage?.results ?? []).map((vehicle) => ({
                value: vehicle.id,
                label: vehicle.plate_no,
              }))}
            />
          )}
        </form.Field>

        <form.Field
          name="driver"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("tasks.field.driver")}
              required
              options={(driverPage?.results ?? []).map((driver) => ({
                value: driver.id,
                label: driver.full_name,
              }))}
            />
          )}
        </form.Field>

        <form.Field name="scheduled_for">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("tasks.field.scheduledFor")}
              type="datetime-local"
              optional
            />
          )}
        </form.Field>

        <form.Field name="notes">
          {(field) => (
            <TextAreaField
              field={field as unknown as BoundField}
              label={t("tasks.field.notes")}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>

        <p className="flex items-start gap-2 text-xs text-muted-foreground md:col-span-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("tasks.reassignNote")}
        </p>

        {formError && (
          <p className="text-sm font-medium text-destructive md:col-span-2">
            {formError}
          </p>
        )}
      </FormSection>
    </FormShell>
  );
}
