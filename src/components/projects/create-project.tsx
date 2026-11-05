"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LocateFixed, Loader2, Plus, Save } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { useFinishForm } from "@/components/shared/dialog-navigation";
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
import { MALAYSIA_STATES } from "@/lib/malaysia";
import {
  createProject,
  getProject,
  getProjectManagerChoices,
  getProjectQuota,
  updateProject,
} from "@/services/contractor.service";

const STATUSES: ProjectStatus[] = [
  "PLANNING",
  "ACTIVE",
  "SUSPENDED",
  "COMPLETED",
];

/**
 * 电子围栏半径 a new project starts at when the company's own default cannot
 * be read: the system's (ContractorSiteSettings.default_geofence_radius_m).
 */
export const SYSTEM_DEFAULT_RADIUS_M = 150;

// Leaflet touches `window`, so the map loads in the browser only.
const GeofenceMapEditor = dynamic(
  () => import("@/components/site-access/geofence-map-editor").then((module) => module.GeofenceMapEditor),
  { ssr: false },
);

/**
 * What 新增项目 sends (JB100, 客户 11-05 事项 3、4).
 *
 * No code - the system numbers the project PRJ-0001 on - and no status - a new
 * project is 「进行中」. An empty radius is left out, so the company's default
 * applies; a radius without a place to centre it on means nothing and is left
 * out too. Empty dates are null rather than "" (the API reads "" as a
 * malformed date).
 */
export function newProjectPayload(value: ProjectFormValues): ProjectPayload {
  const radius = value.geofence_radius_m;
  const located = Boolean(value.latitude && value.longitude);
  return {
    name: value.name,
    client_name: value.client_name,
    main_contractor: value.main_contractor,
    consultant: value.consultant,
    description: value.description,
    address_line_1: value.address_line_1,
    address_line_2: value.address_line_2,
    city: value.city,
    state: value.state,
    postcode: value.postcode,
    site_manager: value.site_manager,
    site_phone: value.site_phone,
    ...(value.manager ? { manager: value.manager } : {}),
    latitude: value.latitude || null,
    longitude: value.longitude || null,
    ...(located && radius ? { geofence_radius_m: Number(radius) } : {}),
    start_date: value.start_date || null,
    end_date: value.end_date || null,
  };
}

export interface ProjectFormValues {
  code: string;
  name: string;
  status: ProjectStatus;
  client_name: string;
  main_contractor: string;
  consultant: string;
  description: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postcode: string;
  latitude: string;
  longitude: string;
  geofence_radius_m: string;
  start_date: string;
  end_date: string;
  site_manager: string;
  site_phone: string;
  /** 项目经理 (JB109): the account the project is handed to. */
  manager: string;
}

/**
 * The project form, shared by create and edit.
 *
 * 新增项目 asks only for what a project needs (JB100, 客户 11-05 事项 3 第 2 点:
 * 「只需要填写项目名称、地址、GPS位置及项目负责人等必要资料，即可建立项目」):
 * name, address, the place - the phone's or the computer's GPS, or a click on
 * the map - with 「电子围栏半径（米）」 already filled with the company's
 * default, and the person in charge. The rest sits under 「更多资料（可选）」,
 * closed. Editing shows everything, status and code included, as before.
 */
export function CreateProject({ project }: { project?: Project }) {
  const t = useTranslations();
  const finish = useFinishForm();
  const queryClient = useQueryClient();
  const isEdit = project !== undefined;
  const [formError, setFormError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(isEdit);
  const [fitSignal, setFitSignal] = useState(0);
  // query-failure: unread, the radius starts at the system's 150 m, which the hint says.
  const quota = useQuery({
    queryKey: ["projects", "quota"],
    queryFn: getProjectQuota,
    enabled: !isEdit,
  });
  // 「总部建立项目后，直接指定项目经理」 (JB109): the company's office people.
  // query-failure: unread, the box offers nobody and says so in its hint.
  const managers = useQuery({
    queryKey: ["projects", "manager-choices"],
    queryFn: getProjectManagerChoices,
  });
  const defaultRadius = String(quota.data?.default_geofence_radius_m ?? SYSTEM_DEFAULT_RADIUS_M);

  const mutation = useMutation({
    mutationFn: (values: ProjectPayload) =>
      isEdit ? updateProject(project.id, values) : createProject(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      finish(isEdit ? `/projects/${project.id}` : "/projects");
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
      geofence_radius_m: isEdit
        ? project?.geofence_radius_m?.toString() ?? ""
        : String(SYSTEM_DEFAULT_RADIUS_M),
      start_date: project?.start_date ?? "",
      end_date: project?.end_date ?? "",
      site_manager: project?.site_manager ?? "",
      site_phone: project?.site_phone ?? "",
      manager: project?.manager ?? "",
    } satisfies ProjectFormValues,
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await mutation.mutateAsync(
          isEdit
            ? {
                ...value,
                manager: value.manager || undefined,
                latitude: value.latitude || null,
                longitude: value.longitude || null,
                geofence_radius_m: value.geofence_radius_m
                  ? Number(value.geofence_radius_m)
                  : null,
                start_date: value.start_date || null,
                end_date: value.end_date || null,
              }
            : newProjectPayload(value),
        );
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

  // The company's default radius arrives after the form opened: put it in,
  // unless somebody has already typed their own.
  useEffect(() => {
    if (isEdit || !quota.data) return;
    if (form.getFieldValue("geofence_radius_m") === String(SYSTEM_DEFAULT_RADIUS_M)) {
      form.setFieldValue("geofence_radius_m", defaultRadius);
    }
  }, [defaultRadius, form, isEdit, quota.data]);

  const setCentre = useCallback(
    (point: [number, number]) => {
      form.setFieldValue("latitude", point[0].toFixed(7));
      form.setFieldValue("longitude", point[1].toFixed(7));
    },
    [form],
  );
  const ignorePoints = useCallback(() => {}, []);

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
          form.setFieldValue("geofence_radius_m", defaultRadius);
        }
        setFitSignal((value) => value + 1);
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

  const text = (
    name: keyof ProjectFormValues,
    label: string,
    options: { className?: string; type?: string } = {},
  ) => (
    <form.Field name={name}>
      {(field) => (
        <TextField
          field={field as unknown as BoundField}
          label={label}
          type={options.type}
          optional
          className={options.className}
        />
      )}
    </form.Field>
  );

  return (
    <FormShell
      backHref={isEdit ? `/projects/${project.id}` : "/projects"}
      backLabel={isEdit ? project.name : t("projects.title")}
      title={isEdit ? t("projects.editTitle") : t("projects.createTitle")}
      isSubmitting={mutation.isPending}
      submitLabel={isEdit ? t("common.save") : t("common.create")}
      submitIcon={isEdit ? Save : Plus}
      onSubmit={() => void form.handleSubmit()}
    >
      <FormSection title={t("projects.section.identity")}>
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

        {/*
          项目负责人 (客户 11-05 事项 3 第 2 点) is an account now (JB109,
          11-06 事项 4 第 1 点: 「总部建立项目后，直接指定项目经理，系统自动将
          项目分配给该项目经理，不需要重复添加人员」): choosing one puts them on
          the team as the project's 项目经理, and their name on the project.
        */}
        <form.Field name="manager">
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("projects.field.projectLead")}
              optional
              placeholder={t("projects.manager.placeholder")}
              hint={
                managers.isError
                  ? t("projects.manager.loadError")
                  : managers.data && managers.data.length === 0
                    ? t("projects.manager.none")
                    : t("projects.manager.hint")
              }
              options={(managers.data ?? []).map((person) => ({
                value: person.id,
                label: person.role_name
                  ? `${person.full_name} · ${person.role_name}`
                  : person.full_name,
              }))}
            />
          )}
        </form.Field>

        {isEdit && (
          <>
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
          </>
        )}
        {!isEdit && (
          <p className="self-end text-xs text-muted-foreground md:col-span-2 xl:col-span-1" data-testid="project-code-auto">
            {t("projects.codeAuto")}
          </p>
        )}
      </FormSection>

      <FormSection title={t("projects.section.address")}>
        {text("address_line_1", t("projects.field.addressLine1"), { className: "md:col-span-2" })}
        {text("address_line_2", t("projects.field.addressLine2"), { className: "md:col-span-2" })}
        {text("city", t("projects.field.city"))}
        <form.Field name="state">
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("projects.field.state")}
              options={[
                ...(!MALAYSIA_STATES.some((state) => state === field.state.value)
                  && field.state.value
                  ? [{ value: field.state.value, label: field.state.value }]
                  : []),
                ...MALAYSIA_STATES.map((state) => ({ value: state, label: state })),
              ]}
              optional
            />
          )}
        </form.Field>
        {text("postcode", t("projects.field.postcode"))}
      </FormSection>

      <FormSection title={t("projects.section.location")}>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2 xl:col-span-3">
          <Button
            type="button"
            variant="outline"
            disabled={isLocating}
            onClick={captureProjectLocation}
          >
            {isLocating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LocateFixed className="size-4" />
            )}
            {t("projects.location.capture")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("projects.location.captureOrMap")}
          </p>
          {locationError && (
            <p role="alert" className="w-full text-sm text-destructive">
              {locationError}
            </p>
          )}
        </div>
        <form.Subscribe
          selector={(state) => [state.values.latitude, state.values.longitude, state.values.geofence_radius_m] as const}
        >
          {([latitude, longitude, radius]) => (
            <div className="h-64 overflow-hidden rounded-lg border md:col-span-2 xl:col-span-3" data-testid="project-map">
              <GeofenceMapEditor
                shape="CIRCLE"
                center={latitude && longitude ? [Number(latitude), Number(longitude)] : undefined}
                radiusM={Number(radius) || Number(defaultRadius)}
                points={[]}
                editing
                fitSignal={fitSignal}
                backLabel={t("projects.location.backToPlace")}
                onCenter={setCentre}
                onPoints={ignorePoints}
              />
            </div>
          )}
        </form.Subscribe>
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
        {/* 「电子围栏半径（米）」 (事项 3 第 4 点): filled with the default, changeable. */}
        <form.Field name="geofence_radius_m">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("projects.field.geofenceRadiusM")}
              hint={t("projects.geofenceDefaultHint", { metres: defaultRadius })}
              type="number"
              min={1}
              step={1}
              optional
            />
          )}
        </form.Field>
      </FormSection>

      <div className="px-4 sm:px-6">
        <Button
          type="button"
          variant="ghost"
          aria-expanded={showMore}
          data-testid="project-more-toggle"
          onClick={() => setShowMore((open) => !open)}
        >
          <ChevronDown className={showMore ? "rotate-180 transition-transform" : "transition-transform"} />
          {t("projects.section.more")}
        </Button>
      </div>
      {showMore && (
        <FormSection title={t("projects.section.more")}>
          {text("client_name", t("projects.field.clientName"))}
          {text("main_contractor", t("projects.field.mainContractor"))}
          {text("consultant", t("projects.field.consultant"))}
          {text("site_phone", t("projects.field.sitePhone"), { type: "tel" })}
          {text("start_date", t("projects.field.startDate"), { type: "date" })}
          {text("end_date", t("projects.field.endDate"), { type: "date" })}
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
      )}

      {formError && (
        <p className="px-4 pb-3 text-sm font-medium text-destructive sm:px-6">
          {formError}
        </p>
      )}
    </FormShell>
  );
}

/** Fetches the record, then hands it to the shared form. */
export function EditProject({ id }: { id: string }) {
  const t = useTranslations();
  const { data, isLoading, isLoadingError } = useQuery({
    queryKey: ["projects", "detail", id],
    queryFn: () => getProject(id),
  });

  if (isLoading) return <FormSkeleton sections={5} />;
  if (isLoadingError || !data) {
    return <LoadErrorCard backHref="/projects" backLabel={t("projects.title")} />;
  }
  return <CreateProject project={data} />;
}
