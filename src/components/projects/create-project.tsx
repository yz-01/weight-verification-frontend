"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LocateFixed, Loader2, Plus, Save } from "lucide-react";
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
  FormSkeleton,
  LoadErrorCard,
  applyServerErrors,
  required,
} from "@/components/shared/form-shell";
import { ApiError } from "@/interfaces/api";
import { Button } from "@/components/ui/button";
import type {
  Project,
  ProjectPayload,
  ProjectStatus,
} from "@/interfaces/contractor";
import {
  createProject,
  getProject,
  updateProject,
} from "@/services/contractor.service";

const STATUSES: ProjectStatus[] = [
  "PLANNING",
  "ACTIVE",
  "SUSPENDED",
  "COMPLETED",
];

/** The project form, shared by create and edit. */
export function CreateProject({ project }: { project?: Project }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = project !== undefined;
  const [formError, setFormError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (values: ProjectPayload) =>
      isEdit ? updateProject(project.id, values) : createProject(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      router.push("/projects");
    },
  });

  const form = useForm({
    defaultValues: {
      code: project?.code ?? "",
      name: project?.name ?? "",
      status: (project?.status ?? "ACTIVE") as ProjectStatus,
      client_name: project?.client_name ?? "",
      main_contractor: project?.main_contractor ?? "",
      consultant: project?.consultant ?? "",
      description: project?.description ?? "",
      address_line_1: project?.address_line_1 ?? "",
      address_line_2: project?.address_line_2 ?? "",
      city: project?.city ?? "",
      state: project?.state ?? "",
      postcode: project?.postcode ?? "",
      latitude: project?.latitude ?? "",
      longitude: project?.longitude ?? "",
      geofence_radius_m: project?.geofence_radius_m?.toString() ?? "",
      start_date: project?.start_date ?? "",
      end_date: project?.end_date ?? "",
      site_manager: project?.site_manager ?? "",
      site_phone: project?.site_phone ?? "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        // Empty date inputs come through as "", which the API reads as a
        // malformed date rather than as "not set".
        await mutation.mutateAsync({
          ...value,
          latitude: value.latitude || null,
          longitude: value.longitude || null,
          geofence_radius_m: value.geofence_radius_m
            ? Number(value.geofence_radius_m)
            : null,
          start_date: value.start_date || null,
          end_date: value.end_date || null,
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

  function captureProjectLocation() {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError(t("projects.location.unsupported"));
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        form.setFieldValue("latitude", position.coords.latitude.toFixed(7));
        form.setFieldValue("longitude", position.coords.longitude.toFixed(7));
        if (!form.getFieldValue("geofence_radius_m")) {
          form.setFieldValue("geofence_radius_m", "100");
        }
        setIsLocating(false);
      },
      (error) => {
        const key =
          error.code === error.PERMISSION_DENIED
            ? "permissionDenied"
            : error.code === error.POSITION_UNAVAILABLE
              ? "unavailable"
              : "timeout";
        setLocationError(t(`projects.location.${key}`));
        setIsLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );
  }

  return (
    <FormShell
      backHref="/projects"
      backLabel={t("projects.title")}
      title={isEdit ? t("projects.editTitle") : t("projects.createTitle")}
      isSubmitting={mutation.isPending}
      submitLabel={isEdit ? t("common.save") : t("common.create")}
      submitIcon={isEdit ? Save : Plus}
      onSubmit={() => void form.handleSubmit()}
    >
      <FormSection title={t("projects.section.identity")}>
        <form.Field
          name="code"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("projects.field.code")}
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
              label={t("projects.field.name")}
              required
            />
          )}
        </form.Field>

        <form.Field name="status">
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("projects.field.status")}
              options={STATUSES.map((status) => ({
                value: status,
                label: t(`projects.status.${status}`),
              }))}
              required
            />
          )}
        </form.Field>

        <form.Field name="client_name">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("projects.field.clientName")}
              optional
            />
          )}
        </form.Field>

        <form.Field name="main_contractor">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("projects.field.mainContractor")}
              optional
            />
          )}
        </form.Field>

        <form.Field name="consultant">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("projects.field.consultant")}
              optional
            />
          )}
        </form.Field>

        <form.Field name="description">
          {(field) => (
            <TextAreaField
              field={field as unknown as BoundField}
              label={t("projects.field.description")}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("projects.section.address")}>
        <form.Field name="address_line_1">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("projects.field.addressLine1")}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>
        <form.Field name="address_line_2">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("projects.field.addressLine2")}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>
        <form.Field name="city">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("projects.field.city")}
              optional
            />
          )}
        </form.Field>
        <form.Field name="state">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("projects.field.state")}
              optional
            />
          )}
        </form.Field>
        <form.Field name="postcode">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("projects.field.postcode")}
              optional
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("projects.section.location")}>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLocating}
            onClick={captureProjectLocation}
          >
            {isLocating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LocateFixed className="h-4 w-4" />
            )}
            {t("projects.location.capture")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("projects.location.captureHint")}
          </p>
          {locationError && (
            <p role="alert" className="w-full text-sm text-destructive">
              {locationError}
            </p>
          )}
        </div>
        <form.Field name="latitude">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("projects.field.latitude")}
              type="number"
              min={-90}
              max={90}
              step="0.0000001"
              optional
            />
          )}
        </form.Field>
        <form.Field name="longitude">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("projects.field.longitude")}
              type="number"
              min={-180}
              max={180}
              step="0.0000001"
              optional
            />
          )}
        </form.Field>
        <form.Field name="geofence_radius_m">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("projects.field.geofenceRadius")}
              hint={t("projects.geofenceHint")}
              type="number"
              min={1}
              step={1}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("projects.section.schedule")}>
        <form.Field name="start_date">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("projects.field.startDate")}
              type="date"
              optional
            />
          )}
        </form.Field>
        <form.Field name="end_date">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("projects.field.endDate")}
              type="date"
              optional
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("projects.section.contact")}>
        <form.Field name="site_manager">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("projects.field.siteManager")}
              optional
            />
          )}
        </form.Field>
        <form.Field name="site_phone">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("projects.field.sitePhone")}
              type="tel"
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
export function EditProject({ id }: { id: string }) {
  const t = useTranslations();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["projects", "detail", id],
    queryFn: () => getProject(id),
  });

  if (isLoading) return <FormSkeleton sections={5} />;
  if (isError || !data) {
    return <LoadErrorCard backHref="/projects" backLabel={t("projects.title")} />;
  }
  return <CreateProject project={data} />;
}
