"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Cable,
  Check,
  CircleHelp,
  History,
  Activity,
  Pencil,
  Plus,
  RefreshCw,
  TerminalSquare,
  TestTube2,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  ListHeader,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CompanyType } from "@/interfaces/company";
import type {
  DeviceCommand,
  DeviceCommandKind,
  DeviceCommandState,
  DeviceTelemetry,
  IntegrationConfig,
  IntegrationDelivery,
  IntegrationDevice,
  IntegrationDevicePayload,
  IntegrationKind,
} from "@/interfaces/integration";
import { getProjects } from "@/services/contractor.service";
import { getCompanies } from "@/services/companies.service";
import {
  createIntegration,
  closeDeviceCommand,
  createIntegrationDevice,
  deleteIntegration,
  deleteIntegrationDevice,
  getDeviceCommands,
  getDeviceTelemetry,
  getIntegrationDevices,
  getIntegrationDeliveries,
  getIntegrationEventCatalogue,
  getIntegrations,
  issueDeviceCommand,
  testIntegration,
  updateIntegrationDevice,
  updateIntegration,
} from "@/services/integration.service";
import { getScales, getSites } from "@/services/weighing.service";

const KINDS: IntegrationKind[] = [
  "ERP",
  "ACCOUNTING",
  "MYINVOIS",
  "GOVERNMENT_API",
  "API_GATEWAY",
  "CCTV",
  "ANPR",
  "ACCESS_CONTROL",
  "RFID",
  "FACE_RECOGNITION",
  "VISITOR_MANAGEMENT",
  "IOT",
  "AI",
  "DRONE",
  "TOWER_CRANE",
  "RF",
  "WEBHOOK",
];

/**
 * Which way the data moves, and which kinds share one pipe.
 *
 * An audit asked whether seventeen integration types were seventeen features.
 * Mostly they are three shared, audited pipes with seventeen filing labels -
 * a sound design that was invisible on this screen, so "there is a DRONE
 * option" read as "there is drone-specific functionality". These two tables
 * are what let the screen say otherwise. They mirror
 * `integrations/catalogue.py`, and a backend test fails if they drift.
 */
const OUTBOUND_KINDS: IntegrationKind[] = [
  "ERP",
  "ACCOUNTING",
  "MYINVOIS",
  "GOVERNMENT_API",
  "WEBHOOK",
  "API_GATEWAY",
];

const SHARED_CHANNEL: Partial<Record<IntegrationKind, "TELEMETRY" | "ACCESS">> =
  {
    IOT: "TELEMETRY",
    AI: "TELEMETRY",
    DRONE: "TELEMETRY",
    TOWER_CRANE: "TELEMETRY",
    RF: "TELEMETRY",
    ANPR: "ACCESS",
    ACCESS_CONTROL: "ACCESS",
    RFID: "ACCESS",
    FACE_RECOGNITION: "ACCESS",
    VISITOR_MANAGEMENT: "ACCESS",
  };

function directionOf(kind: IntegrationKind) {
  if (kind === "API_GATEWAY") return "BOTH";
  return OUTBOUND_KINDS.includes(kind) ? "OUTBOUND" : "INBOUND";
}

/** What this is for, in words the person choosing it can check. */
function KindHelp({ kind }: { kind: IntegrationKind }) {
  const t = useTranslations();
  const channel = SHARED_CHANNEL[kind];
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          {t(`integrations.kindHelp.${kind}.title`)}
        </span>
        <TypeBadge
          label={t(`integrations.kindHelp.direction.${directionOf(kind)}`)}
        />
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {t(`integrations.kindHelp.${kind}.what`)}
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        <span className="font-medium text-foreground">
          {t("integrations.kindHelp.needsLabel")}
        </span>{" "}
        {t(`integrations.kindHelp.${kind}.needs`)}
      </p>
      {channel && (
        <p className="rounded border-l-2 border-info/40 bg-info/5 px-2 py-1.5 text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">
            {t("integrations.sharedChannelTitle")}
          </span>{" "}
          {t(`integrations.kindHelp.channel.${channel}`)}
        </p>
      )}
    </div>
  );
}

/**
 * Which business events this connection is sent.
 *
 * Ticking nothing is allowed and is called out loudly, because an enabled
 * connection subscribed to nothing is exactly the failure this whole screen
 * came from: it looks configured, it tests green, and it never sends a byte.
 */
function EventPicker({
  available,
  selected,
  onChange,
  disabled,
}: {
  available: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations();
  if (available.length === 0) return null;
  const toggle = (name: string) =>
    onChange(
      selected.includes(name)
        ? selected.filter((item) => item !== name)
        : [...selected, name],
    );
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">
        {t("integrations.eventsTitle")}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("integrations.eventsHelp")}
      </p>
      <ul className="space-y-1.5">
        {available.map((name) => (
          <li key={name} className="flex items-start gap-2">
            <input
              id={`event-${name}`}
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border"
              checked={selected.includes(name)}
              disabled={disabled}
              onChange={() => toggle(name)}
            />
            <label htmlFor={`event-${name}`} className="cursor-pointer text-sm">
              <span className="font-medium text-foreground">
                {t(`integrations.event.${name}.title`)}
              </span>
              <span className="block text-xs leading-5 text-muted-foreground">
                {t(`integrations.event.${name}.what`)}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {selected.length === 0 && (
        <p className="rounded-md bg-warning/12 px-3 py-2 text-xs font-medium text-warning">
          {t("integrations.noEventsSelected")}
        </p>
      )}
    </div>
  );
}

const AUTH_TYPES = ["NONE", "API_KEY", "BEARER", "BASIC", "OAUTH2"];

const DEFAULT_DEVICE: IntegrationDevicePayload = {
  device_type: "EDGE_GATEWAY",
  device_id: "",
  integration: null,
  site: null,
  project: null,
  scale: null,
  firmware_version: "",
  secret: "",
};

export function Integrations() {
  const t = useTranslations();
  const { can, user } = useAuth();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [company, setCompany] = useState(
    searchParams.get("company") ?? user?.company ?? "",
  );
  const [kind, setKind] = useState<IntegrationKind>("ERP");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [authType, setAuthType] = useState("NONE");
  const [mode, setMode] = useState<"SIMULATED" | "LIVE">("SIMULATED");
  // Left null until the operator touches it: null means "whatever the server
  // says this kind should have", which is what create does when nothing is
  // sent. Once they tick or untick anything, their choice is what goes.
  const [events, setEvents] = useState<string[] | null>(null);

  // Which events this kind may be sent is the server's decision, fetched
  // rather than restated here: a second copy of that table in the console is
  // how a checkbox appears for something nothing would ever send.
  const eventCatalogue = useQuery({
    queryKey: ["integration-event-catalogue"],
    queryFn: getIntegrationEventCatalogue,
  });
  const availableEvents = useMemo(
    () =>
      (eventCatalogue.data ?? [])
        .filter((row) => row.kinds.includes(kind))
        .map((row) => row.event_type),
    [eventCatalogue.data, kind],
  );
  const [secret, setSecret] = useState("");
  const [device, setDevice] =
    useState<IntegrationDevicePayload>(DEFAULT_DEVICE);
  const [editingDevice, setEditingDevice] = useState<IntegrationDevice | null>(
    null,
  );
  const [removingDevice, setRemovingDevice] =
    useState<IntegrationDevice | null>(null);
  const [removingIntegration, setRemovingIntegration] =
    useState<IntegrationConfig | null>(null);
  const [historyIntegration, setHistoryIntegration] =
    useState<IntegrationConfig | null>(null);
  const [provisionedDevice, setProvisionedDevice] =
    useState<IntegrationDevice | null>(null);
  const [consoleDevice, setConsoleDevice] = useState<IntegrationDevice | null>(
    null,
  );
  const [telemetryDevice, setTelemetryDevice] =
    useState<IntegrationDevice | null>(null);

  const companies = useQuery({
    queryKey: ["companies", "integration-options"],
    queryFn: () => getCompanies({ page_size: 100, sort_by: "name" }),
    enabled: Boolean(user?.is_platform_staff),
  });
  const selectedCompany = user?.is_platform_staff
    ? company
    : (user?.company ?? "");
  const selectedCompanyType = useMemo<CompanyType | null>(() => {
    if (!selectedCompany) return null;
    if (!user?.is_platform_staff) return user?.company_type ?? null;
    return (
      companies.data?.results.find((item) => item.id === selectedCompany)
        ?.type ?? null
    );
  }, [companies.data?.results, selectedCompany, user]);
  const canManageHardware =
    can("integration.manage") &&
    (Boolean(user?.is_platform_staff) || selectedCompanyType !== "RECYCLER");
  const companyQuery = user?.is_platform_staff
    ? { company: selectedCompany }
    : {};
  const integrations = useQuery({
    queryKey: ["integrations", selectedCompany],
    queryFn: () => getIntegrations(companyQuery),
    enabled: Boolean(selectedCompany),
  });
  const devices = useQuery({
    queryKey: ["integration-devices", selectedCompany],
    queryFn: () => getIntegrationDevices(companyQuery),
    enabled: Boolean(selectedCompany),
  });
  const projects = useQuery({
    queryKey: ["projects", "integration-options", selectedCompany],
    queryFn: () =>
      getProjects({ ...companyQuery, page_size: 100, sort_by: "name" }),
    enabled: Boolean(selectedCompany && selectedCompanyType === "CONTRACTOR"),
  });
  const sites = useQuery({
    queryKey: ["sites", "integration-options", selectedCompany],
    queryFn: () =>
      getSites({ ...companyQuery, page_size: 100, sort_by: "name" }),
    enabled: Boolean(selectedCompany && selectedCompanyType === "RECYCLER"),
  });
  const scales = useQuery({
    queryKey: ["scales", "integration-options", selectedCompany, device.site],
    queryFn: () =>
      getScales({
        ...companyQuery,
        ...(device.site ? { site: device.site } : {}),
        page_size: 100,
        sort_by: "name",
      }),
    enabled: Boolean(selectedCompany && selectedCompanyType === "RECYCLER"),
  });

  const create = useMutation({
    mutationFn: () =>
      createIntegration(
        {
          kind,
          name: name.trim(),
          base_url: baseUrl.trim(),
          auth_type: authType.trim() || "NONE",
          secret,
          settings: { mode },
          ...(events === null ? {} : { subscribed_events: events }),
          is_enabled: false,
        },
        user?.is_platform_staff ? selectedCompany : undefined,
      ),
    onSuccess: () => {
      setName("");
      setBaseUrl("");
      setSecret("");
      setMode("SIMULATED");
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });
  const createDevice = useMutation({
    mutationFn: () => {
      const payload: IntegrationDevicePayload = {
        ...device,
        device_id: device.device_id.trim(),
        device_type: device.device_type.trim(),
        integration: device.integration || null,
        project:
          selectedCompanyType === "CONTRACTOR" ? device.project || null : null,
        site: selectedCompanyType === "RECYCLER" ? device.site || null : null,
        scale: selectedCompanyType === "RECYCLER" ? device.scale || null : null,
        firmware_version: device.firmware_version?.trim() || "",
        secret: device.secret || "",
      };
      return createIntegrationDevice(
        payload,
        user?.is_platform_staff ? selectedCompany : undefined,
      );
    },
    onSuccess: (createdDevice) => {
      setProvisionedDevice(createdDevice);
      setDevice(DEFAULT_DEVICE);
      void queryClient.invalidateQueries({ queryKey: ["integration-devices"] });
    },
  });
  const removeDevice = useMutation({
    mutationFn: (item: IntegrationDevice) =>
      deleteIntegrationDevice(
        item.id,
        user?.is_platform_staff ? selectedCompany : undefined,
      ),
    onSuccess: () => {
      setRemovingDevice(null);
      void queryClient.invalidateQueries({ queryKey: ["integration-devices"] });
    },
  });
  const toggle = useMutation({
    mutationFn: (integration: IntegrationConfig) =>
      updateIntegration(integration.id, {
        is_enabled: !integration.is_enabled,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });
  const test = useMutation({
    mutationFn: (integration: IntegrationConfig) =>
      testIntegration(
        integration.id,
        user?.is_platform_staff ? selectedCompany : undefined,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });
  const changeMode = useMutation({
    mutationFn: ({
      integration,
      value,
    }: {
      integration: IntegrationConfig;
      value: "SIMULATED" | "LIVE";
    }) =>
      updateIntegration(integration.id, {
        settings: { ...integration.settings, mode: value },
        is_enabled: false,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });
  const removeIntegration = useMutation({
    mutationFn: (integration: IntegrationConfig) =>
      deleteIntegration(
        integration.id,
        user?.is_platform_staff ? selectedCompany : undefined,
      ),
    onSuccess: () => {
      setRemovingIntegration(null);
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });

  const rows = useMemo(
    () => integrations.data?.results ?? [],
    [integrations.data?.results],
  );
  const integrationOptions = useMemo(
    () =>
      rows.map((row) => ({
        value: row.id,
        label: `${row.kind} / ${row.name}`,
      })),
    [rows],
  );
  const projectOptions = useMemo(
    () =>
      (projects.data?.results ?? []).map((project) => ({
        value: project.id,
        label: `${project.code} / ${project.name}`,
      })),
    [projects.data?.results],
  );
  const siteOptions = useMemo(
    () =>
      (sites.data?.results ?? []).map((site) => ({
        value: site.id,
        label: `${site.code} / ${site.name}`,
      })),
    [sites.data?.results],
  );
  const scaleOptions = useMemo(
    () =>
      (scales.data?.results ?? []).map((scale) => ({
        value: scale.id,
        label: `${scale.code} / ${scale.name}`,
      })),
    [scales.data?.results],
  );

  return (
    <div className="space-y-6">
      <ListHeader
        title={t("integrations.title")}
        subtitle={t("integrations.subtitle")}
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={integrations.isFetching || devices.isFetching}
            onClick={() => {
              void integrations.refetch();
              void devices.refetch();
            }}
          >
            <RefreshCw
              className={
                integrations.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"
              }
            />
            {t("common.refresh")}
          </Button>
        }
      />

      <div className="rounded-lg border border-primary/15 bg-primary/[0.035] px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <CircleHelp className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">
              {t("integrations.guide.title")}
            </p>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">
              {t("integrations.guide.description")}
            </p>
          </div>
        </div>
        <div className="mt-4 grid border-t sm:grid-cols-3 sm:divide-x">
          {["register", "test", "enable"].map((step, index) => (
            <div
              key={step}
              className="flex gap-2.5 px-3 py-3 first:pl-0 last:pr-0"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <div>
                <p className="text-xs font-semibold">
                  {t(`integrations.guide.${step}.title`)}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {t(`integrations.guide.${step}.description`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {user?.is_platform_staff && (
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="integration-company">
            {t("integrations.company")}
          </Label>
          <select
            id="integration-company"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={company}
            onChange={(event) => {
              setCompany(event.target.value);
              setDevice(DEFAULT_DEVICE);
            }}
          >
            <option value="">{t("integrations.chooseCompany")}</option>
            {(companies.data?.results ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} / {item.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedCompany && can("integration.manage") && (
        <section className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">
              {t("integrations.newTitle")}
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label={t("integrations.field.kind")}>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as IntegrationKind)
                }
              >
                {KINDS.map((value) => (
                  <option key={value} value={value}>
                    {t(`integrations.kind.${value}`)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="md:col-span-2 xl:col-span-3">
              <KindHelp kind={kind} />
            </div>
            <Field label={t("integrations.field.name")}>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("integrations.field.namePlaceholder")}
              />
            </Field>
            <Field label={t("integrations.field.baseUrl")}>
              <Input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://..."
              />
            </Field>
            <Field label={t("integrations.field.authType")}>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={authType}
                onChange={(event) => setAuthType(event.target.value)}
              >
                {AUTH_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {t(`integrations.authType.${value}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("integrations.field.mode")}>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={mode}
                onChange={(event) =>
                  setMode(event.target.value as "SIMULATED" | "LIVE")
                }
              >
                <option value="SIMULATED">
                  {t("monitoring.mode.SIMULATED")}
                </option>
                <option value="LIVE">{t("monitoring.mode.LIVE")}</option>
              </select>
            </Field>
            <Field label={t("integrations.field.secret")}>
              <Input
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder={t("integrations.field.secretPlaceholder")}
              />
            </Field>
          </div>
          {directionOf(kind) !== "INBOUND" && (
            <EventPicker
              available={availableEvents}
              selected={events ?? availableEvents}
              onChange={setEvents}
            />
          )}
          <p className="rounded-md border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
            {t("integrations.guide.description")}
          </p>
          <Button
            requires={[
              [name, t("integrations.field.name")],
              [mode !== "LIVE" || baseUrl, t("integrations.field.baseUrl")],
            ]}
            disabled={create.isPending}
            onClick={() => void create.mutateAsync()}
          >
            <Check className="h-4 w-4" />
            {t("integrations.action.create")}
          </Button>
          {create.isError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {create.error instanceof Error
                ? create.error.message
                : t("common.unknownError")}
            </p>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Cable className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">
            {t("integrations.connections")}
          </h2>
        </div>
        <div className="divide-y overflow-hidden rounded-lg border bg-card shadow-sm">
          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t("integrations.empty")}
            </p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="grid gap-3 px-3 py-3 md:grid-cols-[1fr_auto_auto] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t(`integrations.kind.${row.kind}`)}
                    {row.base_url ? ` / ${row.base_url}` : ""}
                  </p>
                  {(row.last_success_at || row.last_error) && (
                    <p
                      className={`mt-1 truncate text-xs ${
                        row.last_error ? "text-destructive" : "text-success"
                      }`}
                      title={row.last_error || undefined}
                    >
                      {row.last_error
                        ? t("integrations.test.failedDetail", {
                            error: row.last_error,
                          })
                        : t("integrations.test.passedAt", {
                            date: new Date(
                              row.last_success_at as string,
                            ).toLocaleString(),
                          })}
                    </p>
                  )}
                </div>
                <StatusBadge
                  label={t(`integrations.status.${row.status}`)}
                  tone={
                    row.status === "ERROR"
                      ? "danger"
                      : row.status === "READY"
                        ? "positive"
                        : "neutral"
                  }
                />
                <div className="flex flex-wrap justify-end gap-2">
                  {can("integration.manage") && (
                    <select
                      className="h-9 rounded-md border bg-background px-2 text-xs"
                      aria-label={t("integrations.field.mode")}
                      value={
                        String(
                          row.settings?.mode ?? "SIMULATED",
                        ).toUpperCase() === "LIVE"
                          ? "LIVE"
                          : "SIMULATED"
                      }
                      disabled={changeMode.isPending}
                      onChange={(event) =>
                        changeMode.mutate({
                          integration: row,
                          value: event.target.value as "SIMULATED" | "LIVE",
                        })
                      }
                    >
                      <option value="SIMULATED">
                        {t("monitoring.mode.SIMULATED")}
                      </option>
                      <option value="LIVE">{t("monitoring.mode.LIVE")}</option>
                    </select>
                  )}
                  <TypeBadge
                    label={t(
                      `monitoring.mode.${String(row.settings?.mode ?? "SIMULATED").toUpperCase() === "LIVE" ? "LIVE" : "SIMULATED"}`,
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title={t("integrations.history.action")}
                    aria-label={t("integrations.history.action")}
                    onClick={() => setHistoryIntegration(row)}
                  >
                    <History className="h-4 w-4" />
                  </Button>
                  {can("integration.manage") && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={test.isPending}
                        onClick={() => void test.mutateAsync(row)}
                      >
                        <TestTube2 className="h-4 w-4" />
                        {t("integrations.action.test")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={t("common.remove")}
                        aria-label={t("common.remove")}
                        disabled={removeIntegration.isPending}
                        onClick={() => setRemovingIntegration(row)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={row.is_enabled ? "destructive" : "default"}
                        size="sm"
                        disabled={toggle.isPending}
                        onClick={() => void toggle.mutateAsync(row)}
                      >
                        {row.is_enabled
                          ? t("integrations.action.disable")
                          : t("integrations.action.enable")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {selectedCompany && (
        <section className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">{t("integrations.devices")}</h2>
          {canManageHardware && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label={t("integrations.device.type")}>
                <Input
                  value={device.device_type}
                  onChange={(event) =>
                    setDevice({ ...device, device_type: event.target.value })
                  }
                />
              </Field>
              <Field label={t("integrations.device.id")}>
                <Input
                  value={device.device_id}
                  onChange={(event) =>
                    setDevice({ ...device, device_id: event.target.value })
                  }
                />
              </Field>
              <Field label={t("integrations.device.integration")}>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={device.integration ?? ""}
                  onChange={(event) =>
                    setDevice({
                      ...device,
                      integration: event.target.value || null,
                    })
                  }
                >
                  <option value="">{t("integrations.device.unlinked")}</option>
                  {integrationOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
              {selectedCompanyType === "CONTRACTOR" && (
                <Field label={t("integrations.device.project")}>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={device.project ?? ""}
                    onChange={(event) =>
                      setDevice({
                        ...device,
                        project: event.target.value || null,
                        site: null,
                        scale: null,
                      })
                    }
                  >
                    <option value="">
                      {t("integrations.device.unlinked")}
                    </option>
                    {projectOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {selectedCompanyType === "RECYCLER" && (
                <>
                  <Field label={t("integrations.device.site")}>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={device.site ?? ""}
                      onChange={(event) =>
                        setDevice({
                          ...device,
                          site: event.target.value || null,
                          project: null,
                          scale: null,
                        })
                      }
                    >
                      <option value="">
                        {t("integrations.device.unlinked")}
                      </option>
                      {siteOptions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("integrations.device.scale")}>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={device.scale ?? ""}
                      onChange={(event) =>
                        setDevice({
                          ...device,
                          scale: event.target.value || null,
                        })
                      }
                    >
                      <option value="">
                        {t("integrations.device.unlinked")}
                      </option>
                      {scaleOptions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
              <Field label={t("integrations.device.firmware")}>
                <Input
                  value={device.firmware_version ?? ""}
                  onChange={(event) =>
                    setDevice({
                      ...device,
                      firmware_version: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label={t("integrations.device.secret")}>
                <Input
                  type="password"
                  value={device.secret ?? ""}
                  onChange={(event) =>
                    setDevice({ ...device, secret: event.target.value })
                  }
                  placeholder={t("integrations.device.secretPlaceholder")}
                />
              </Field>
              <div className="flex items-end xl:justify-end">
                <Button
                  requires={[[device.device_id, t("integrations.device.id")]]}
                  disabled={createDevice.isPending}
                  onClick={() => void createDevice.mutateAsync()}
                >
                  <Plus className="h-4 w-4" />
                  {t("integrations.action.registerDevice")}
                </Button>
              </div>
            </div>
          )}
          <div className="divide-y overflow-hidden rounded-md border">
            {(devices.data?.results ?? []).map((item) => (
              <div
                key={item.id}
                className="grid gap-3 px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-mono">{item.device_id}</p>
                  <p className="truncate text-muted-foreground">
                    {item.device_type} /{" "}
                    {item.integration_name ?? t("integrations.device.unlinked")}
                    {item.gateway_device_id
                      ? ` / ${t("integrations.device.gatewayLinked")}`
                      : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[
                      item.project_name
                        ? `${t("integrations.device.project")}: ${item.project_name}`
                        : null,
                      item.site_name
                        ? `${t("integrations.device.site")}: ${item.site_name}`
                        : null,
                      item.scale_name
                        ? `${t("integrations.device.scale")}: ${item.scale_name}`
                        : null,
                      item.firmware_version
                        ? `${t("integrations.device.firmware")}: ${item.firmware_version}`
                        : null,
                      item.has_secret
                        ? t("integrations.device.secretStored")
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" / ") || t("integrations.device.noBinding")}
                  </p>
                </div>
                <div className="flex items-center gap-2 md:justify-end">
                  <StatusBadge
                    label={
                      item.is_online
                        ? t("integrations.device.online")
                        : t("integrations.device.offline")
                    }
                    tone={item.is_online ? "positive" : "neutral"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title={t("integrations.telemetry.open")}
                    aria-label={t("integrations.telemetry.open")}
                    onClick={() => setTelemetryDevice(item)}
                  >
                    <Activity className="h-4 w-4" />
                  </Button>
                  {canManageHardware && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title={t("integrations.console.open")}
                      aria-label={t("integrations.console.open")}
                      onClick={() => setConsoleDevice(item)}
                    >
                      <TerminalSquare className="h-4 w-4" />
                    </Button>
                  )}
                  {canManageHardware && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title={t("integrations.device.editTitle")}
                      aria-label={t("integrations.device.editTitle")}
                      onClick={() => setEditingDevice(item)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {canManageHardware && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={Boolean(item.gateway)}
                      disabledReason={
                        item.gateway
                          ? t("integrations.device.removeGatewayBlocked")
                          : undefined
                      }
                      title={
                        item.gateway
                          ? t("integrations.device.removeGatewayBlocked")
                          : t("common.remove")
                      }
                      aria-label={
                        item.gateway
                          ? t("integrations.device.removeGatewayBlocked")
                          : t("common.remove")
                      }
                      onClick={() => setRemovingDevice(item)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {editingDevice && (
        <DeviceEditDialog
          device={editingDevice}
          companyType={selectedCompanyType}
          company={user?.is_platform_staff ? selectedCompany : undefined}
          integrationOptions={integrationOptions}
          projectOptions={projectOptions}
          siteOptions={siteOptions}
          scaleOptions={scaleOptions}
          onClose={() => setEditingDevice(null)}
          onSaved={() => {
            setEditingDevice(null);
            void queryClient.invalidateQueries({
              queryKey: ["integration-devices"],
            });
          }}
        />
      )}

      {removingDevice && (
        <ConfirmDialog
          open
          onOpenChange={() => setRemovingDevice(null)}
          title={t("integrations.device.removeTitle", {
            name: removingDevice.device_id,
          })}
          description={t("integrations.device.removeDescription")}
          confirmLabel={t("integrations.device.removeConfirm")}
          variant="destructive"
          isPending={removeDevice.isPending}
          onConfirm={() => removeDevice.mutate(removingDevice)}
        />
      )}

      {removingIntegration && (
        <ConfirmDialog
          open
          onOpenChange={() => setRemovingIntegration(null)}
          title={t("integrations.connection.removeTitle", {
            name: removingIntegration.name,
          })}
          description={t("integrations.connection.removeDescription")}
          confirmLabel={t("integrations.connection.removeConfirm")}
          variant="destructive"
          isPending={removeIntegration.isPending}
          onConfirm={() => removeIntegration.mutate(removingIntegration)}
        />
      )}

      {historyIntegration && (
        <IntegrationHistoryDialog
          integration={historyIntegration}
          company={user?.is_platform_staff ? selectedCompany : undefined}
          onClose={() => setHistoryIntegration(null)}
        />
      )}
      {provisionedDevice?.provisioning && (
        <DeviceProvisioningDialog
          device={provisionedDevice}
          onClose={() => setProvisionedDevice(null)}
        />
      )}
      {telemetryDevice && (
        <DeviceTelemetryDialog
          device={telemetryDevice}
          onClose={() => setTelemetryDevice(null)}
        />
      )}
      {consoleDevice && (
        <DeviceConsoleDialog
          device={consoleDevice}
          onClose={() => setConsoleDevice(null)}
        />
      )}
    </div>
  );
}

/** What a device row can honestly be edited into. */
interface Option {
  value: string;
  label: string;
}

/**
 * Correcting a registered device, and rotating its key.
 *
 * The id and the type are shown but fixed: they are the identity the unit
 * signs its requests with, and editing either would leave a device that looks
 * configured and is rejected on every call. Everything offered here is
 * something that genuinely changes in the field - a unit moved to another
 * weighbridge, new firmware, or a key that has to be replaced because someone
 * left. Until now the console could only register and delete, so any of those
 * meant deleting the device and losing its history with it (F-101).
 */
function DeviceEditDialog({
  device,
  companyType,
  company,
  integrationOptions,
  projectOptions,
  siteOptions,
  scaleOptions,
  onClose,
  onSaved,
}: {
  device: IntegrationDevice;
  companyType: CompanyType | null;
  company?: string;
  integrationOptions: Option[];
  projectOptions: Option[];
  siteOptions: Option[];
  scaleOptions: Option[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const [integration, setIntegration] = useState(device.integration ?? "");
  const [project, setProject] = useState(device.project ?? "");
  const [site, setSite] = useState(device.site ?? "");
  const [scale, setScale] = useState(device.scale ?? "");
  const [firmware, setFirmware] = useState(device.firmware_version ?? "");
  const [isActive, setIsActive] = useState(device.is_active);
  const [secret, setSecret] = useState("");

  const save = useMutation({
    mutationFn: () =>
      updateIntegrationDevice(
        device.id,
        {
          integration: integration || null,
          project: companyType === "CONTRACTOR" ? project || null : null,
          site: companyType === "RECYCLER" ? site || null : null,
          scale: companyType === "RECYCLER" ? scale || null : null,
          firmware_version: firmware.trim(),
          is_active: isActive,
          // An empty box means "leave the key alone", not "clear the key".
          ...(secret ? { secret } : {}),
        },
        company,
      ),
    onSuccess: onSaved,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("integrations.device.editTitle")}</DialogTitle>
          <DialogDescription>
            {device.device_type} / {device.device_id}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Field label={t("integrations.device.integration")}>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={integration}
              onChange={(event) => setIntegration(event.target.value)}
            >
              <option value="">{t("integrations.device.unlinked")}</option>
              {integrationOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>

          {companyType === "CONTRACTOR" && (
            <Field label={t("integrations.device.project")}>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={project}
                onChange={(event) => setProject(event.target.value)}
              >
                <option value="">{t("integrations.device.unlinked")}</option>
                {projectOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {companyType === "RECYCLER" && (
            <>
              <Field label={t("integrations.device.site")}>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={site}
                  onChange={(event) => {
                    setSite(event.target.value);
                    setScale("");
                  }}
                >
                  <option value="">{t("integrations.device.unlinked")}</option>
                  {siteOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("integrations.device.scale")}>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={scale}
                  onChange={(event) => setScale(event.target.value)}
                >
                  <option value="">{t("integrations.device.unlinked")}</option>
                  {scaleOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}

          <Field label={t("integrations.device.firmware")}>
            <Input
              value={firmware}
              onChange={(event) => setFirmware(event.target.value)}
            />
          </Field>

          <Field label={t("integrations.device.rotateSecret")}>
            <Input
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder={t("integrations.device.rotateSecretPlaceholder")}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            {t("integrations.device.rotateSecretHelp")}
          </p>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            {t("integrations.device.active")}
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            <Check className="h-4 w-4" />
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeviceProvisioningDialog({
  device,
  onClose,
}: {
  device: IntegrationDevice;
  onClose: () => void;
}) {
  const t = useTranslations();
  const provisioning = device.provisioning!;
  const body = JSON.stringify(
    {
      device_id: provisioning.device_id,
      sent_at: new Date().toISOString(),
      status: "ONLINE",
      firmware_version: device.firmware_version || "1.0.0",
      metrics: {},
    },
    null,
    2,
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("integrations.device.provisioningTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("integrations.device.provisioningDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto pr-2 [scrollbar-gutter:stable]">
          <ProvisioningValue
            label={t("integrations.device.heartbeatUrl")}
            value={provisioning.heartbeat_url}
          />
          {provisioning.access_event_url && (
            <ProvisioningValue
              label={t("integrations.device.accessEventUrl")}
              value={provisioning.access_event_url}
            />
          )}
          {provisioning.gate_event_url && (
            <ProvisioningValue
              label={t("integrations.device.gateEventUrl")}
              value={provisioning.gate_event_url}
            />
          )}
          <ProvisioningValue
            label={t("integrations.device.recordId")}
            value={provisioning.device_record_id}
          />
          <ProvisioningValue
            label={t("integrations.device.deviceHeader")}
            value={`${provisioning.device_header}: ${provisioning.device_record_id}`}
          />
          <ProvisioningValue
            label={t("integrations.device.signatureHeader")}
            value={`${provisioning.signature_header}: ${provisioning.signature}`}
          />
          <ProvisioningValue
            label={t("integrations.device.oneTimeSecret")}
            value={provisioning.secret}
            sensitive
          />
          <div className="space-y-1.5">
            <Label>{t("integrations.device.heartbeatBody")}</Label>
            <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-3 text-xs">
              {body}
            </pre>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProvisioningValue({
  label,
  value,
  sensitive = false,
}: {
  label: string;
  value: string;
  sensitive?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <code
        className={`block break-all rounded-lg border px-3 py-2 text-xs ${sensitive ? "border-warning/30 bg-warning/10" : "bg-muted/30"}`}
      >
        {value}
      </code>
    </div>
  );
}

function IntegrationHistoryDialog({
  integration,
  company,
  onClose,
}: {
  integration: IntegrationConfig;
  company?: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const history = useQuery({
    queryKey: ["integration-deliveries", integration.id, company],
    queryFn: () =>
      getIntegrationDeliveries(integration.id, {
        page_size: 50,
        sort_by: "attempted_at",
        sort_order: "desc",
        ...(company ? { company } : {}),
      }),
  });
  const rows: IntegrationDelivery[] = history.data?.results ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("integrations.history.title", { name: integration.name })}
          </DialogTitle>
          <DialogDescription>
            {t("integrations.history.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="divide-y overflow-hidden rounded-lg border bg-card shadow-sm">
          {history.isLoading ? (
            <p className="px-3 py-8 text-center text-muted-foreground">
              {t("common.loading")}
            </p>
          ) : history.isError ? (
            <p className="px-3 py-8 text-center text-destructive">
              {t("integrations.history.loadError")}
            </p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-muted-foreground">
              {t("integrations.history.empty")}
            </p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="grid gap-2 px-3 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-center"
              >
                <StatusBadge
                  label={t(`integrations.history.status.${row.status}`)}
                  tone={
                    row.status === "SENT"
                      ? "positive"
                      : row.status === "FAILED"
                        ? "danger"
                        : "neutral"
                  }
                />
                <div className="min-w-0">
                  <p className="text-sm">
                    {new Date(row.attempted_at).toLocaleString()}
                  </p>
                  {row.error && (
                    <p className="break-words text-xs text-destructive">
                      {row.error}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {row.response_status
                    ? t("integrations.history.httpStatus", {
                        status: row.response_status,
                      })
                    : t("common.emptyValue")}
                </span>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What one device has actually reported.
 *
 * The online badge on the row above answers "is it reachable". This answers
 * "is it still saying anything", which is the failure a heartbeat cannot show:
 * a crane controller can heartbeat happily for a week while its telemetry feed
 * has been dead since a firmware update, and the only way to notice is to look
 * at what arrived and when.
 *
 * A load failure is rendered as a load failure and never as an empty list.
 * "This device has reported nothing" and "we could not ask" lead to opposite
 * actions, and showing the first when the second is true sends someone to a
 * site to check hardware that is working.
 */
const COMMAND_KINDS: DeviceCommandKind[] = [
  "GATE_OPEN",
  "GATE_CLOSE",
  "LED_MESSAGE",
  "VOICE_ANNOUNCEMENT",
  "OTHER",
];

/** Which commands carry a message, and under which payload key. */
const MESSAGE_KEY: Partial<Record<DeviceCommandKind, string>> = {
  LED_MESSAGE: "message",
  VOICE_ANNOUNCEMENT: "message",
};

function commandTone(state: DeviceCommandState) {
  if (state === "ACKNOWLEDGED") return "positive" as const;
  if (state === "PENDING") return "warning" as const;
  return "danger" as const;
}

/**
 * 设备调试台 — make the barrier move once, and see whether it answered.
 *
 * This is an installation tool, not an operating one (D-054). On the day a
 * gate or an LED board is wired up, the question is never "what does the
 * system think" but "did that thing physically do it", and the only way to
 * ask is to send one command and watch.
 *
 * Two things it must be honest about, and both are load-bearing:
 *
 * * **Queued is not done.** The API answers as soon as the command is
 *   recorded; only ACKNOWLEDGED means the controller reported acting. The log
 *   shows the state itself rather than a tick, and a PENDING row that stops
 *   moving is the actual finding on a commissioning day — it means the wiring
 *   or the adapter is not there.
 * * **Pressing twice must not open the barrier twice.** Every issue carries a
 *   client command id, so a double press is one command. A fresh id is minted
 *   per press of *this* button, not per render, so deliberately sending the
 *   same command again is still possible.
 */
function DeviceConsoleDialog({
  device,
  onClose,
}: {
  device: IntegrationDevice;
  onClose: () => void;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<DeviceCommandKind>("GATE_OPEN");
  const [message, setMessage] = useState("");
  const [closing, setClosing] = useState<DeviceCommand | null>(null);
  const [closeReason, setCloseReason] = useState("");

  const key = ["device-commands", device.id];
  const commands = useQuery({
    queryKey: key,
    queryFn: () => getDeviceCommands(device.id, { page_size: 25 }),
    // A command is answered by the controller, not by this tab, so the log
    // has to come back on its own or the operator is left refreshing.
    refetchInterval: 4000,
  });

  const messageKey = MESSAGE_KEY[kind];
  const issue = useMutation({
    mutationFn: () =>
      issueDeviceCommand({
        device: device.id,
        kind,
        client_command_id: `console-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        payload: messageKey ? { [messageKey]: message.trim() } : {},
        timeout_seconds: 30,
      }),
    onSuccess: async () => {
      setMessage("");
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const close = useMutation({
    mutationFn: (command: DeviceCommand) =>
      closeDeviceCommand(command.id, closeReason.trim()),
    onSuccess: async () => {
      setClosing(null);
      setCloseReason("");
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const rows: DeviceCommand[] = commands.data?.results ?? [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t("integrations.console.title", { name: device.device_id })}
          </DialogTitle>
          <DialogDescription>
            {t("integrations.console.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto]">
          <div className="grid gap-2">
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={kind}
              aria-label={t("integrations.console.kind")}
              onChange={(event) =>
                setKind(event.target.value as DeviceCommandKind)
              }
            >
              {COMMAND_KINDS.map((value) => (
                <option key={value} value={value}>
                  {t(`integrations.console.kindLabel.${value}`)}
                </option>
              ))}
            </select>
            {messageKey && (
              <Input
                value={message}
                aria-label={t("integrations.console.message")}
                placeholder={t("integrations.console.messagePlaceholder")}
                onChange={(event) => setMessage(event.target.value)}
              />
            )}
          </div>
          <div className="flex items-start">
            <Button
              type="button"
              requires={[
                [!messageKey || message, t("integrations.console.message")],
              ]}
              disabled={issue.isPending}
              onClick={() => issue.mutate()}
            >
              {t("integrations.console.send")}
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("integrations.console.queuedWarning")}
        </p>

        <div className="max-h-[45vh] divide-y overflow-y-auto rounded-lg border bg-card">
          {commands.isLoading ? (
            <p className="px-3 py-8 text-center text-muted-foreground">
              {t("common.loading")}
            </p>
          ) : commands.isError ? (
            <p className="px-3 py-8 text-center text-destructive">
              {t("integrations.console.loadError")}
            </p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-muted-foreground">
              {t("integrations.console.empty")}
            </p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="grid gap-2 px-3 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-center"
              >
                <StatusBadge
                  label={t(`integrations.console.state.${row.state}`)}
                  tone={commandTone(row.state)}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {t(`integrations.console.kindLabel.${row.kind}`)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(row.issued_at).toLocaleString()}
                    {row.issued_by_name ? ` · ${row.issued_by_name}` : ""}
                    {row.detail ? ` · ${row.detail}` : ""}
                  </p>
                </div>
                {row.state === "PENDING" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setClosing(row)}
                  >
                    {t("integrations.console.close")}
                  </Button>
                ) : (
                  <span className="text-right text-xs text-muted-foreground">
                    {row.settled_at
                      ? new Date(row.settled_at).toLocaleTimeString()
                      : t("common.emptyValue")}
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {closing && (
          <ConfirmDialog
            open
            onOpenChange={(next) => {
              if (!next) {
                setClosing(null);
                setCloseReason("");
              }
            }}
            title={t("integrations.console.close")}
            description={t("integrations.console.closeConfirm")}
            confirmLabel={t("integrations.console.close")}
            isPending={close.isPending}
            reason={closeReason}
            onReasonChange={setCloseReason}
            onConfirm={() => close.mutate(closing)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeviceTelemetryDialog({
  device,
  onClose,
}: {
  device: IntegrationDevice;
  onClose: () => void;
}) {
  const t = useTranslations();
  const telemetry = useQuery({
    queryKey: ["device-telemetry", device.id],
    queryFn: () =>
      getDeviceTelemetry(device.id, {
        page_size: 50,
        sort_by: "observed_at",
        sort_order: "desc",
      }),
  });
  const rows: DeviceTelemetry[] = telemetry.data?.results ?? [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t("integrations.telemetry.title", { name: device.device_id })}
          </DialogTitle>
          <DialogDescription>
            {t("integrations.telemetry.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] divide-y overflow-y-auto rounded-lg border bg-card shadow-sm">
          {telemetry.isLoading ? (
            <p className="px-3 py-8 text-center text-muted-foreground">
              {t("common.loading")}
            </p>
          ) : telemetry.isError ? (
            <p className="px-3 py-8 text-center text-destructive">
              {t("integrations.telemetry.loadError")}
            </p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-muted-foreground">
              {t("integrations.telemetry.empty")}
            </p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="grid gap-2 px-3 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-center"
              >
                <StatusBadge
                  label={t(`integrations.telemetry.kind.${row.kind}`)}
                  tone={
                    row.kind === "ALERT"
                      ? "danger"
                      : row.kind === "EVENT"
                        ? "info"
                        : "neutral"
                  }
                />
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm">{row.metric}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(row.observed_at).toLocaleString()}
                  </p>
                </div>
                <span className="text-right text-sm tabular-nums">
                  {row.value === null
                    ? t("common.emptyValue")
                    : `${row.value}${row.unit ? ` ${row.unit}` : ""}`}
                </span>
              </div>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("integrations.telemetry.boundary")}
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
