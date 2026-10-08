"use client";

import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { useFinishForm } from "@/components/shared/dialog-navigation";
import {
  SelectField,
  TextAreaField,
  TextField,
  type BoundField,
} from "@/components/shared/form-fields";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import {
  FormSection,
  FormShell,
  FormSkeleton,
  LoadErrorCard,
  applyServerErrors,
  required,
} from "@/components/shared/form-shell";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { ApiError } from "@/interfaces/api";
import {
  WASTE_TYPES,
  type WasteDispatchDetail,
  type WasteDispatchPayload,
  type WasteType,
} from "@/interfaces/contractor";
import {
  createDispatch,
  getDispatch,
  getProjects,
  getRecyclerOptions,
  updateDispatch,
} from "@/services/contractor.service";

/** The outgoing-load form, shared by create and edit. */
export function CreateDispatch({
  dispatch,
}: {
  dispatch?: WasteDispatchDetail;
}) {
  const t = useTranslations();
  const finish = useFinishForm();
  const queryClient = useQueryClient();
  const isEdit = dispatch !== undefined;
  const [formError, setFormError] = useState<string | null>(null);
  // A new load is for the top bar's 「当前项目」 (B13); on 全部项目 the form
  // asks for it.
  const topBar = useCurrentProject();
  const lockedProject = !isEdit && topBar.active ? topBar.projectId : "";

  const projects = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () => getProjects({ page_size: 100 }),
  });

  const mutation = useMutation({
    mutationFn: (values: WasteDispatchPayload) =>
      isEdit ? updateDispatch(dispatch.id, values) : createDispatch(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dispatches"] });
      finish("/waste-clearance?kind=dispatch");
    },
  });

  const form = useForm({
    defaultValues: {
      project: dispatch?.project ?? lockedProject,
      recycler: dispatch?.recycler ?? "",
      waste_type: (dispatch?.waste_type ?? "MIXED") as WasteType,
      estimated_weight_kg: dispatch?.estimated_weight_kg ?? "",
      description: dispatch?.description ?? "",
      // Prefilled only when a person typed it. `pickup_address` is the
      // *effective* address, so an inherited project line put in this box
      // would be resubmitted as a typed one and flip the source to MANUAL -
      // the record would then claim somebody chose this gate.
      pickup_address:
        dispatch?.pickup_address_source === "MANUAL"
          ? dispatch.pickup_address
          : "",
      vehicle_plate: dispatch?.vehicle_plate ?? "",
      driver_name: dispatch?.driver_name ?? "",
      driver_phone: dispatch?.driver_phone ?? "",
      driver_ic: dispatch?.driver_ic ?? "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await mutation.mutateAsync({
          ...value,
          estimated_weight_kg: value.estimated_weight_kg || null,
        });
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

  const projectId = useStore(form.store, (state) => state.values.project);
  // The top bar's list may still have been loading when the form was made.
  useEffect(() => {
    if (lockedProject && !form.getFieldValue("project")) {
      form.setFieldValue("project", lockedProject);
    }
  }, [form, lockedProject]);
  const previousProjectId = useRef(projectId);

  useEffect(() => {
    if (previousProjectId.current !== projectId) {
      form.setFieldValue("recycler", "");
      previousProjectId.current = projectId;
    }
  }, [form, projectId]);

  // A recycler is eligible only through an active partnership bound to the
  // selected project. The project therefore belongs in both the request and
  // the query key so changing projects cannot reuse a stale partner list.
  const recyclers = useQuery({
    queryKey: ["recyclers", "options", projectId],
    queryFn: () => getRecyclerOptions(projectId),
    enabled: projectId !== "",
  });

  const recyclerOptions = (recyclers.data?.results ?? []).map((recycler) => ({
    value: recycler.id,
    label: recycler.city ? `${recycler.name} — ${recycler.city}` : recycler.name,
  }));

  return (
    <FormShell
      backHref="/waste-clearance?kind=dispatch"
      backLabel={t("dispatches.title")}
      title={isEdit ? t("dispatches.editTitle") : t("dispatches.createTitle")}
      isSubmitting={mutation.isPending}
      submitLabel={isEdit ? t("common.save") : t("common.create")}
      submitIcon={isEdit ? Save : Plus}
      onSubmit={() => void form.handleSubmit()}
    >
      <FormSection title={t("dispatches.section.destination")}>
        <form.Field
          name="project"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            lockedProject && field.state.value === lockedProject ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">{t("dispatches.field.project")}</p>
                <p className="text-sm" data-project-locked>
                  {topBar.projects
                    .filter((project) => project.id === lockedProject)
                    .map((project) => `${project.code} - ${project.name}`)}
                </p>
              </div>
            ) : (
            <div className="space-y-1">
              <SelectField
                field={field as unknown as BoundField}
                label={t("dispatches.field.project")}
                options={(projects.data?.results ?? []).map((project) => ({
                  value: project.id,
                  label: `${project.code} - ${project.name}`,
                }))}
                required
              />
              <QueryFailedNote query={projects} what={t("dispatches.what.projects")} />
            </div>
            )
          )}
        </form.Field>

        <form.Field
          name="recycler"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <div className="space-y-1">
              <SelectField
                field={field as unknown as BoundField}
                label={t("dispatches.field.recycler")}
                options={recyclerOptions}
                required
                hint={
                  projectId !== "" && recyclers.isSuccess && recyclerOptions.length === 0
                    ? t("dispatches.recyclerEmpty")
                    : undefined
                }
              />
              <QueryFailedNote query={recyclers} what={t("dispatches.what.recyclers")} />
            </div>
          )}
        </form.Field>

        {/*
          Spelled out rather than left implicit: a site clerk hunting for a
          haulier that is not on the list needs to know why, and that the fix
          is the recycler registering rather than a workaround here.
        */}
        <p className="flex items-start gap-2 text-xs text-muted-foreground md:col-span-2">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t("dispatches.recyclerNote")}
        </p>
      </FormSection>

      <FormSection title={t("dispatches.section.load")}>
        <form.Field name="waste_type">
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("dispatches.field.wasteType")}
              options={WASTE_TYPES.map((type) => ({
                value: type,
                label: t(`dispatches.wasteType.${type}`),
              }))}
              required
            />
          )}
        </form.Field>

        <form.Field name="estimated_weight_kg">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("dispatches.field.estimatedWeight")}
              type="number"
              optional
              hint={t("dispatches.estimateNote")}
            />
          )}
        </form.Field>

        <form.Field name="description">
          {(field) => (
            <TextAreaField
              field={field as unknown as BoundField}
              label={t("dispatches.field.description")}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>

        {/*
          Until T-227 this screen had no address input at all and the server
          did not accept one, so an order raised here could only ever inherit
          the project address. That was survivable while site staff could type
          a gate on the waste record; once the customer moved the address to
          the office side, this route had no owner for it.
        */}
        <form.Field name="pickup_address">
          {(field) => (
            <TextAreaField
              field={field as unknown as BoundField}
              label={t("dispatches.field.pickupAddress")}
              optional
              rows={2}
              hint={
                dispatch?.pickup_address_source === "MANUAL"
                  ? t("dispatches.field.pickupAddressTyped")
                  : t("dispatches.pickupAddressHint")
              }
              className="md:col-span-2"
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("dispatches.section.vehicle")}>
        <form.Field
          name="vehicle_plate"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("dispatches.field.vehiclePlate")}
              required
            />
          )}
        </form.Field>
        <form.Field name="driver_name">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("dispatches.field.driverName")}
              optional
            />
          )}
        </form.Field>
        <form.Field name="driver_phone">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("dispatches.field.driverPhone")}
              type="tel"
              optional
            />
          )}
        </form.Field>
        <form.Field name="driver_ic">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("dispatches.field.driverIc")}
              optional
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
export function EditDispatch({ id }: { id: string }) {
  const t = useTranslations();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dispatches", "detail", id],
    queryFn: () => getDispatch(id),
  });

  if (isLoading) return <FormSkeleton sections={3} />;
  if (isError || !data) {
    return (
      <LoadErrorCard backHref="/waste-clearance?kind=dispatch" backLabel={t("dispatches.title")} />
    );
  }
  return <CreateDispatch dispatch={data} />;
}
