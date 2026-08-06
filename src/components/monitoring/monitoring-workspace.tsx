"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Camera,
  CheckCircle2,
  RefreshCw,
  ScanLine,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

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
  IntegrationMonitor,
  MonitoringOverview,
  SystemEvent,
} from "@/interfaces/platform-ops";
import { useDateFormat } from "@/lib/dates";
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

  const title = section === "overview" ? t("title") : t(`section.${section}.title`);
  const subtitle =
    section === "overview"
      ? t("subtitle")
      : t(`section.${section}.subtitle`);

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
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

      {section === "overview" ? (
        <div className="min-h-0 flex-1 overflow-y-auto border-y bg-card">
          <div className="grid md:grid-cols-2 xl:grid-cols-3">
            {SUBMODULES.map((module) => (
              <Link
                key={module.section}
                href={`/monitoring/${module.section}`}
                className="flex min-h-20 items-center gap-3 border-b border-r px-5 py-4 transition-colors hover:bg-muted/40"
              >
                <span className="w-14 text-xs font-semibold tabular-nums text-muted-foreground">
                  {module.number}
                </span>
                <span className="min-w-0 flex-1 font-medium">
                  {t(`section.${module.section}.title`)}
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      ) : overview.isError ? (
        <div className="border-y py-12 text-center text-sm text-muted-foreground">
          {t("loadError")}
        </div>
      ) : overview.isLoading || !overview.data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-md" />
          ))}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SectionContent
            section={section}
            data={overview.data}
            serviceSearch={serviceSearch}
            setServiceSearch={setServiceSearch}
          />
        </div>
      )}

      {overview.data && section !== "overview" && (
        <p className="text-xs text-muted-foreground">
          {t("checkedAt", { value: df.dateTime(overview.data.generated_at) })}
        </p>
      )}
    </div>
  );
}

function SectionContent({
  section,
  data,
  serviceSearch,
  setServiceSearch,
}: {
  section: Exclude<MonitoringSection, "overview">;
  data: MonitoringOverview;
  serviceSearch: string;
  setServiceSearch: (value: string) => void;
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
                  <p className="text-xs text-muted-foreground">{scale.name}</p>
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
    );
  }

  if (section === "cctv") return <IntegrationSection monitor={data.cctv} icon={Camera} />;
  if (section === "anpr") return <IntegrationSection monitor={data.anpr} icon={ScanLine} />;

  if (section === "api-gateway") {
    return (
      <div className="space-y-5">
        <ModeLine mode={data.api_gateway.mode} status={data.api_gateway.status} />
        <MetricGrid
          items={[
            ["requests24h", data.api_gateway.requests_24h],
            ["failures24h", data.api_gateway.failures_24h],
            ["successRate", `${format.number(data.api_gateway.success_rate)}%`],
            ["averageLatency", `${format.number(data.api_gateway.average_latency_ms)} ms`],
            ["maxLatency", `${format.number(data.api_gateway.max_latency_ms)} ms`],
          ]}
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
        <Table>
          <TableHeader><TableRow><TableHead>{t("field.service")}</TableHead><TableHead>{t("field.company")}</TableHead><TableHead>{t("field.mode")}</TableHead><TableHead>{t("field.status")}</TableHead><TableHead>{t("field.lastChecked")}</TableHead><TableHead>{t("field.exception")}</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.sync.integrations.map((row) => <TableRow key={row.id}><TableCell><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.kind}</p></TableCell><TableCell>{row.company}</TableCell><TableCell><TypeBadge label={t(`mode.${row.mode}`)} /></TableCell><TableCell>{row.status}</TableCell><TableCell>{row.last_success_at ?? "-"}</TableCell><TableCell className="max-w-64 truncate">{row.last_error || "-"}</TableCell></TableRow>)}
            {data.sync.integrations.length === 0 && <EmptyRow columns={6} />}
          </TableBody>
        </Table>
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
          className="max-w-md"
        />
        <ServiceTable services={services} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <MetricGrid
        items={[
          ["uptime", t("value.uptime", { value: Math.floor(data.runtime.uptime_seconds / 60) })],
          ["exceptions24h", data.runtime.exceptions_24h],
          ["averageLatency", `${format.number(data.runtime.average_response_ms)} ms`],
          ["apiSuccessRate", `${format.number(data.runtime.api_success_rate)}%`],
          ["syncSuccessRate", `${format.number(data.runtime.sync_success_rate)}%`],
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
}: {
  monitor: IntegrationMonitor;
  icon: typeof Camera;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 border-y py-4">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <span className="font-medium">{monitor.name}</span>
        <div className="ml-auto"><ModeLine mode={monitor.mode} status={monitor.status} /></div>
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
    </div>
  );
}

function MetricGrid({ items }: { items: Array<[string, string | number]> }) {
  const t = useTranslations("monitoring.metric");
  return (
    <div className="grid border-l border-t sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([key, value]) => (
        <div key={key} className="min-h-24 border-b border-r px-4 py-3">
          <p className="text-xs text-muted-foreground">{t(key)}</p>
          <p className="mt-3 text-xl font-semibold tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ModeLine({ mode, status }: { mode: "SIMULATED" | "LIVE"; status: HealthStatus }) {
  const t = useTranslations("monitoring");
  return (
    <div className="flex items-center gap-2">
      <TypeBadge label={t(`mode.${mode}`)} />
      <HealthBadge status={status} />
    </div>
  );
}

function HealthBadge({ status }: { status: HealthStatus }) {
  const t = useTranslations("monitoring.health");
  return <StatusBadge label={t(status)} tone={healthTone(status)} />;
}

function ServiceTable({ services }: { services: MonitoringOverview["services"] }) {
  const t = useTranslations("monitoring");
  const df = useDateFormat();
  return (
    <Table>
      <TableHeader><TableRow><TableHead>{t("field.service")}</TableHead><TableHead>{t("field.mode")}</TableHead><TableHead>{t("field.status")}</TableHead><TableHead>{t("field.lastChecked")}</TableHead><TableHead>{t("field.failures24h")}</TableHead></TableRow></TableHeader>
      <TableBody>
        {services.map((service) => <TableRow key={service.key}><TableCell className="font-medium">{service.name}</TableCell><TableCell><TypeBadge label={t(`mode.${service.mode}`)} /></TableCell><TableCell><HealthBadge status={service.status} /></TableCell><TableCell>{service.last_checked_at ? df.dateTime(service.last_checked_at) : "-"}</TableCell><TableCell className="tabular-nums">{service.failures_24h}</TableCell></TableRow>)}
        {services.length === 0 && <EmptyRow columns={5} />}
      </TableBody>
    </Table>
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
    queryKey: ["monitoring", "events", exceptionsOnly, page, search, severity, resolution],
    queryFn: () => getSystemEvents({
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
    mutationFn: () => recordSystemEventResolution(handling!.event.id, {
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
        <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("eventSearchPlaceholder")} />
        <FilterSelect value={severity} onChange={(value) => { setSeverity(value); setPage(1); }} ariaLabel={t("field.severity")} options={["", "INFO", "WARNING", "ERROR", "CRITICAL"].map((value) => ({ value, label: value ? t(`severity.${value}`) : common("all") }))} />
        <FilterSelect value={resolution} onChange={(value) => { setResolution(value); setPage(1); }} ariaLabel={t("field.resolutionStatus")} options={["", "OPEN", "ACKNOWLEDGED", "RESOLVED"].map((value) => ({ value, label: value ? t(`resolution.${value}`) : common("all") }))} />
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>{t("field.time")}</TableHead><TableHead>{t("field.service")}</TableHead><TableHead>{t("field.exception")}</TableHead><TableHead>{t("field.severity")}</TableHead><TableHead>{t("field.resolutionStatus")}</TableHead><TableHead>{t("field.handler")}</TableHead><TableHead className="text-right">{t("field.action")}</TableHead></TableRow></TableHeader>
        <TableBody>
          {query.data?.results.map((event) => <TableRow key={event.id}><TableCell>{df.dateTime(event.occurred_at)}</TableCell><TableCell>{event.source}</TableCell><TableCell className="max-w-80 whitespace-normal"><p className="font-medium">{event.event_type}</p><p className="text-xs text-muted-foreground">{event.message || "-"}</p></TableCell><TableCell><StatusBadge label={t(`severity.${event.severity}`)} tone={severityTone(event.severity)} /></TableCell><TableCell><StatusBadge label={t(`resolution.${event.resolution_status}`)} tone={resolutionTone(event.resolution_status)} /></TableCell><TableCell>{event.handled_by_name ?? "-"}</TableCell><TableCell className="text-right">{exceptionsOnly && event.resolution_status !== "RESOLVED" ? <div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => { setHandling({ event, status: "ACKNOWLEDGED" }); setNote(""); }}><Activity />{t("action.acknowledge")}</Button><Button size="sm" onClick={() => { setHandling({ event, status: "RESOLVED" }); setNote(""); }}><CheckCircle2 />{t("action.resolve")}</Button></div> : "-"}</TableCell></TableRow>)}
          {!query.isLoading && (query.data?.results.length ?? 0) === 0 && <EmptyRow columns={7} />}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{query.data ? t("recordsCount", { count: query.data.count }) : common("loading")}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{table("previous")}</Button><Button size="sm" variant="outline" disabled={!query.data || page >= query.data.total_pages} onClick={() => setPage((current) => current + 1)}>{table("next")}</Button></div></div>

      <Dialog open={handling !== null} onOpenChange={(open) => !open && setHandling(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{handling ? t(`action.${handling.status === "RESOLVED" ? "resolve" : "acknowledge"}`) : ""}</DialogTitle><DialogDescription>{handling?.event.event_type ?? ""}</DialogDescription></DialogHeader>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("handlingNotePlaceholder")} />
          <DialogFooter><Button variant="outline" onClick={() => setHandling(null)}>{common("cancel")}</Button><Button disabled={!note.trim() || save.isPending} onClick={() => save.mutate()}>{common("save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterSelect({ value, onChange, options, ariaLabel }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; ariaLabel: string }) {
  return <select aria-label={ariaLabel} className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value || "ALL"} value={option.value}>{option.label}</option>)}</select>;
}

function EmptyRow({ columns }: { columns: number }) {
  const t = useTranslations("monitoring");
  return <TableRow><TableCell colSpan={columns} className="h-28 text-center text-muted-foreground">{t("empty")}</TableCell></TableRow>;
}

function healthTone(status: HealthStatus) {
  if (status === "ok" || status === "configured") return "positive" as const;
  if (status === "degraded") return "warning" as const;
  if (status === "not_configured" || status === "not_running") return "neutral" as const;
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
