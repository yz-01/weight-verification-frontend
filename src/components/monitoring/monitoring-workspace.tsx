"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Cable,
  Camera,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleGauge,
  DatabaseZap,
  History,
  Info,
  RefreshCw,
  ScanLine,
  Search,
  ServerCog,
  Settings2,
  Weight,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type {
  HealthStatus,
  IntegrationInventoryConnection,
  IntegrationInventoryDevice,
  IntegrationMonitor,
  MonitoringOverview,
  SystemEvent,
} from "@/interfaces/platform-ops";
import { useDateFormat } from "@/lib/dates";
import { getPlatformConfigCatalogue } from "@/services/platform-settings.service";
import {
  getMonitoringOverview,
  getSystemEvents,
  recordSystemEventResolution,
} from "@/services/platform-ops.service";

export type MonitoringSection =
  | "overview"
  | "live-platform"
  | "cwe"
  | "cctv"
  | "anpr"
  | "api-gateway"
  | "sync"
  | "exceptions"
  | "service-search"
  | "runtime-statistics"
  | "records";

const SUBMODULES: Array<{
  section: Exclude<MonitoringSection, "overview">;
  number: string;
}> = [
  { section: "live-platform", number: "6.2.1" },
  { section: "cwe", number: "6.2.2" },
  { section: "cctv", number: "6.2.3" },
  { section: "anpr", number: "6.2.4" },
  { section: "api-gateway", number: "6.2.5" },
  { section: "sync", number: "6.2.6" },
  { section: "exceptions", number: "6.2.7" },
  { section: "service-search", number: "6.2.8" },
  { section: "runtime-statistics", number: "6.2.9" },
  { section: "records", number: "6.2.10" },
];

const MODULE_ICONS: Record<
  Exclude<MonitoringSection, "overview">,
  typeof Activity
> = {
  "live-platform": CircleGauge,
  cwe: Weight,
  cctv: Camera,
  anpr: ScanLine,
  "api-gateway": Cable,
  sync: DatabaseZap,
  exceptions: AlertTriangle,
  "service-search": Search,
  "runtime-statistics": ChartNoAxesCombined,
  records: History,
};

export function MonitoringWorkspace({
  section = "overview",
}: {
  section?: MonitoringSection;
}) {
  const t = useTranslations("monitoring");
  const common = useTranslations("common");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [serviceSearch, setServiceSearch] = useState("");
  const overview = useQuery({
    queryKey: ["monitoring", "overview"],
    queryFn: getMonitoringOverview,
    refetchInterval: 15_000,
  });
  const platformConfig = useQuery({
    queryKey: ["platform-config-catalogue"],
    queryFn: getPlatformConfigCatalogue,
  });
  const configuredMode = (key: "cctv.mode" | "anpr.mode") => {
    const value = platformConfig.data?.configs.find((row) => row.key === key)?.value;
    return value === "LIVE" || value === "SIMULATED" ? value : undefined;
  };

  const title =
    section === "overview" ? t("title") : t(`section.${section}.title`);
  const subtitle =
    section === "overview" ? t("subtitle") : t(`section.${section}.subtitle`);

  return (
    <div className="space-y-5">
      <ListHeader
        title={title}
        subtitle={subtitle}
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={overview.isFetching}
            onClick={() =>
              void queryClient.invalidateQueries({ queryKey: ["monitoring"] })
            }
          >
            <RefreshCw className={overview.isFetching ? "animate-spin" : ""} />
            {common("refresh")}
          </Button>
        }
      />

      <MonitoringPurpose section={section} />

      {section === "overview" ? (
        <div className="space-y-4">
          {overview.data && <MonitoringSummary data={overview.data} />}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {SUBMODULES.map((module) => (
              <MonitoringModuleLink
                key={module.section}
                section={module.section}
              />
            ))}
          </div>
        </div>
      ) : overview.isError ? (
        <div className="rounded-lg border border-destructive/25 bg-destructive/5 py-12 text-center text-sm text-destructive">
          <AlertTriangle className="mx-auto mb-3 size-5" />
          {t("loadError")}
        </div>
      ) : overview.isLoading || !overview.data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-md" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <MonitoringSummary data={overview.data} />
          <SectionContent
            section={section}
            data={overview.data}
            serviceSearch={serviceSearch}
            setServiceSearch={setServiceSearch}
            requestedModes={{
              cctv: configuredMode("cctv.mode"),
              anpr: configuredMode("anpr.mode"),
            }}
          />
        </div>
      )}

      {overview.data && section !== "overview" && (
        <p className="text-right text-xs text-muted-foreground">
          {t("checkedAt", { value: df.dateTime(overview.data.generated_at) })}
        </p>
      )}
    </div>
  );
}

function MonitoringModuleLink({
  section,
}: {
  section: Exclude<MonitoringSection, "overview">;
}) {
  const t = useTranslations("monitoring");
  const Icon = MODULE_ICONS[section];
  return (
    <Link
      href={`/monitoring/${section}`}
      className="group flex min-h-24 items-center gap-4 rounded-lg border bg-card px-4 py-4 shadow-sm transition hover:border-primary/35 hover:shadow-md"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">
          {t(`section.${section}.title`)}
        </span>
        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
          {t(`section.${section}.subtitle`)}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}

function MonitoringSummary({ data }: { data: MonitoringOverview }) {
  const t = useTranslations("monitoring");
  const [detail, setDetail] = useState<"services" | "live" | "attention" | null>(
    null,
  );
  const unhealthyServices = data.services.filter(
    (service) => !["ok", "configured"].includes(service.status),
  );
  const liveServices = data.services.filter((service) =>
    isVerifiedLiveService(service.key, service.mode, data),
  );
  const unhealthy = unhealthyServices.length;
  const overall: HealthStatus = unhealthy > 0 ? "degraded" : "ok";
  const detailServices =
    detail === "live"
      ? liveServices
      : detail === "attention"
        ? unhealthyServices
        : data.services;
  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border bg-card px-4 py-4 shadow-sm md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={`grid size-11 shrink-0 place-items-center rounded-md ${overall === "ok" ? "bg-success/10 text-success" : "bg-warning/15 text-warning"}`}
          >
            <ServerCog className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">{t("summary.title")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("summary.description")}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x overflow-hidden rounded-md border bg-muted/15">
          <SummaryValue
            label={t("summary.services")}
            value={data.services.length}
            onClick={() => setDetail("services")}
          />
          <SummaryValue
            label={t("summary.live")}
            value={liveServices.length}
            onClick={() => setDetail("live")}
          />
          <SummaryValue
            label={t("summary.attention")}
            value={unhealthy + data.exceptions.open}
            tone={unhealthy + data.exceptions.open > 0 ? "warning" : undefined}
            onClick={() => setDetail("attention")}
          />
        </div>
        <HealthBadge status={overall} />
      </div>
      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t(`summary.detail.${detail ?? "services"}.title`)}</DialogTitle>
            <DialogDescription>
              {t(`summary.detail.${detail ?? "services"}.description`)}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55dvh] divide-y overflow-y-auto rounded-lg border">
            {detailServices.map((service) => (
              <div
                key={service.key}
                className="flex flex-wrap items-center gap-2 px-4 py-3"
              >
                <span className="min-w-0 flex-1 font-medium">{service.name}</span>
                <TypeBadge label={t(`mode.${service.mode}`)} />
                <HealthBadge status={service.status} />
              </div>
            ))}
            {detail === "attention" && data.exceptions.open > 0 && (
              <div className="flex items-center gap-3 px-4 py-3">
                <AlertTriangle className="size-4 shrink-0 text-warning" />
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {t("summary.detail.openExceptions")}
                </span>
                <span className="font-semibold tabular-nums">
                  {data.exceptions.open}
                </span>
                <Button size="icon-sm" variant="ghost" asChild>
                  <Link href="/monitoring/exceptions" title={t("summary.openDetails")}>
                    <ArrowRight />
                  </Link>
                </Button>
              </div>
            )}
            {detailServices.length === 0 &&
              !(detail === "attention" && data.exceptions.open > 0) && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("summary.detail.empty")}
                </p>
              )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SummaryValue({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "warning";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="group min-w-20 px-3 py-2 text-center transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      title={label}
      onClick={onClick}
    >
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <span className="mt-0.5 inline-flex items-center gap-1">
        <span
          className={`text-lg font-semibold tabular-nums ${tone ? "text-warning" : ""}`}
        >
          {value}
        </span>
        <Info className="size-3 text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100" />
      </span>
    </button>
  );
}

function SectionContent({
  section,
  data,
  serviceSearch,
  setServiceSearch,
  requestedModes,
}: {
  section: Exclude<MonitoringSection, "overview">;
  data: MonitoringOverview;
  serviceSearch: string;
  setServiceSearch: (value: string) => void;
  requestedModes: {
    cctv?: "SIMULATED" | "LIVE";
    anpr?: "SIMULATED" | "LIVE";
  };
}) {
  const t = useTranslations("monitoring");
  const format = useFormatter();

  if (section === "live-platform") {
    return (
      <MetricGrid
        items={[
          ["onlineContractors", data.platform.online_contractors],
          ["onlineRecyclers", data.platform.online_recyclers],
          ["onlineProjects", data.platform.online_projects],
          ["activeProjects", data.platform.active_projects],
          ["onlineUsers", data.platform.online_users],
          ["activeUsersToday", data.platform.active_users_today],
          ["activeCompanies", data.platform.active_companies],
        ]}
      />
    );
  }

  if (section === "cwe") {
    return (
      <div className="space-y-5">
        <ModeLine mode={data.cwe.mode} status={data.cwe.status} />
        <MetricGrid
          items={[
            ["totalScales", data.cwe.total_scales],
            ["activeScales", data.cwe.active_scales],
            ["onlineGateways", data.cwe.online_gateways],
            ["offlineGateways", data.cwe.offline_gateways],
            ["weighingsToday", data.cwe.weighings_today],
            ["anomaliesToday", data.cwe.anomalies_today],
            ["reweighsToday", data.cwe.reweighs_today],
            ["inProgress", data.cwe.in_progress],
          ]}
        />
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("field.scale")}</TableHead>
                <TableHead>{t("field.company")}</TableHead>
                <TableHead>{t("field.site")}</TableHead>
                <TableHead>{t("field.currentWeight")}</TableHead>
                <TableHead>{t("field.lastChecked")}</TableHead>
                <TableHead>{t("field.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.cwe.scales.map((scale) => (
                <TableRow key={scale.id}>
                  <TableCell>
                    <p className="font-medium">{scale.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {scale.name}
                    </p>
                  </TableCell>
                  <TableCell>{scale.company}</TableCell>
                  <TableCell>{scale.site}</TableCell>
                  <TableCell className="tabular-nums">
                    {scale.current_weight_kg === null
                      ? "-"
                      : `${format.number(Number(scale.current_weight_kg))} kg`}
                  </TableCell>
                  <TableCell>{scale.last_seen_at ?? "-"}</TableCell>
                  <TableCell>
                    <HealthBadge status={scale.online ? "ok" : "unhealthy"} />
                  </TableCell>
                </TableRow>
              ))}
              {data.cwe.scales.length === 0 && <EmptyRow columns={6} />}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (section === "cctv")
    return (
      <IntegrationSection
        monitor={data.cctv}
        icon={Camera}
        settingsHref="/system-settings/cctv"
        inventory={data.integration_inventory}
        kindFilter={["CCTV"]}
        requestedMode={requestedModes.cctv}
      />
    );
  if (section === "anpr")
    return (
      <IntegrationSection
        monitor={data.anpr}
        icon={ScanLine}
        settingsHref="/system-settings/anpr"
        inventory={data.integration_inventory}
        kindFilter={["ANPR"]}
        requestedMode={requestedModes.anpr}
      />
    );

  if (section === "api-gateway") {
    return (
      <div className="space-y-5">
        <ServiceConfigurationLinks settingsHref="/system-settings/api-gateway" />
        <ModeLine
          mode={data.api_gateway.mode}
          status={data.api_gateway.status}
        />
        <MetricGrid
          items={[
            ["requests24h", data.api_gateway.requests_24h],
            ["failures24h", data.api_gateway.failures_24h],
            ["successRate", `${format.number(data.api_gateway.success_rate)}%`],
            [
              "averageLatency",
              `${format.number(data.api_gateway.average_latency_ms)} ms`,
            ],
            [
              "maxLatency",
              `${format.number(data.api_gateway.max_latency_ms)} ms`,
            ],
          ]}
        />
        <InventoryPanel
          inventory={data.integration_inventory}
          kindFilter={["API_GATEWAY"]}
        />
      </div>
    );
  }

  if (section === "sync") {
    return (
      <div className="space-y-5">
        <ModeLine mode={data.sync.mode} status={data.sync.status} />
        <MetricGrid
          items={[
            ["configured", data.sync.configured],
            ["attempts24h", data.sync.attempts_24h],
            ["sent24h", data.sync.sent_24h],
            ["failed24h", data.sync.failed_24h],
            ["pending24h", data.sync.pending_24h],
            ["successRate", `${format.number(data.sync.success_rate)}%`],
          ]}
        />
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("field.service")}</TableHead>
                <TableHead>{t("field.company")}</TableHead>
                <TableHead>{t("field.mode")}</TableHead>
                <TableHead>{t("field.status")}</TableHead>
                <TableHead>{t("field.lastChecked")}</TableHead>
                <TableHead>{t("field.exception")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sync.integrations.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.kind}</p>
                  </TableCell>
                  <TableCell>{row.company}</TableCell>
                  <TableCell>
                    <TypeBadge label={t(`mode.${row.mode}`)} />
                  </TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.last_success_at ?? "-"}</TableCell>
                  <TableCell className="max-w-64 truncate">
                    {row.last_error || "-"}
                  </TableCell>
                </TableRow>
              ))}
              {data.sync.integrations.length === 0 && <EmptyRow columns={6} />}
            </TableBody>
          </Table>
        </div>
        <InventoryPanel
          inventory={data.integration_inventory}
          kindFilter={["ERP", "ACCOUNTING", "MYINVOIS", "GOVERNMENT_API"]}
        />
      </div>
    );
  }

  if (section === "exceptions" || section === "records") {
    return <EventLedger exceptionsOnly={section === "exceptions"} />;
  }

  if (section === "service-search") {
    const needle = serviceSearch.trim().toLowerCase();
    const services = data.services.filter((service) =>
      [service.name, service.key, service.status, service.mode]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
    return (
      <div className="space-y-4">
        <Input
          value={serviceSearch}
          onChange={(event) => setServiceSearch(event.target.value)}
          placeholder={t("serviceSearchPlaceholder")}
          className="max-w-md bg-card shadow-sm"
        />
        <ServiceTable services={services} />
        <InventoryPanel inventory={data.integration_inventory} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <MetricGrid
        items={[
          [
            "uptime",
            t("value.uptime", {
              value: Math.floor(data.runtime.uptime_seconds / 60),
            }),
          ],
          ["exceptions24h", data.runtime.exceptions_24h],
          [
            "averageLatency",
            `${format.number(data.runtime.average_response_ms)} ms`,
          ],
          [
            "apiSuccessRate",
            `${format.number(data.runtime.api_success_rate)}%`,
          ],
          [
            "syncSuccessRate",
            `${format.number(data.runtime.sync_success_rate)}%`,
          ],
          ["onlineWorkers", data.runtime.worker_status.online],
          ["staleWorkers", data.runtime.worker_status.stale],
        ]}
      />
      <ServiceTable services={data.services} />
    </div>
  );
}

function IntegrationSection({
  monitor,
  icon: Icon,
  settingsHref,
  inventory,
  kindFilter,
  requestedMode,
}: {
  monitor: IntegrationMonitor;
  icon: typeof Camera;
  settingsHref: string;
  inventory: MonitoringOverview["integration_inventory"];
  kindFilter: string[];
  requestedMode?: "SIMULATED" | "LIVE";
}) {
  const t = useTranslations("monitoring");
  const verifiedLive = inventory.connections.some(
    (connection) =>
      kindFilter.includes(connection.kind) && connection.is_live_ready,
  );
  const livePending = requestedMode === "LIVE" && !verifiedLive;
  return (
    <div className="space-y-5">
      <ServiceConfigurationLinks settingsHref={settingsHref} />
      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-4 shadow-sm">
        <span className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <span className="font-semibold">{monitor.name}</span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(`modeDescription.${monitor.mode}`)}
          </p>
        </div>
        <div className="ml-auto">
          <ModeLine mode={monitor.mode} status={monitor.status} />
        </div>
      </div>
      <div className="grid overflow-hidden rounded-lg border bg-card shadow-sm sm:grid-cols-2 sm:divide-x">
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {t("connectionMode.requested")}
          </p>
          <div className="mt-2">
            {requestedMode ? (
              <TypeBadge label={t(`mode.${requestedMode}`)} />
            ) : (
              <HealthBadge status="not_configured" />
            )}
          </div>
        </div>
        <div className="border-t px-4 py-3 sm:border-t-0">
          <p className="text-xs text-muted-foreground">
            {t("connectionMode.actual")}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {monitor.configured > 0 && <TypeBadge label={t(`mode.${monitor.mode}`)} />}
            <HealthBadge status={monitor.status} />
          </div>
        </div>
        {livePending && (
          <p className="border-t bg-warning/5 px-4 py-3 text-xs leading-5 text-warning sm:col-span-2">
            {t("connectionMode.livePending")}
          </p>
        )}
      </div>
      <MetricGrid
        items={[
          ["configured", monitor.configured],
          ["enabled", monitor.enabled],
          ["totalDevices", monitor.total_devices],
          ["onlineDevices", monitor.online_devices],
          ["offlineDevices", monitor.offline_devices],
          ["recognitions24h", monitor.successes_24h],
          ["failures24h", monitor.failures_24h],
        ]}
      />
      <InventoryPanel inventory={inventory} kindFilter={kindFilter} />
    </div>
  );
}

function isVerifiedLiveService(
  key: string,
  mode: "SIMULATED" | "LIVE",
  data: MonitoringOverview,
) {
  if (mode !== "LIVE") return false;
  if (key === "cwe") return data.cwe.online_gateways > 0;
  if (key === "cctv") {
    return data.integration_inventory.connections.some(
      (connection) => connection.kind === "CCTV" && connection.is_live_ready,
    );
  }
  if (key === "anpr") {
    return data.integration_inventory.connections.some(
      (connection) => connection.kind === "ANPR" && connection.is_live_ready,
    );
  }
  if (key === "data_sync") {
    return data.integration_inventory.connections.some(
      (connection) =>
        ["ERP", "ACCOUNTING", "MYINVOIS", "GOVERNMENT_API"].includes(
          connection.kind,
        ) && connection.is_live_ready,
    );
  }
  return true;
}

function InventoryPanel({
  inventory,
  kindFilter,
}: {
  inventory: MonitoringOverview["integration_inventory"];
  kindFilter?: string[];
}) {
  const t = useTranslations("monitoring");
  const common = useTranslations("common");
  const df = useDateFormat();
  const [companyType, setCompanyType] = useState("");
  const [company, setCompany] = useState("");
  const [kind, setKind] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const allowed = (value: string | null) =>
    !kindFilter?.length || Boolean(value && kindFilter.includes(value));
  const companyOptions = useMemo(() => {
    const rows = [...inventory.connections, ...inventory.devices];
    return Array.from(
      new Map(
        rows.map((row) => [
          row.company_id,
          {
            id: row.company_id,
            label: `${row.company_code} / ${row.company_name}`,
          },
        ]),
      ).values(),
    ).sort((a, b) => a.label.localeCompare(b.label));
  }, [inventory]);
  const kindOptions = Array.from(
    new Set(
      inventory.connections
        .filter((row) => allowed(row.kind))
        .map((row) => row.kind)
        .concat(
          inventory.devices
            .filter((row) => allowed(row.integration_kind))
            .map((row) => row.integration_kind ?? ""),
        ),
    ),
  )
    .filter(Boolean)
    .sort();
  const deviceOptions = Array.from(
    new Set(
      inventory.devices
        .filter((row) => allowed(row.integration_kind))
        .map((row) => row.device_type),
    ),
  ).sort();
  const needle = search.trim().toLowerCase();
  const connectionRows = inventory.connections.filter((row) => {
    const online = row.online_devices > 0;
    return (
      allowed(row.kind) &&
      (!companyType || row.company_type === companyType) &&
      (!company || row.company_id === company) &&
      (!kind || row.kind === kind) &&
      (!status ||
        (status === "online"
          ? online
          : status === "offline"
            ? !online
            : status === "live_ready"
              ? row.is_live_ready
              : status === "simulated"
                ? row.mode === "SIMULATED"
                : true)) &&
      (!needle ||
        [row.company_name, row.company_code, row.name, row.kind, row.status]
          .join(" ")
          .toLowerCase()
          .includes(needle))
    );
  });
  const deviceRows = inventory.devices.filter((row) => {
    return (
      allowed(row.integration_kind) &&
      (!companyType || row.company_type === companyType) &&
      (!company || row.company_id === company) &&
      (!kind || row.integration_kind === kind) &&
      (!deviceType || row.device_type === deviceType) &&
      (!status ||
        (status === "online"
          ? row.is_online
          : status === "offline"
            ? !row.is_online
            : status === "live_ready"
              ? row.is_live_ready
              : status === "simulated"
                ? row.integration_mode === "SIMULATED"
                : true)) &&
      (!needle ||
        [
          row.company_name,
          row.company_code,
          row.integration_name,
          row.integration_kind,
          row.device_type,
          row.device_id,
          row.project_name,
          row.site_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle))
    );
  });
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold">{t("inventory.title")}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t("inventory.description")}
        </p>
      </div>
      <div className="grid gap-3 rounded-lg border bg-muted/15 p-3 md:grid-cols-2 xl:grid-cols-6">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("inventory.searchPlaceholder")}
          className="bg-card"
        />
        <select
          className="h-9 rounded-md border bg-card px-3 text-sm"
          value={companyType}
          onChange={(event) => setCompanyType(event.target.value)}
        >
          <option value="">{t("inventory.allCompanyTypes")}</option>
          <option value="CONTRACTOR">{t("inventory.contractor")}</option>
          <option value="RECYCLER">{t("inventory.recycler")}</option>
        </select>
        <select
          className="h-9 rounded-md border bg-card px-3 text-sm"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
        >
          <option value="">{t("inventory.allCompanies")}</option>
          {companyOptions.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border bg-card px-3 text-sm"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="">{t("inventory.allCategories")}</option>
          {kindOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border bg-card px-3 text-sm"
          value={deviceType}
          onChange={(event) => setDeviceType(event.target.value)}
        >
          <option value="">{t("inventory.allDeviceTypes")}</option>
          {deviceOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border bg-card px-3 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">{t("inventory.allStatuses")}</option>
          <option value="online">{t("inventory.online")}</option>
          <option value="offline">{t("inventory.offline")}</option>
          <option value="live_ready">{t("inventory.liveReady")}</option>
          <option value="simulated">{t("inventory.simulated")}</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-lg border [scrollbar-gutter:stable]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("inventory.company")}</TableHead>
              <TableHead>{t("inventory.category")}</TableHead>
              <TableHead>{t("inventory.connection")}</TableHead>
              <TableHead>{t("inventory.device")}</TableHead>
              <TableHead>{t("inventory.location")}</TableHead>
              <TableHead>{t("inventory.mode")}</TableHead>
              <TableHead>{t("inventory.status")}</TableHead>
              <TableHead>{t("inventory.lastSeen")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {connectionRows.map((row: IntegrationInventoryConnection) => (
              <TableRow key={`connection-${row.id}`}>
                <TableCell>
                  <p className="font-medium">{row.company_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.company_code} ·{" "}
                    {row.company_type === "CONTRACTOR"
                      ? t("inventory.contractor")
                      : t("inventory.recycler")}
                  </p>
                </TableCell>
                <TableCell>
                  <TypeBadge label={row.kind} />
                </TableCell>
                <TableCell>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("inventory.connectionRecord")}
                  </p>
                </TableCell>
                <TableCell>
                  {t("inventory.devicesCount", { count: row.total_devices })}
                </TableCell>
                <TableCell>-</TableCell>
                <TableCell>
                  <InventoryMode
                    requested={row.requested_mode ?? row.mode}
                    actual={row.mode}
                  />
                </TableCell>
                <TableCell>
                  <HealthBadge
                    status={
                      row.is_live_ready
                        ? row.total_devices === 0
                          ? "configured"
                          : row.online_devices > 0
                            ? "ok"
                            : "degraded"
                        : (row.requested_mode ?? row.mode) === "LIVE" &&
                            row.mode !== "LIVE"
                          ? "not_configured"
                        : row.mode === "SIMULATED"
                          ? "configured"
                          : "unhealthy"
                    }
                  />
                </TableCell>
                <TableCell>
                  {row.last_success_at ? df.dateTime(row.last_success_at) : "-"}
                </TableCell>
              </TableRow>
            ))}
            {deviceRows.map((row: IntegrationInventoryDevice) => (
              <TableRow key={`device-${row.id}`}>
                <TableCell>
                  <p className="font-medium">{row.company_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.company_code} ·{" "}
                    {row.company_type === "CONTRACTOR"
                      ? t("inventory.contractor")
                      : t("inventory.recycler")}
                  </p>
                </TableCell>
                <TableCell>
                  <TypeBadge
                    label={row.integration_kind ?? t("inventory.unlinked")}
                  />
                </TableCell>
                <TableCell>
                  {row.integration_name ?? t("inventory.unlinked")}
                </TableCell>
                <TableCell>
                  <p className="font-medium">{row.device_id}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.device_type}
                  </p>
                </TableCell>
                <TableCell>
                  {[row.project_name, row.site_name, row.scale_name]
                    .filter(Boolean)
                    .join(" / ") || "-"}
                </TableCell>
                <TableCell>
                  <InventoryMode
                    requested={row.requested_mode ?? row.integration_mode}
                    actual={row.integration_mode}
                  />
                </TableCell>
                <TableCell>
                  <HealthBadge
                    status={
                      (row.requested_mode ?? row.integration_mode) === "LIVE" &&
                      row.integration_mode !== "LIVE"
                        ? "not_configured"
                        : row.is_online
                        ? row.reported_status === "ERROR"
                          ? "unhealthy"
                          : row.reported_status === "DEGRADED"
                            ? "degraded"
                            : "ok"
                        : row.is_live_ready
                          ? "unhealthy"
                          : "configured"
                    }
                  />
                </TableCell>
                <TableCell>
                  {row.last_seen_at ? df.dateTime(row.last_seen_at) : "-"}
                </TableCell>
              </TableRow>
            ))}
            {connectionRows.length === 0 && deviceRows.length === 0 && (
              <EmptyRow columns={8} />
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        {common("refresh")} {t("inventory.refreshNote")}
      </p>
    </section>
  );
}

function MonitoringPurpose({ section }: { section: MonitoringSection }) {
  const t = useTranslations("monitoring");
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/15 bg-primary/[0.035] px-4 py-4 sm:flex-row sm:items-center">
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <CircleGauge className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t("purpose.title")}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {t("purpose.description")}
        </p>
      </div>
      {section === "overview" && (
        <Button size="sm" variant="outline" asChild>
          <Link href="/system-settings">
            <Settings2 />
            {t("purpose.openSettings")}
          </Link>
        </Button>
      )}
    </div>
  );
}

function ServiceConfigurationLinks({ settingsHref }: { settingsHref: string }) {
  const t = useTranslations("monitoring");
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">{t("purpose.needChange")}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("purpose.needChangeDescription")}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link href={settingsHref}>
            <Settings2 />
            {t("purpose.openSettings")}
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/integrations">
            <Cable />
            {t("purpose.openIntegrations")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function MetricGrid({ items }: { items: Array<[string, string | number]> }) {
  const t = useTranslations("monitoring.metric");
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border bg-border shadow-sm sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([key, value]) => (
        <div key={key} className="min-h-24 bg-card px-4 py-4">
          <p className="text-xs font-medium text-muted-foreground">{t(key)}</p>
          <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  );
}

function InventoryMode({
  requested,
  actual,
}: {
  requested: "SIMULATED" | "LIVE";
  actual: "SIMULATED" | "LIVE";
}) {
  const t = useTranslations("monitoring");
  return (
    <div className="space-y-1.5 whitespace-nowrap">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">
          {t("connectionMode.requested")}
        </span>
        <TypeBadge label={t(`mode.${requested}`)} />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">
          {t("connectionMode.actual")}
        </span>
        <TypeBadge label={t(`mode.${actual}`)} />
      </div>
    </div>
  );
}

function ModeLine({
  mode,
  status,
}: {
  mode: "SIMULATED" | "LIVE";
  status: HealthStatus;
}) {
  const t = useTranslations("monitoring");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TypeBadge label={t(`mode.${mode}`)} />
      <HealthBadge status={status} />
    </div>
  );
}

function HealthBadge({ status }: { status: HealthStatus }) {
  const t = useTranslations("monitoring.health");
  return <StatusBadge label={t(status)} tone={healthTone(status)} />;
}

function ServiceTable({
  services,
}: {
  services: MonitoringOverview["services"];
}) {
  const t = useTranslations("monitoring");
  const df = useDateFormat();
  return (
    <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("field.service")}</TableHead>
            <TableHead>{t("field.mode")}</TableHead>
            <TableHead>{t("field.status")}</TableHead>
            <TableHead>{t("field.lastChecked")}</TableHead>
            <TableHead>{t("field.failures24h")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {services.map((service) => (
            <TableRow key={service.key}>
              <TableCell className="font-medium">{service.name}</TableCell>
              <TableCell>
                <TypeBadge label={t(`mode.${service.mode}`)} />
              </TableCell>
              <TableCell>
                <HealthBadge status={service.status} />
              </TableCell>
              <TableCell>
                {service.last_checked_at
                  ? df.dateTime(service.last_checked_at)
                  : "-"}
              </TableCell>
              <TableCell className="tabular-nums">
                {service.failures_24h}
              </TableCell>
            </TableRow>
          ))}
          {services.length === 0 && <EmptyRow columns={5} />}
        </TableBody>
      </Table>
    </div>
  );
}

function EventLedger({ exceptionsOnly }: { exceptionsOnly: boolean }) {
  const t = useTranslations("monitoring");
  const common = useTranslations("common");
  const table = useTranslations("table");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("");
  const [resolution, setResolution] = useState("");
  const [handling, setHandling] = useState<{
    event: SystemEvent;
    status: "ACKNOWLEDGED" | "RESOLVED";
  } | null>(null);
  const [note, setNote] = useState("");
  const query = useQuery({
    queryKey: [
      "monitoring",
      "events",
      exceptionsOnly,
      page,
      search,
      severity,
      resolution,
    ],
    queryFn: () =>
      getSystemEvents({
        page,
        page_size: 25,
        search,
        severity,
        resolution_status: resolution,
        exception_only: exceptionsOnly,
        sort_by: "occurred_at",
        sort_order: "desc",
      }),
  });
  const save = useMutation({
    mutationFn: () =>
      recordSystemEventResolution(handling!.event.id, {
        status: handling!.status,
        note: note.trim(),
      }),
    onSuccess: () => {
      setHandling(null);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["monitoring"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-[minmax(12rem,1fr)_12rem_12rem]">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder={t("eventSearchPlaceholder")}
        />
        <FilterSelect
          value={severity}
          onChange={(value) => {
            setSeverity(value);
            setPage(1);
          }}
          ariaLabel={t("field.severity")}
          options={["", "INFO", "WARNING", "ERROR", "CRITICAL"].map(
            (value) => ({
              value,
              label: value ? t(`severity.${value}`) : common("all"),
            }),
          )}
        />
        <FilterSelect
          value={resolution}
          onChange={(value) => {
            setResolution(value);
            setPage(1);
          }}
          ariaLabel={t("field.resolutionStatus")}
          options={["", "OPEN", "ACKNOWLEDGED", "RESOLVED"].map((value) => ({
            value,
            label: value ? t(`resolution.${value}`) : common("all"),
          }))}
        />
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("field.time")}</TableHead>
              <TableHead>{t("field.service")}</TableHead>
              <TableHead>{t("field.exception")}</TableHead>
              <TableHead>{t("field.severity")}</TableHead>
              <TableHead>{t("field.resolutionStatus")}</TableHead>
              <TableHead>{t("field.handler")}</TableHead>
              <TableHead className="text-right">{t("field.action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data?.results.map((event) => (
              <TableRow key={event.id}>
                <TableCell>{df.dateTime(event.occurred_at)}</TableCell>
                <TableCell>{event.source}</TableCell>
                <TableCell className="max-w-80 whitespace-normal">
                  <p className="font-medium">{event.event_type}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.message || "-"}
                  </p>
                </TableCell>
                <TableCell>
                  <StatusBadge
                    label={t(`severity.${event.severity}`)}
                    tone={severityTone(event.severity)}
                  />
                </TableCell>
                <TableCell>
                  <StatusBadge
                    label={t(`resolution.${event.resolution_status}`)}
                    tone={resolutionTone(event.resolution_status)}
                  />
                </TableCell>
                <TableCell>{event.handled_by_name ?? "-"}</TableCell>
                <TableCell className="text-right">
                  {exceptionsOnly && event.resolution_status !== "RESOLVED" ? (
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setHandling({ event, status: "ACKNOWLEDGED" });
                          setNote("");
                        }}
                      >
                        <Activity />
                        {t("action.acknowledge")}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setHandling({ event, status: "RESOLVED" });
                          setNote("");
                        }}
                      >
                        <CheckCircle2 />
                        {t("action.resolve")}
                      </Button>
                    </div>
                  ) : (
                    "-"
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!query.isLoading && (query.data?.results.length ?? 0) === 0 && (
              <EmptyRow columns={7} />
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {query.data
            ? t("recordsCount", { count: query.data.count })
            : common("loading")}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            {table("previous")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!query.data || page >= query.data.total_pages}
            onClick={() => setPage((current) => current + 1)}
          >
            {table("next")}
          </Button>
        </div>
      </div>

      <Dialog
        open={handling !== null}
        onOpenChange={(open) => !open && setHandling(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {handling
                ? t(
                    `action.${handling.status === "RESOLVED" ? "resolve" : "acknowledge"}`,
                  )
                : ""}
            </DialogTitle>
            <DialogDescription>
              {handling?.event.event_type ?? ""}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("handlingNotePlaceholder")}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setHandling(null)}>
              {common("cancel")}
            </Button>
            <Button
              disabled={!note.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              {common("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value || "ALL"} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function EmptyRow({ columns }: { columns: number }) {
  const t = useTranslations("monitoring");
  return (
    <TableRow>
      <TableCell
        colSpan={columns}
        className="h-28 text-center text-muted-foreground"
      >
        {t("empty")}
      </TableCell>
    </TableRow>
  );
}

function healthTone(status: HealthStatus) {
  if (status === "ok" || status === "configured") return "positive" as const;
  if (status === "degraded") return "warning" as const;
  if (status === "not_configured" || status === "not_running")
    return "neutral" as const;
  return "danger" as const;
}

function severityTone(severity: string) {
  if (severity === "CRITICAL" || severity === "ERROR") return "danger" as const;
  if (severity === "WARNING") return "warning" as const;
  return "info" as const;
}

function resolutionTone(status: SystemEvent["resolution_status"]) {
  if (status === "RESOLVED") return "positive" as const;
  if (status === "ACKNOWLEDGED") return "warning" as const;
  return "danger" as const;
}
