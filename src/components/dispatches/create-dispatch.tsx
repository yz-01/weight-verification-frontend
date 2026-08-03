"use client";

import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  SelectField,
  TextAreaField,
  TextField,
  type BoundField,
} from "@/components/shared/form-fields";
import {
  FormSection,
  FormShell,
  FormSkeleton,
  LoadErrorCard,
  applyServerErrors,
  required,
} from "@/components/shared/form-shell";
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = dispatch !== undefined;
  const [formError, setFormError] = useState<string | null>(null);

  const { data: projectPage } = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () => getProjects({ page_size: 100 }),
  });

  const mutation = useMutation({
    mutationFn: (values: WasteDispatchPayload) =>
      isEdit ? updateDispatch(dispatch.id, values) : createDispatch(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dispatches"] });
      router.push("/dispatches");
    },
  });

  const form = useForm({
    defaultValues: {
      project: dispatch?.project ?? "",
      recycler: dispatch?.recycler ?? "",
      waste_type: (dispatch?.waste_type ?? "MIXED") as WasteType,
      estimated_weight_kg: dispatch?.estimated_weight_kg ?? "",
      description: dispatch?.description ?? "",
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
  const { data: recyclers } = useQuery({
    queryKey: ["recyclers", "options", projectId],
    queryFn: () => getRecyclerOptions(projectId),
    enabled: projectId !== "",
  });

  const recyclerOptions = (recyclers?.results ?? []).map((recycler) => ({
    value: recycler.id,
    label: recycler.city ? `${recycler.name} — ${recycler.city}` : recycler.name,
  }));

  return (
    <FormShell
      backHref="/dispatches"
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
            <SelectField
              field={field as unknown as BoundField}
              label={t("dispatches.field.project")}
              options={(projectPage?.results ?? []).map((project) => ({
                value: project.id,
                label: `${project.code} — ${project.name}`,
              }))}
              required
            />
          )}
        </form.Field>

        <form.Field
          name="recycler"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("dispatches.field.recycler")}
              options={recyclerOptions}
              required
              hint={
                projectId !== "" && recyclerOptions.length === 0
                  ? t("dispatches.recyclerEmpty")
                  : undefined
              }
            />
          )}
        </form.Field>

        {/*
          Spelled out rather than left implicit: a site clerk hunting for a
          haulier that is not on the list needs to know why, and that the fix
          is the recycler registering rather than a workaround here.
        */}
        <p className="flex items-start gap-2 text-xs text-muted-foreground md:col-span-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
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
      <LoadErrorCard backHref="/dispatches" backLabel={t("dispatches.title")} />
    );
  }
  return <CreateDispatch dispatch={data} />;
}
