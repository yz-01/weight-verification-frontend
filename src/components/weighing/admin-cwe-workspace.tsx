"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Eye,
  Gauge,
  Pencil,
  Plus,
  RadioTower,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { AuditLogs } from "@/components/audit/audit-logs";
import {
  FieldWrapper,
  ListHeader,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HealthStatus, MonitoringOverview } from "@/interfaces/platform-ops";
import type {
  Scale,
  SessionState,
  SessionVerdict,
  WeighSessionRow,
} from "@/interfaces/weighing";
import { ANOMALY_CODES } from "@/interfaces/weighing";
import { useDateFormat } from "@/lib/dates";
import { getCompanies } from "@/services/companies.service";
import { getMonitoringOverview } from "@/services/platform-ops.service";
import {
  getScales,
  getWeighAnomalies,
  getWeighSessions,
  getWeighSummary,
} from "@/services/weighing.service";

export type AdminCWESection =
  | "overview"
  | "scales"
  | "connections"
  | "live-weighing"
  | "anomalies"
  | "search"
  | "statistics"
  | "service-status"
  | "activity";

const SUBMODULES: Array<{
  section: Exclude<AdminCWESection, "overview">;
  number: string;
}> = [
  { section: "scales", number: "8.2.1" },
  { section: "connections", number: "8.2.2" },
  { section: "live-weighing", number: "8.2.3" },
  { section: "anomalies", number: "8.2.4" },
  { section: "search", number: "8.2.5" },
  { section: "statistics", number: "8.2.6" },
  { section: "service-status", number: "8.2.7" },
  { section: "activity", number: "8.2.8" },
];

export function AdminCWEWorkspace({
  section = "overview",
}: {
  section?: AdminCWESection;
}) {
  const t = useTranslations("adminCwe");
  if (section === "activity") {
    return (
      <AuditLogs
        title={t("section.activity.title")}
        subtitle={t("section.activity.subtitle")}
      />
    );
  }
  let content: React.ReactNode;
  if (section === "overview") content = <ModuleIndex />;
  else if (section === "scales") content = <ScaleRegister />;
  else if (section === "connections") content = <ConnectionStatus />;
  else if (section === "live-weighing") content = <LiveWeighing />;
  else if (section === "anomalies") content = <AnomalyLedger />;
  else if (section === "search") content = <SessionSearch />;
  else if (section === "statistics") content = <CWEStatistics />;
  else content = <CWEServiceStatus />;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={section === "overview" ? t("title") : t(`section.${section}.title`)}
        subtitle={section === "overview" ? t("subtitle") : t(`section.${section}.subtitle`)}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
    </div>
  );
}

function ModuleIndex() {
  const t = useTranslations("adminCwe");
  return <div className="border-y bg-card"><div className="grid md:grid-cols-2 xl:grid-cols-3">{SUBMODULES.map((module) => <Link key={module.section} href={`/weighing/admin/${module.section}`} className="flex min-h-20 items-center gap-3 border-b border-r px-5 py-4 transition-colors hover:bg-muted/40"><span className="w-14 text-xs font-semibold tabular-nums text-muted-foreground">{module.number}</span><span className="min-w-0 flex-1 font-medium">{t(`section.${module.section}.title`)}</span><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>)}</div></div>;
}

function useCWEOverview() {
  return useQuery({
    queryKey: ["monitoring", "overview"],
    queryFn: getMonitoringOverview,
    refetchInterval: 15_000,
  });
}

function ScaleRegister() {
  const t = useTranslations("adminCwe");
  const common = useTranslations("common");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const companies = useQuery({ queryKey: ["companies", "cwe-options"], queryFn: () => getCompanies({ page_size: 250, sort_by: "name", sort_order: "asc" }) });
  const scales = useQuery({ queryKey: ["admin-cwe", "scales", page, search, company], queryFn: () => getScales({ page, page_size: 25, search, company, sort_by: "code", sort_order: "asc" }) });
  return <div className="space-y-4"><div className="flex flex-wrap items-end gap-2"><Input className="min-w-56 flex-1" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("scaleSearchPlaceholder")} /><SelectControl ariaLabel={t("field.company")} value={company} onChange={(value) => { setCompany(value); setPage(1); }} options={[{ value: "", label: common("all") }, ...(companies.data?.results ?? []).map((row) => ({ value: row.id, label: `${row.code} - ${row.name}` }))]} /><Button asChild><Link href="/scales/create"><Plus />{t("action.registerScale")}</Link></Button></div><ScaleTable scales={scales.data?.results ?? []} mode="register" /><Pagination page={page} totalPages={scales.data?.total_pages ?? 0} count={scales.data?.count} onPage={setPage} /></div>;
}

function ConnectionStatus() {
  const overview = useCWEOverview();
  return <div className="space-y-5"><CWEHeadline data={overview.data} /><ScaleTable scales={overview.data?.cwe.scales ?? []} mode="connections" /></div>;
}

function LiveWeighing() {
  const t = useTranslations("adminCwe");
  const format = useFormatter();
  const df = useDateFormat();
  const overview = useCWEOverview();
  const sessions = useQuery({ queryKey: ["admin-cwe", "active-sessions"], queryFn: () => getWeighSessions({ page_size: 50, state: "ON_SCALE", sort_by: "started_at", sort_order: "desc" }), refetchInterval: 15_000 });
  return <div className="space-y-5"><CWEHeadline data={overview.data} /><Table><TableHeader><TableRow><TableHead>{t("field.scale")}</TableHead><TableHead>{t("field.company")}</TableHead><TableHead>{t("field.site")}</TableHead><TableHead>{t("field.currentWeight")}</TableHead><TableHead>{t("field.lastCommunication")}</TableHead><TableHead>{t("field.stability")}</TableHead></TableRow></TableHeader><TableBody>{overview.data?.cwe.scales.map((scale) => <TableRow key={scale.id}><TableCell><p className="font-medium">{scale.code}</p><p className="text-xs text-muted-foreground">{scale.name}</p></TableCell><TableCell>{scale.company}</TableCell><TableCell>{scale.site}</TableCell><TableCell className="tabular-nums">{scale.current_weight_kg === null ? "-" : `${format.number(Number(scale.current_weight_kg))} kg`}</TableCell><TableCell>{scale.last_seen_at ? df.dateTime(scale.last_seen_at) : "-"}</TableCell><TableCell><StatusBadge label={t(`connection.${scale.online ? "ONLINE" : "OFFLINE"}`)} tone={scale.online ? "positive" : "danger"} /></TableCell></TableRow>)}{!overview.isLoading && (overview.data?.cwe.scales.length ?? 0) === 0 && <EmptyRow columns={6} />}</TableBody></Table><h3 className="text-sm font-semibold">{t("live.activeSessions")}</h3><SessionTable sessions={sessions.data?.results ?? []} /></div>;
}

function AnomalyLedger() {
  const t = useTranslations("adminCwe");
  const common = useTranslations("common");
  const df = useDateFormat();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [code, setCode] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const anomalies = useQuery({ queryKey: ["admin-cwe", "anomalies", page, search, code, from, to], queryFn: () => getWeighAnomalies({ page, page_size: 25, search, code, date_from: from, date_to: to, sort_by: "detected_at", sort_order: "desc" }) });
  return <div className="space-y-4"><div className="flex flex-wrap gap-2"><Input className="min-w-56 flex-1" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("anomalySearchPlaceholder")} /><SelectControl ariaLabel={t("field.anomaly")} value={code} onChange={(value) => { setCode(value); setPage(1); }} options={[{ value: "", label: common("all") }, ...ANOMALY_CODES.map((value) => ({ value, label: t(`anomaly.${value}`) }))]} /></div><DateRange from={from} to={to} setFrom={(value) => { setFrom(value); setPage(1); }} setTo={(value) => { setTo(value); setPage(1); }} /><Table><TableHeader><TableRow><TableHead>{t("field.detectedAt")}</TableHead><TableHead>{t("field.company")}</TableHead><TableHead>{t("field.scale")}</TableHead><TableHead>{t("field.session")}</TableHead><TableHead>{t("field.anomaly")}</TableHead><TableHead>{t("field.evidence")}</TableHead></TableRow></TableHeader><TableBody>{anomalies.data?.results.map((row) => <TableRow key={row.id}><TableCell>{df.dateTime(row.detected_at)}</TableCell><TableCell>{row.company_name}</TableCell><TableCell>{row.scale_code} - {row.scale_name}</TableCell><TableCell><Link className="text-primary hover:underline" href={`/weighing/${row.session}`}>{row.session_no}</Link></TableCell><TableCell><StatusBadge label={t(`anomaly.${row.code}`)} tone="danger" /></TableCell><TableCell className="max-w-64 truncate font-mono text-xs">{JSON.stringify(row.evidence)}</TableCell></TableRow>)}{!anomalies.isLoading && (anomalies.data?.results.length ?? 0) === 0 && <EmptyRow columns={6} />}</TableBody></Table><Pagination page={page} totalPages={anomalies.data?.total_pages ?? 0} count={anomalies.data?.count} onPage={setPage} /></div>;
}

function SessionSearch() {
  const t = useTranslations("adminCwe");
  const common = useTranslations("common");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [verdict, setVerdict] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const sessions = useQuery({ queryKey: ["admin-cwe", "sessions", page, search, state, verdict, from, to], queryFn: () => getWeighSessions({ page, page_size: 25, search, state, verdict, date_from: from, date_to: to, sort_by: "started_at", sort_order: "desc" }) });
  return <div className="space-y-4"><div className="flex flex-wrap gap-2"><Input className="min-w-56 flex-1" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("sessionSearchPlaceholder")} /><SelectControl ariaLabel={t("field.state")} value={state} onChange={(value) => { setState(value); setPage(1); }} options={[{ value: "", label: common("all") }, ...(["OPEN", "ON_SCALE", "STABLE", "COMPLETED", "VOID"] as SessionState[]).map((value) => ({ value, label: t(`state.${value}`) }))]} /><SelectControl ariaLabel={t("field.verdict")} value={verdict} onChange={(value) => { setVerdict(value); setPage(1); }} options={[{ value: "", label: common("all") }, ...(["PENDING", "VALID", "INVALID"] as SessionVerdict[]).map((value) => ({ value, label: t(`verdict.${value}`) }))]} /></div><DateRange from={from} to={to} setFrom={(value) => { setFrom(value); setPage(1); }} setTo={(value) => { setTo(value); setPage(1); }} /><SessionTable sessions={sessions.data?.results ?? []} /><Pagination page={page} totalPages={sessions.data?.total_pages ?? 0} count={sessions.data?.count} onPage={setPage} /></div>;
}

function CWEStatistics() {
  const t = useTranslations("adminCwe");
  const overview = useCWEOverview();
  const summary = useQuery({ queryKey: ["admin-cwe", "summary"], queryFn: getWeighSummary });
  const cwe = overview.data?.cwe;
  return <div className="space-y-5"><CWEHeadline data={overview.data} /><MetricGrid items={[["totalScales", cwe?.total_scales ?? 0], ["onlineGateways", cwe?.online_gateways ?? 0], ["offlineGateways", cwe?.offline_gateways ?? 0], ["totalSessions", summary.data?.total ?? 0], ["validSessions", summary.data?.by_verdict.VALID ?? 0], ["invalidSessions", summary.data?.by_verdict.INVALID ?? 0], ["anomaliesToday", cwe?.anomalies_today ?? 0], ["reweighsToday", cwe?.reweighs_today ?? 0], ["requiresReview", summary.data?.requires_review ?? 0]]} /><p className="text-xs text-muted-foreground">{t("statisticsNote")}</p></div>;
}

function CWEServiceStatus() {
  const t = useTranslations("adminCwe");
  const df = useDateFormat();
  const overview = useCWEOverview();
  const data = overview.data;
  const cweService = data?.services.find((service) => service.key === "cwe");
  return <div className="space-y-5"><CWEHeadline data={data} /><MetricGrid items={[["uptime", data ? `${Math.floor(data.runtime.uptime_seconds / 60)} min` : "-"], ["averageLatency", data ? `${data.runtime.average_response_ms} ms` : "-"], ["apiSuccessRate", data ? `${data.runtime.api_success_rate}%` : "-"], ["syncSuccessRate", data ? `${data.runtime.sync_success_rate}%` : "-"], ["failures24h", cweService?.failures_24h ?? 0]]} /><div className="border-y py-4"><div className="flex flex-wrap items-center gap-3"><Gauge className="h-5 w-5 text-muted-foreground" /><span className="font-medium">Cloud Weighing Engine</span>{cweService && <><TypeBadge label={t(`mode.${cweService.mode}`)} /><HealthBadge status={cweService.status} /></>}<span className="ml-auto text-sm text-muted-foreground">{cweService?.last_checked_at ? df.dateTime(cweService.last_checked_at) : "-"}</span></div></div></div>;
}

function CWEHeadline({ data }: { data?: MonitoringOverview }) {
  const t = useTranslations("adminCwe");
  return <div className="flex flex-wrap items-center gap-3 border-y py-4"><RadioTower className="h-5 w-5 text-muted-foreground" /><span className="font-medium">Cloud Weighing Engine</span>{data && <><TypeBadge label={t(`mode.${data.cwe.mode}`)} /><HealthBadge status={data.cwe.status} /><span className="ml-auto text-sm text-muted-foreground">{t("refresh15s")}</span></>}</div>;
}

function ScaleTable({ scales, mode }: { scales: Scale[] | MonitoringOverview["cwe"]["scales"]; mode: "register" | "connections" }) {
  const t = useTranslations("adminCwe");
  const df = useDateFormat();
  const isMonitoring = (scale: Scale | MonitoringOverview["cwe"]["scales"][number]): scale is MonitoringOverview["cwe"]["scales"][number] => "online" in scale;
  return <Table><TableHeader><TableRow><TableHead>{t("field.scale")}</TableHead><TableHead>{t("field.company")}</TableHead><TableHead>{t("field.site")}</TableHead><TableHead>{t("field.protocol")}</TableHead><TableHead>{mode === "connections" ? t("field.lastCommunication") : t("field.gateway")}</TableHead><TableHead>{t("field.status")}</TableHead><TableHead className="text-right">{t("field.action")}</TableHead></TableRow></TableHeader><TableBody>{scales.map((scale) => { const monitored = isMonitoring(scale); return <TableRow key={scale.id}><TableCell><p className="font-medium">{scale.code}</p><p className="text-xs text-muted-foreground">{scale.name}</p></TableCell><TableCell>{monitored ? scale.company : `${scale.company_code} - ${scale.company_name}`}</TableCell><TableCell>{monitored ? scale.site : scale.site_name}</TableCell><TableCell>{scale.protocol}</TableCell><TableCell>{monitored ? (scale.last_seen_at ? df.dateTime(scale.last_seen_at) : "-") : scale.gateway_count ?? 0}</TableCell><TableCell>{monitored ? <StatusBadge label={t(`connection.${scale.online ? "ONLINE" : "OFFLINE"}`)} tone={scale.online ? "positive" : "danger"} /> : <StatusBadge label={t(`connection.${scale.is_active ? "ENABLED" : "DISABLED"}`)} tone={scale.is_active ? "positive" : "neutral"} />}</TableCell><TableCell><div className="flex justify-end gap-1"><Button asChild size="icon-sm" variant="ghost" title={t("action.manage")}><Link href={`/scales/${scale.id}/edit`}><Pencil /></Link></Button></div></TableCell></TableRow>; })}{scales.length === 0 && <EmptyRow columns={7} />}</TableBody></Table>;
}

function SessionTable({ sessions }: { sessions: WeighSessionRow[] }) {
  const t = useTranslations("adminCwe");
  const df = useDateFormat();
  const format = useFormatter();
  return <Table><TableHeader><TableRow><TableHead>{t("field.session")}</TableHead><TableHead>{t("field.company")}</TableHead><TableHead>{t("field.scale")}</TableHead><TableHead>{t("field.vehicle")}</TableHead><TableHead>{t("field.weight")}</TableHead><TableHead>{t("field.startedAt")}</TableHead><TableHead>{t("field.verdict")}</TableHead><TableHead className="text-right">{t("field.action")}</TableHead></TableRow></TableHeader><TableBody>{sessions.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.session_no}</TableCell><TableCell>{row.company_name}</TableCell><TableCell>{row.scale_name}</TableCell><TableCell>{row.vehicle_plate || "-"}</TableCell><TableCell className="tabular-nums">{row.stable_weight_kg ? `${format.number(Number(row.stable_weight_kg))} kg` : "-"}</TableCell><TableCell>{row.started_at ? df.dateTime(row.started_at) : "-"}</TableCell><TableCell><StatusBadge label={t(`verdict.${row.verdict}`)} tone={row.verdict === "VALID" ? "positive" : row.verdict === "INVALID" ? "danger" : "warning"} /></TableCell><TableCell><Button asChild size="icon-sm" variant="ghost" title={t("action.viewEvidence")}><Link href={`/weighing/${row.id}`}><Eye /></Link></Button></TableCell></TableRow>)}{sessions.length === 0 && <EmptyRow columns={8} />}</TableBody></Table>;
}

function MetricGrid({ items }: { items: Array<[string, string | number]> }) {
  const t = useTranslations("adminCwe.metric");
  return <div className="grid border-l border-t sm:grid-cols-2 lg:grid-cols-4">{items.map(([key, value]) => <div key={key} className="min-h-24 border-b border-r p-4"><p className="text-xs text-muted-foreground">{t(key)}</p><p className="mt-3 text-xl font-semibold tabular-nums">{value}</p></div>)}</div>;
}

function DateRange({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (value: string) => void; setTo: (value: string) => void }) {
  const t = useTranslations("adminCwe.field");
  return <div className="grid gap-2 sm:grid-cols-2"><FieldWrapper label={t("dateFrom")}><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></FieldWrapper><FieldWrapper label={t("dateTo")}><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></FieldWrapper></div>;
}

function SelectControl({ value, onChange, options, ariaLabel }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; ariaLabel: string }) {
  return <select aria-label={ariaLabel} className="h-9 min-w-40 rounded-md border bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value || "ALL"} value={option.value}>{option.label}</option>)}</select>;
}

function Pagination({ page, totalPages, count, onPage }: { page: number; totalPages: number; count?: number; onPage: (page: number) => void }) {
  const t = useTranslations("adminCwe");
  const table = useTranslations("table");
  return <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{t("count", { count: count ?? 0 })}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>{table("previous")}</Button><Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>{table("next")}</Button></div></div>;
}

function EmptyRow({ columns }: { columns: number }) {
  const t = useTranslations("adminCwe");
  return <TableRow><TableCell colSpan={columns} className="h-28 text-center text-muted-foreground">{t("empty")}</TableCell></TableRow>;
}

function HealthBadge({ status }: { status: HealthStatus }) {
  const t = useTranslations("monitoring.health");
  return <StatusBadge label={t(status)} tone={status === "ok" || status === "configured" ? "positive" : status === "degraded" ? "warning" : status === "not_configured" || status === "not_running" ? "neutral" : "danger"} />;
}
