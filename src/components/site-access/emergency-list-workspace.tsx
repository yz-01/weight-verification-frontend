"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, Phone, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper, ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { exportEmergencyList, getEmergencyList } from "@/services/site-access.service";

export function EmergencyListWorkspace() {
  const t = useTranslations("siteControl");
  const [project, setProject] = useState("all");
  const rows = useQuery({
    queryKey: ["emergency-list", project],
    queryFn: () => getEmergencyList(project === "all" ? undefined : project),
    refetchInterval: 30_000,
  });
  return <div className="space-y-5"><ListHeader title={t("emergency.title")} subtitle={t("emergency.subtitle")} action={<div className="flex gap-2"><Button size="sm" variant="outline" disabled={rows.isFetching} onClick={() => void rows.refetch()}><RefreshCw className={rows.isFetching ? "animate-spin" : ""} />{t("action.refresh")}</Button><Button size="sm" onClick={() => void exportEmergencyList(project === "all" ? undefined : project)}><Download />Excel</Button></div>} />
    <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[minmax(240px,1fr)_auto] sm:items-end"><FieldWrapper label={t("field.project")}><ProjectPicker value={project} onValueChange={setProject} placeholder={t("field.chooseProject")} allowAll allLabel={t("field.allProjects")} /></FieldWrapper><div className="flex h-12 items-center gap-3 rounded-lg border border-warning/25 bg-warning/5 px-4"><Users className="text-warning" /><div><p className="text-xs text-muted-foreground">{t("emergency.currentCount")}</p><p className="font-semibold tabular-nums">{rows.data?.count ?? 0}</p></div></div></div>
    <div className="rounded-lg border border-warning/25 bg-warning/5 p-4"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 shrink-0 text-warning" /><div><h2 className="font-semibold">{t("emergency.useTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("emergency.useHelp")}</p></div></div></div>
    {rows.isLoading ? <State text={t("state.loading")} /> : rows.isError ? <State text={t("state.loadError")} danger /> : !rows.data?.count ? <State text={t("emergency.empty")} /> : <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[880px] text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr>{["person", "type", "company", "project", "enteredAt", "duration", "gate", "contact"].map((key) => <th key={key} className="px-4 py-3 font-medium">{t(`table.${key}`)}</th>)}</tr></thead><tbody className="divide-y">{rows.data.people.map((row) => <tr key={row.event_id} className="bg-card"><td className="px-4 py-3"><p className="font-semibold">{row.subject_name}</p><p className="text-xs text-muted-foreground">{row.pass_no}</p></td><td className="px-4 py-3"><StatusBadge label={t(`subjectType.${row.subject_type}`)} tone="info" /></td><td className="px-4 py-3">{row.subject_company || "-"}</td><td className="px-4 py-3">{row.project_name}</td><td className="px-4 py-3">{new Date(row.entered_at).toLocaleString()}</td><td className="px-4 py-3 font-medium tabular-nums">{duration(row.minutes_on_site, t)}</td><td className="px-4 py-3">{row.gate_name || "-"}</td><td className="px-4 py-3">{row.phone ? <a className="inline-flex items-center gap-2 text-primary hover:underline" href={`tel:${row.phone}`}><Phone className="size-4" />{row.phone}</a> : "-"}</td></tr>)}</tbody></table></div>}
    {rows.dataUpdatedAt > 0 && <p className="text-xs text-muted-foreground">{t("emergency.updated", { time: new Date(rows.dataUpdatedAt).toLocaleTimeString() })}</p>}
  </div>;
}

function duration(minutes: number, t: ReturnType<typeof useTranslations<"siteControl">>) { const hours = Math.floor(minutes / 60); const remaining = minutes % 60; return hours ? t("emergency.durationHours", { hours, minutes: remaining }) : t("emergency.durationMinutes", { minutes }); }
function State({ text, danger = false }: { text: string; danger?: boolean }) { return <div className={`grid min-h-48 place-items-center rounded-lg border border-dashed p-6 text-center text-sm ${danger ? "text-destructive" : "text-muted-foreground"}`}>{text}</div>; }
