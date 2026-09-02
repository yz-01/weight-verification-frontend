"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Plus, Save, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  SelectField,
  TextAreaField,
  TextField,
  type BoundField,
} from "@/components/shared/form-fields";
import {
  FormSection,
  FormSkeleton,
  LoadErrorCard,
  FormShell,
  applyServerErrors,
  required,
} from "@/components/shared/form-shell";
import { ApiError } from "@/interfaces/api";
import type {
  DriverTaskDetail,
  DriverTaskPayload,
} from "@/interfaces/recycler";
import {
  createTask,
  getTask,
  getDrivers,
  getIncoming,
  getVehicles,
  updateTask,
} from "@/services/recycler.service";
import { getSites } from "@/services/weighing.service";

/**
 * Rostering a trip.
 *
 * The load picker lists only what is actually waiting — released or already
 * collected, addressed to this yard. Offering everything and refusing on
 * submit would teach dispatchers to guess.
 */
function localDateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function CreateTask({ id }: { id?: string } = {}) {
  const t = useTranslations();
  const existing = useQuery({
    queryKey: ["tasks", "detail", id],
    queryFn: () => getTask(id!),
    enabled: Boolean(id),
  });

  if (id && existing.isLoading) return <FormSkeleton sections={2} />;
  if (id && (existing.isError || !existing.data)) {
    return <LoadErrorCard backHref="/tasks" backLabel={t("tasks.title")} />;
  }

  return <TaskForm id={id} existingTask={existing.data} />;
}

function TaskForm({
  id,
  existingTask,
}: {
  id?: string;
  existingTask?: DriverTaskDetail;
}) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const { data: loadPage } = useQuery({
    queryKey: ["incoming", "options"],
    queryFn: () => getIncoming({ page_size: 100 }),
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
  const defaultValues = useMemo(
    () => ({
      dispatch: existingTask?.dispatch ?? "",
      site: existingTask?.site ?? "",
      vehicle: existingTask?.vehicle ?? "",
      driver: existingTask?.driver ?? "",
      scheduled_for: localDateTimeInput(existingTask?.scheduled_for),
      notes: existingTask?.notes ?? "",
    }),
    [existingTask],
  );
  const collectableLoads = (loadPage?.results ?? []).filter(
    (load) =>
      load.state === "RELEASED" ||
      load.state === "COLLECTED" ||
      (load.state === "ACCEPTED" && load.confirmed_collection_at !== null),
  );

  const mutation = useMutation({
    mutationFn: (values: DriverTaskPayload) =>
      id ? updateTask(id, values) : createTask(values),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      router.push(`/tasks/${saved.id}`);
    },
  });

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await mutation.mutateAsync({
          ...value,
          dispatch: value.dispatch,
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
            // The refusals that matter here — this driver is already out, this
            // lorry is already out, this load already has a trip — land on a
            // field halfway down a long form, and the page does not scroll to
            // them. A dispatcher pressed Assign, nothing appeared to happen,
            // and the trip did not exist. So say it where they are looking.
            toast.error(
              leftover[0] ??
                error.errors.driver ??
                error.errors.vehicle ??
                error.errors.dispatch ??
                error.message,
            );
          } else {
            setFormError(error.message);
            toast.error(error.message);
          }
        }
      }
    },
  });

  /**
   * A driver or lorry that is already out cannot take a second trip.
   *
   * Shown as an unselectable row rather than hidden: a dispatcher looking for
   * Ali needs to see that Ali is out and on which trip, not to find that Ali
   * has vanished from the list. The one exception is whoever is already on
   * *this* trip — on the edit form they are "on a task" by definition, and
   * disabling them would make the form unable to save itself unchanged.
   */
  const isBusy = (status: string) =>
    status !== "AVAILABLE" && status !== "COMPLETED_TODAY";

  const drivers = driverPage?.results ?? [];
  const noDriverFree =
    drivers.length > 0 &&
    drivers.every(
      (driver) => isBusy(driver.work_status) && driver.id !== existingTask?.driver,
    );

  return (
    <FormShell
      backHref="/tasks"
      backLabel={t("tasks.title")}
      title={t(id ? "tasks.editTitle" : "tasks.createTitle")}
      isSubmitting={mutation.isPending}
      submitLabel={t(id ? "common.save" : "common.create")}
      submitIcon={id ? Save : Plus}
      onSubmit={() => void form.handleSubmit()}
    >
      <FormSection title={t("tasks.section.load")}>
        <form.Field
          name="dispatch"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("tasks.field.dispatch")}
              required
              options={collectableLoads.map((load) => ({
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
                disabled:
                  isBusy(vehicle.work_status) &&
                  vehicle.id !== existingTask?.vehicle,
                label: [
                  vehicle.plate_no,
                  t(`vehicles.status.${vehicle.work_status}`),
                  vehicle.current_task_no
                    ? `${t("vehicles.field.currentTask")}: ${vehicle.current_task_no}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
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
              hint={t("tasks.oneTripPerDriverNote")}
              options={(driverPage?.results ?? []).map((driver) => ({
                value: driver.id,
                disabled:
                  isBusy(driver.work_status) && driver.id !== existingTask?.driver,
                label: [
                  driver.full_name,
                  t(`drivers.status.${driver.work_status}`),
                  driver.current_task_no
                    ? `${t("drivers.field.currentTask")}: ${driver.current_task_no}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
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

        {/*
          Everyone is out. The pickers are then a list of rows that cannot be
          chosen, which reads as a broken screen rather than as a full yard —
          so name it, and say the two things that fix it.
        */}
        {noDriverFree && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-900 md:col-span-2 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("tasks.everyDriverBusyNote")}
          </p>
        )}

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
