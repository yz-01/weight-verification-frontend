"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Cable,
  Camera,
  CheckCircle2,
  CircleGauge,
  DatabaseZap,
  History,
  Info,
  Plus,
  RefreshCw,
  ScanLine,
  ServerCog,
  Settings2,
  Weight,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  FieldWrapper,
  ListHeader,
  QueryFailedNote,
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
  getRecentAccessReads,
  getRecentDeviceMediaForPlatform,
  createScheduledJob,
  getJobHandlers,
  getJobRuns,
  getScheduledJobs,
  getWorkerStatus,
  runJobNow,
  setScheduledJobActive,
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
  | "records"
  | "jobs";

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
  { section: "records", number: "6.2.10" },
  // Not a numbered clause of its own: this is the background work behind
  // the recovery and exception counters in 6.2.9, so it carries the "A"
  // prefix the repo already uses for supporting screens.
  { section: "jobs", number: "A6.2.9" },
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
  records: History,
  jobs: ServerCog,
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
              // A failed settings read is not "not configured": say so.
              failed: platformConfig.isError,
              retry: () => platformConfig.refetch(),
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
    failed?: boolean;
    retry?: () => unknown;
  };
}) {
  const t = useTranslations("monitoring");
  const format = useFormatter();

  if (section === "live-platform") {
    const needle = serviceSearch.trim().toLowerCase();
    const services = data.services.filter((service) =>
      [service.name, service.key, service.status, service.mode]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
    return (
      <div className="space-y-5">
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
        requestedModeFailed={requestedModes.failed}
        onRetryRequestedMode={requestedModes.retry}
        feed={<RecentCapturesPanel />}
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
        requestedModeFailed={requestedModes.failed}
        onRetryRequestedMode={requestedModes.retry}
        feed={<PlateReadsPanel />}
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
                    <p className="text-xs text-muted-foreground">
                      {t.has(`integrationKind.${row.kind}`)
                        ? t(`integrationKind.${row.kind}`)
                        : row.kind}
                    </p>
                  </TableCell>
                  <TableCell>{row.company}</TableCell>
                  <TableCell>
                    <TypeBadge label={t(`mode.${row.mode}`)} />
                  </TableCell>
                  <TableCell>
                    {t.has(`integrationStatus.${row.status}`)
                      ? t(`integrationStatus.${row.status}`)
                      : row.status}
                  </TableCell>
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

  if (section === "jobs") return <JobsPanel />;

  return null;
}

/**
 * The platform's own background work.
 *
 * Billing generation, subscription reminders, announcement publication and
 * monitoring snapshots all run as scheduled jobs. Nine endpoints served them
 * and nothing called any of them, so a failed run was invisible and there was
 * no way to re-run one without a shell.
 */
function JobsPanel() {
  const t = useTranslations("monitoring.jobs");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const jobs = useQuery({
    queryKey: ["scheduled-jobs"],
    queryFn: () => getScheduledJobs({ page_size: 100, sort_by: "code" }),
  });
  const workers = useQuery({
    queryKey: ["worker-status"],
    queryFn: getWorkerStatus,
  });
  const runs = useQuery({
    queryKey: ["job-runs", selected],
    queryFn: () =>
      getJobRuns({
        page_size: 50,
        job: selected || undefined,
        sort_by: "scheduled_for",
        sort_order: "desc",
      }),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["scheduled-jobs"] });
    void queryClient.invalidateQueries({ queryKey: ["job-runs"] });
  };
  const runNow = useMutation({ mutationFn: runJobNow, onSuccess: refresh });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setScheduledJobActive(id, active),
    onSuccess: refresh,
  });

  const rows = jobs.data?.results ?? [];

  return (
    <div className="space-y-4">
      {creating && (
        <CreateJobDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {/* A failed worker read shows a dash, not "0 workers running". */}
        <SummaryTile label={t("workers.total")} value={workers.data?.total} />
        <SummaryTile
          label={t("workers.active")}
          value={workers.data?.active}
          tone={
            !workers.data
              ? "neutral"
              : workers.data.active > 0
                ? "positive"
                : "warning"
          }
        />
        <SummaryTile
          label={t("workers.stale")}
          value={workers.data?.stale}
          tone={workers.data && workers.data.stale > 0 ? "danger" : "neutral"}
        />
      </div>
      <QueryFailedNote query={workers} what={t("what.workers")} />

      <section className="rounded-lg border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <ServerCog className="size-4 text-muted-foreground" />
          <p className="text-sm font-semibold">{t("title")}</p>
          <p className="text-xs text-muted-foreground">{t("help")}</p>
          <div className="ml-auto">
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              {t("addJob")}
            </Button>
          </div>
        </div>
        {jobs.isLoading ? (
          <Skeleton className="m-4 h-32" />
        ) : jobs.isError ? (
          <LoadFailed onRetry={() => void jobs.refetch()} />
        ) : !rows.length ? (
          <p className="m-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {["job", "schedule", "nextRun", "lastRun", "status"].map((key) => (
                    <TableHead key={key}>{t(`column.${key}`)}</TableHead>
                  ))}
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((job) => (
                  <TableRow
                    key={job.id}
                    data-state={selected === job.id ? "selected" : undefined}
                  >
                    <TableCell>
                      <button
                        type="button"
                        className="text-left"
                        onClick={() =>
                          setSelected(selected === job.id ? "" : job.id)
                        }
                      >
                        <span className="font-medium">{job.name}</span>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {job.handler}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {job.interval_minutes
                        ? t("everyMinutes", { minutes: job.interval_minutes })
                        : t("oneOff")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {df.dateTime(job.next_run_at)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {job.last_run_at ? df.dateTime(job.last_run_at) : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge
                          label={
                            job.last_run_state
                              ? t(`state.${job.last_run_state}`)
                              : t("state.NEVER")
                          }
                          tone={runTone(job.last_run_state)}
                        />
                        {!job.is_active && (
                          <StatusBadge label={t("paused")} tone="neutral" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={runNow.isPending}
                          onClick={() => runNow.mutate(job.id)}
                        >
                          <RefreshCw />
                          {t("action.runNow")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={toggle.isPending}
                          onClick={() =>
                            toggle.mutate({ id: job.id, active: !job.is_active })
                          }
                        >
                          {t(job.is_active ? "action.pause" : "action.resume")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <History className="size-4 text-muted-foreground" />
          <p className="text-sm font-semibold">{t("runs.title")}</p>
          <p className="text-xs text-muted-foreground">
            {selected ? t("runs.filtered") : t("runs.all")}
          </p>
          {selected && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => setSelected("")}
            >
              {t("runs.clearFilter")}
            </Button>
          )}
        </div>
        {runs.isLoading ? (
          <Skeleton className="m-4 h-24" />
        ) : runs.isError ? (
          <LoadFailed onRetry={() => void runs.refetch()} />
        ) : !(runs.data?.results ?? []).length ? (
          <p className="m-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {t("runs.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "scheduled",
                    "handler",
                    "state",
                    "attempt",
                    "finished",
                    "detail",
                  ].map((key) => (
                    <TableHead key={key}>{t(`runs.column.${key}`)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runs.data?.results ?? []).map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {df.dateTime(run.scheduled_for)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {run.handler}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={t(`state.${run.state}`)}
                        tone={runTone(run.state)}
                      />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {run.attempt}/{run.max_attempts}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {run.completed_at ? df.dateTime(run.completed_at) : "-"}
                    </TableCell>
                    <TableCell className="max-w-80 truncate text-xs text-muted-foreground">
                      {run.error || JSON.stringify(run.result ?? {})}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("monitoring");
  const common = useTranslations("common");
  return (
    <div className="m-4 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
      <p className="text-sm text-destructive">{t("jobs.loadError")}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw />
        {common("retry")}
      </Button>
    </div>
  );
}

function runTone(
  state: string,
): "positive" | "warning" | "danger" | "neutral" | "info" {
  if (state === "SUCCEEDED") return "positive";
  if (state === "FAILED" || state === "CANCELLED") return "danger";
  if (state === "RUNNING" || state === "QUEUED") return "info";
  if (state === "RETRY_WAIT") return "warning";
  return "neutral";
}

function SummaryTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  /** Undefined while loading or after a failed read: shown as a dash, never 0. */
  value: number | undefined;
  tone?: "positive" | "warning" | "danger" | "neutral";
}) {
  const common = useTranslations("common");
  const colour = {
    positive: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    neutral: "text-foreground",
  }[tone];
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${colour}`}>
        {value ?? common("emptyValue")}
      </p>
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
  requestedModeFailed = false,
  onRetryRequestedMode,
  feed,
}: {
  monitor: IntegrationMonitor;
  icon: typeof Camera;
  settingsHref: string;
  inventory: MonitoringOverview["integration_inventory"];
  kindFilter: string[];
  requestedMode?: "SIMULATED" | "LIVE";
  requestedModeFailed?: boolean;
  onRetryRequestedMode?: () => unknown;
  /** What the devices actually sent. Counters say a camera is online; only
   *  this says it is still producing anything. */
  feed?: React.ReactNode;
}) {
  const t = useTranslations("monitoring");
  const common = useTranslations("common");
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
            {requestedModeFailed ? (
              <>
                <span className="text-sm">{common("emptyValue")}</span>
                <QueryFailedNote
                  className="mt-1"
                  query={{ isError: true, refetch: onRetryRequestedMode }}
                  what={t("what.platformConfig")}
                />
              </>
            ) : requestedMode ? (
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
      {feed}
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
                  <TypeBadge
                    label={
                      t.has(`integrationKind.${row.kind}`)
                        ? t(`integrationKind.${row.kind}`)
                        : row.kind
                    }
                  />
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
                    <div className="flex items-center justify-end gap-0.5">
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
            {query.isError ? (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center">
                  <QueryFailedNote
                    query={query}
                    what={t("what.events")}
                    className="justify-center"
                  />
                </TableCell>
              </TableRow>
            ) : (
              !query.isLoading &&
              (query.data?.results.length ?? 0) === 0 && <EmptyRow columns={7} />
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {query.data
            ? t("recordsCount", { count: query.data.count })
            : query.isError
              ? common("emptyValue")
              : common("loading")}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabledReason={page <= 1 ? common("alreadyFirstPage") : undefined}
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
          <FieldWrapper label={t("handlingNotePlaceholder")} required>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </FieldWrapper>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHandling(null)}>
              {common("cancel")}
            </Button>
            <Button
              requires={[[note, t("handlingNotePlaceholder")]]}
              disabled={save.isPending}
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

/**
 * What the cameras have actually sent.
 *
 * The counters above answer "is the device reachable". This answers "is it
 * still producing evidence", which is the failure that matters and the one a
 * heartbeat cannot show: a camera can sit online for a week, cheerfully
 * heartbeating, and push nothing because its trigger stopped firing. The only
 * way to notice is to look at what arrived and when.
 */
function RecentCapturesPanel() {
  const t = useTranslations("monitoring");
  const df = useDateFormat();
  const format = useFormatter();
  const captures = useQuery({
    queryKey: ["device-media", "recent"],
    queryFn: () => getRecentDeviceMediaForPlatform({ page_size: 20 }),
  });

  const rows = captures.data?.results ?? [];

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("captures.title")}
      </h3>
      {captures.isError ? (
        <LoadFailed onRetry={() => void captures.refetch()} />
      ) : captures.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {t("captures.none")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("captures.capturedAt")}</TableHead>
                <TableHead>{t("captures.device")}</TableHead>
                <TableHead>{t("captures.kind")}</TableHead>
                <TableHead>{t("captures.size")}</TableHead>
                <TableHead>{t("captures.attachedTo")}</TableHead>
                <TableHead className="text-right">
                  {t("captures.action")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{df.dateTime(row.captured_at)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.device_name}
                  </TableCell>
                  <TableCell>
                    <TypeBadge label={t(`captures.kindLabel.${row.kind}`)} />
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {format.number(Math.round(row.size_bytes / 1024))} KB
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.source_model.split(".").pop()}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.is_purged ? (
                      // Not an error. The bytes went on schedule and the
                      // record of them did not, which is the whole point of
                      // the retention design.
                      <span className="text-xs text-muted-foreground">
                        {t("captures.purged", {
                          date: row.purged_at ? df.date(row.purged_at) : "",
                        })}
                      </span>
                    ) : row.file_url ? (
                      <Button asChild size="sm" variant="ghost">
                        <a
                          href={row.file_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("captures.view")}
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t("captures.unavailable")}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/**
 * Every plate read, card swipe and face match, with why it was allowed.
 *
 * "Could not read the plate" and "read it, and that vehicle has no permit" are
 * shown apart on purpose. Merged into one denial count, a dirty lens looks
 * exactly like a surge of unauthorised lorries, and the yard would go looking
 * for a security problem instead of a cloth.
 */
function PlateReadsPanel() {
  const t = useTranslations("monitoring");
  const df = useDateFormat();
  const events = useQuery({
    queryKey: ["third-party-access-events", "recent"],
    queryFn: () => getRecentAccessReads({ page_size: 20 }),
  });

  const rows = events.data?.results ?? [];
  const unreadable = rows.filter(
    (row) => row.recognition_result === "FAILED",
  ).length;
  const denied = rows.filter(
    (row) =>
      row.recognition_result === "RECOGNIZED" &&
      row.verification_result === "DENIED",
  ).length;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("plateReads.title")}
      </h3>
      {events.isError ? (
        <LoadFailed onRetry={() => void events.refetch()} />
      ) : events.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {t("plateReads.none")}
        </p>
      ) : (
        <>
          <MetricGrid
            items={[
              ["plateReads.recent", rows.length],
              ["plateReads.unreadable", unreadable],
              ["plateReads.denied", denied],
            ]}
          />
          <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("plateReads.occurredAt")}</TableHead>
                  <TableHead>{t("plateReads.gate")}</TableHead>
                  <TableHead>{t("plateReads.credential")}</TableHead>
                  <TableHead>{t("plateReads.direction")}</TableHead>
                  <TableHead>{t("plateReads.outcome")}</TableHead>
                  <TableHead>{t("plateReads.reason")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{df.dateTime(row.occurred_at)}</TableCell>
                    <TableCell>{row.gate_name || row.device_id}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.credential_hint || "-"}
                    </TableCell>
                    <TableCell>
                      <TypeBadge
                        label={t(`plateReads.directionLabel.${row.direction}`)}
                      />
                    </TableCell>
                    <TableCell>
                      {row.recognition_result === "FAILED" ? (
                        <HealthBadge status="degraded" />
                      ) : row.verification_result === "ALLOWED" ? (
                        <HealthBadge status="ok" />
                      ) : (
                        <HealthBadge status="unhealthy" />
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.recognition_result === "FAILED"
                        ? t("plateReads.couldNotRead")
                        : row.reason_code}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

const JOB_KINDS = [
  "DAILY_REPORT",
  "MONTHLY_REPORT",
  "SYSTEM_TASK",
  "NOTIFICATION",
  "CUSTOM",
] as const;

/**
 * Add a scheduled job.
 *
 * The handler is a picklist, not a text box: the API refuses any name outside
 * its registry, so typing one would mostly produce a 400. The registry is
 * filled at import time by whichever feature apps this deployment runs, which
 * makes the list the truth about what can be scheduled here rather than a
 * copy that drifts.
 *
 * `next_run_at` is required by the API and has no sensible server-side
 * default - "when should this first run" is a decision, not a formality - so
 * the form asks for it and refuses to submit without it.
 */
function CreateJobDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("monitoring.jobs");
  const common = useTranslations("common");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("SYSTEM_TASK");
  const [handler, setHandler] = useState("");
  const [interval, setInterval] = useState("60");
  const [firstRun, setFirstRun] = useState("");

  const handlers = useQuery({
    queryKey: ["job-handlers"],
    queryFn: getJobHandlers,
  });

  const intervalValue = interval.trim() ? Number(interval) : null;
  const intervalInvalid =
    intervalValue !== null &&
    (!Number.isInteger(intervalValue) || intervalValue < 1);

  const create = useMutation({
    mutationFn: () =>
      createScheduledJob({
        code: code.trim(),
        name: name.trim(),
        kind,
        handler,
        interval_minutes: intervalValue,
        next_run_at: new Date(firstRun).toISOString(),
        is_active: true,
      }),
    onSuccess: onCreated,
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addJob")}</DialogTitle>
          <DialogDescription>{t("addJobHelp")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <FieldWrapper label={t("field.code")} required>
            <Input value={code} onChange={(e) => setCode(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.name")} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.kind")}>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {JOB_KINDS.map((value) => (
                <option key={value} value={value}>
                  {t(`kind.${value}`)}
                </option>
              ))}
            </select>
          </FieldWrapper>
          <FieldWrapper label={t("field.handler")} required hint={t("field.handlerHint")}>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={handler}
              disabled={handlers.isLoading}
              onChange={(e) => setHandler(e.target.value)}
            >
              <option value="">{t("field.handlerPlaceholder")}</option>
              {(handlers.data ?? []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <QueryFailedNote query={handlers} what={t("what.handlers")} />
          </FieldWrapper>
          <FieldWrapper
            label={t("field.interval")} required
            hint={t("field.intervalHint")}
            error={intervalInvalid ? t("field.intervalError") : undefined}
          >
            <Input
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.firstRun")} required>
            <Input
              type="datetime-local"
              value={firstRun}
              onChange={(e) => setFirstRun(e.target.value)}
            />
          </FieldWrapper>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button requires={[[code, t("field.code")], [name, t("field.name")], [handler, t("field.handler")], [firstRun, t("field.firstRun")], [!intervalInvalid, t("field.interval")]]} disabled={create.isPending} onClick={() => create.mutate()}>
            {common("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
