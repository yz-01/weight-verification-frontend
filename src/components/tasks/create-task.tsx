"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useFinishForm } from "@/components/shared/dialog-navigation";
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
import { QueryFailedNote } from "@/components/shared/page-primitives";
import {
  CrewFields,
  DEFAULT_LINK_RULE,
  EMPTY_CREW,
  LinkRuleFields,
  crewPayload,
  linkRuleIsComplete,
  tripLinkRulePayload,
  type CrewValue,
  type LinkRuleValue,
} from "@/components/tasks/trip-crew";
import { TripLinkDialog } from "@/components/tasks/trip-link";
import { ApiError } from "@/interfaces/api";
import type {
  DriverTaskDetail,
  DriverTaskPayload,
} from "@/interfaces/recycler";
import { useAuth } from "@/components/providers/auth-provider";
import { createTask, getTask, updateTask } from "@/services/recycler.service";
import {
  enqueueTripAssign,
  newClientEventId,
} from "@/services/offline-sync.service";
import {
  getIncomingOfflineAware,
  getSitesOfflineAware,
} from "@/services/recycler-offline.service";

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
  if (id && (existing.isLoadingError || !existing.data)) {
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
  const finish = useFinishForm();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  const [formError, setFormError] = useState<string | null>(null);
  // Typed, not picked (「不需要新增司机账号或者车辆了」). Kept beside the form
  // rather than in it: three plain inputs with suggestions, whose refusals
  // come back under the payload's own names.
  const [crew, setCrew] = useState<CrewValue>(
    existingTask
      ? {
          driverName: existingTask.driver_name,
          driverPhone: existingTask.driver_phone ?? "",
          vehiclePlate: existingTask.vehicle_plate,
        }
      : EMPTY_CREW,
  );
  const [crewErrors, setCrewErrors] = useState<
    Partial<Record<"driver_name" | "driver_phone" | "vehicle_plate", string>>
  >({});
  const [linkRule, setLinkRule] = useState<LinkRuleValue>(DEFAULT_LINK_RULE);
  const [assigned, setAssigned] = useState<DriverTaskDetail | null>(null);

  const loadQuery = useQuery({
    queryKey: ["incoming", "options"],
    queryFn: () => getIncomingOfflineAware(ownerId, { page_size: 100 }),
    enabled: Boolean(ownerId),
  });
  const siteQuery = useQuery({
    queryKey: ["sites", "options"],
    queryFn: () => getSitesOfflineAware(ownerId, { page_size: 100 }),
    enabled: Boolean(ownerId),
  });
  const loadPage = loadQuery.data;
  const sitePage = siteQuery.data;
  const onlySite =
    sitePage?.results.length === 1 ? sitePage.results[0].id : "";
  const defaultValues = useMemo(
    () => ({
      dispatch: existingTask?.dispatch ?? "",
      site: existingTask?.site ?? "",
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
    mutationFn: async (values: DriverTaskPayload) => {
      if (id) return updateTask(id, values);
      const clientEventId = newClientEventId("trip-assign");
      try {
        return await createTask({ ...values, client_event_id: clientEventId });
      } catch (error) {
        // A dead network queues the assignment instead of losing the form.
        // Editing stays online-only: a reassignment must see the live roster.
        if (!(error instanceof ApiError && error.isNetwork)) throw error;
        const load = collectableLoads.find(
          (row) => row.id === values.dispatch,
        );
        await enqueueTripAssign(ownerId, {
          dispatchId: values.dispatch ?? "",
          dispatchNo: load?.dispatch_no ?? "",
          site: values.site,
          driverName: values.driver_name,
          driverPhone: values.driver_phone,
          vehiclePlate: values.vehicle_plate,
          scheduledFor: values.scheduled_for
            ? new Date(values.scheduled_for).toISOString()
            : null,
          notes: values.notes ?? "",
          clientEventId,
        });
        return null;
      }
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["drivers"] });
      void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      // A new link comes back once; hand it over before leaving the form.
      if (saved?.link_url) setAssigned(saved);
      else finish(saved ? `/tasks/${saved.id}` : "/tasks");
    },
  });

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setFormError(null);
      // Said under each empty box before the round trip: the server would
      // refuse the same three, one at a time.
      const required = t("validation.required");
      const missing = {
        ...(crew.driverName.trim() ? {} : { driver_name: required }),
        ...(crew.driverPhone.trim() ? {} : { driver_phone: required }),
        ...(crew.vehiclePlate.trim() ? {} : { vehicle_plate: required }),
      };
      setCrewErrors(missing);
      if (Object.keys(missing).length > 0 || (!id && !linkRuleIsComplete(linkRule))) {
        toast.error(t("tasks.crew.incomplete"));
        return;
      }
      try {
        await mutation.mutateAsync({
          ...value,
          site: value.site || onlySite,
          dispatch: value.dispatch,
          scheduled_for: value.scheduled_for || null,
          ...crewPayload(crew),
          ...(id ? {} : tripLinkRulePayload(linkRule)),
        });
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.isValidation) {
            const leftover = applyServerErrors(
              error.errors,
              form as unknown as Parameters<typeof applyServerErrors>[1],
            );
            const crewRefusals = {
              driver_name: error.errors.driver_name ?? error.errors.driver,
              driver_phone: error.errors.driver_phone,
              vehicle_plate: error.errors.vehicle_plate ?? error.errors.vehicle,
            };
            setCrewErrors(crewRefusals);
            if (leftover.length > 0) setFormError(leftover[0]);
            // The refusals that matter here — this driver is already out, this
            // lorry is already out, this load already has a trip — land on a
            // field halfway down a long form, and the page does not scroll to
            // them. A dispatcher pressed Assign, nothing appeared to happen,
            // and the trip did not exist. So say it where they are looking.
            toast.error(
              leftover[0] ??
                crewRefusals.driver_name ??
                crewRefusals.driver_phone ??
                crewRefusals.vehicle_plate ??
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

        {/* A yard with one site is not asked which: it is that one. */}
        <form.Field
          name="site"
          validators={{
            onSubmit: ({ value }) =>
              value || onlySite ? undefined : t("validation.required"),
          }}
        >
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("tasks.field.site")}
              required={!onlySite}
              placeholder={onlySite ? sitePage?.results[0].name : undefined}
              options={(sitePage?.results ?? []).map((site) => ({
                value: site.id,
                label: `${site.code} — ${site.name}`,
              }))}
            />
          )}
        </form.Field>
        <QueryFailedNote query={loadQuery} what={t("tasks.what.loads")} className="md:col-span-2" />
        <QueryFailedNote query={siteQuery} what={t("tasks.what.sites")} className="md:col-span-2" />
      </FormSection>

      <FormSection title={t("tasks.section.crew")}>
        <CrewFields value={crew} onChange={setCrew} errors={crewErrors} />
        {!id && <LinkRuleFields value={linkRule} onChange={setLinkRule} />}

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
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t("tasks.reassignNote")}
        </p>

        {formError && (
          <p className="text-sm font-medium text-destructive md:col-span-2">
            {formError}
          </p>
        )}
      </FormSection>
      {assigned?.link_url && (
        <TripLinkDialog
          task={assigned}
          linkUrl={assigned.link_url}
          onClose={() => finish(`/tasks/${assigned.id}`)}
        />
      )}
    </FormShell>
  );
}
