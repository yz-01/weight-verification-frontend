"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, Phone, Printer, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { FieldWrapper, ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { usePageProject, useProjectBoxShown } from "@/components/providers/current-project-provider";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EmergencyPresence } from "@/interfaces/site-access";
import { useDateFormat } from "@/lib/dates";
import { exportEmergencyList, getEmergencyList } from "@/services/site-access.service";

/**
 * 紧急在场名单 (C21): everybody on site this moment, by the phone's fence and
 * through the gate on a pass, in one list to read out at a muster point.
 *
 * Counted by the L8 rules - the same records 人员进场 counts - so this list and
 * that page's 当前现场总人数 always agree. A phone that has not reported for a
 * while stays on the list, marked 未回报: at an assembly point it is safer to
 * look for somebody who has gone home than to forget somebody still inside.
 */
export function EmergencyListWorkspace() {
  const t = useTranslations("siteControl");
  const df = useDateFormat();
  const search = useSearchParams();
  // The top bar's 「当前项目」 when it is in force (B13); a link's `?project=`
  // moves it.
  const [project, setProject] = usePageProject(search.get("project") ?? "", { all: "all" });
  const projectBoxShown = useProjectBoxShown("filter");
  const rows = useQuery({
    queryKey: ["emergency-list", project],
    queryFn: () => getEmergencyList(project === "all" ? undefined : project),
    refetchInterval: 30_000,
  });
  const people = rows.data?.people ?? [];

  function print() {
    const popup = window.open("", "_blank", "width=1000,height=760");
    if (!popup) return;
    popup.document.write(printDocument(people, {
      title: t("emergency.title"),
      generated: t("emergency.printedAt", { time: df.dateTime(new Date().toISOString()) }),
      composition: t("emergency.composition", {
        total: rows.data?.count ?? 0,
        app: rows.data?.app_count ?? 0,
        gate: rows.data?.gate_count ?? 0,
      }),
      headings: ["person", "type", "source", "company", "project", "enteredAt", "duration", "gate", "contact"].map((key) =>
        t(key === "source" ? "emergency.source" : `table.${key}`),
      ),
      cells: (row) => [
        `${row.subject_name}${row.pass_no ? ` (${row.pass_no})` : ""}`,
        t(`subjectType.${row.subject_type}`),
        t(`emergency.sourceValue.${row.source}`),
        row.subject_company || "-",
        row.project_name,
        df.dateTime(row.entered_at),
        duration(row.minutes_on_site, t),
        row.gate_name || "-",
        row.phone || "-",
      ],
    }));
    popup.document.close();
  }

  return <div className="flex flex-col gap-4"><ListHeader title={t("emergency.title")} subtitle={t("emergency.subtitle")} action={<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={rows.isFetching} onClick={() => void rows.refetch()}><RefreshCw className={rows.isFetching ? "animate-spin" : ""} />{t("action.refresh")}</Button><Button variant="outline" disabled={!people.length} disabledReason={!people.length ? t("emergency.empty") : undefined} onClick={print}><Printer />{t("emergency.print")}</Button><Button onClick={() => void exportEmergencyList(project === "all" ? undefined : project)}><Download />Excel</Button></div>} />
    <div className="surface-panel grid gap-3 rounded-xl px-4 py-3 sm:grid-cols-[minmax(15rem,1fr)_auto] sm:items-end sm:px-6 sm:py-4">{projectBoxShown && <FieldWrapper label={t("field.project")}><ProjectPicker value={project} onValueChange={setProject} placeholder={t("field.chooseProject")} allowAll allLabel={t("field.allProjects")} /></FieldWrapper>}<div className="flex min-h-12 items-center gap-3 rounded-lg border border-warning/25 bg-warning/5 px-4 py-2"><Users className="text-warning" /><div><p className="text-xs text-muted-foreground">{t("emergency.currentCount")}</p><p className="font-semibold tabular">{rows.data?.count ?? 0}</p><p className="text-xs text-muted-foreground">{t("emergency.split", { app: rows.data?.app_count ?? 0, gate: rows.data?.gate_count ?? 0 })}</p></div></div></div>
    <div className="rounded-xl border border-warning/25 bg-warning/5 p-4"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 shrink-0 text-warning" /><div><h2 className="font-semibold">{t("emergency.useTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("emergency.useHelp")}</p></div></div></div>
    {rows.isLoading ? <State text={t("state.loading")} /> : rows.isError ? <State text={t("state.loadError")} danger /> : !rows.data?.count ? <State text={t("emergency.empty")} /> : <div className="surface-panel overflow-hidden rounded-xl"><Table className="min-w-250"><TableHeader><TableRow>{["person", "type", "source", "company", "project", "enteredAt", "duration", "gate", "contact"].map((key) => <TableHead key={key}>{key === "source" ? t("emergency.source") : t(`table.${key}`)}</TableHead>)}</TableRow></TableHeader><TableBody>{people.map((row) => <TableRow key={`${row.source}:${row.user_id ?? row.event_id}`}><TableCell><p className="font-semibold">{row.subject_name}</p><p className="text-xs text-muted-foreground">{row.pass_no}</p></TableCell><TableCell><StatusBadge label={t(`subjectType.${row.subject_type}`)} tone="info" /></TableCell><TableCell><p>{t(`emergency.sourceValue.${row.source}`)}</p>{row.source !== "GATE" && <p className={`text-xs ${row.stale ? "text-warning" : "text-muted-foreground"}`}>{row.last_report_at ? t(row.stale ? "emergency.stale" : "emergency.lastReport", { time: df.dateTime(row.last_report_at) }) : t("emergency.noReport")}</p>}</TableCell><TableCell>{row.subject_company || "-"}</TableCell><TableCell>{row.project_name}</TableCell><TableCell>{df.dateTime(row.entered_at)}</TableCell><TableCell className="font-medium tabular">{duration(row.minutes_on_site, t)}</TableCell><TableCell>{row.gate_name || "-"}</TableCell><TableCell>{row.phone ? <a className="inline-flex items-center gap-2 text-primary hover:underline" href={`tel:${row.phone}`}><Phone className="size-4" />{row.phone}</a> : "-"}</TableCell></TableRow>)}</TableBody></Table></div>}
    {rows.dataUpdatedAt > 0 && <p className="text-xs text-muted-foreground">{t("emergency.updated", { time: new Date(rows.dataUpdatedAt).toLocaleTimeString() })}</p>}
  </div>;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/** A plain page for the printer: the list, and when and how it was counted. */
function printDocument(
  people: EmergencyPresence[],
  words: {
    title: string;
    generated: string;
    composition: string;
    headings: string[];
    cells: (row: EmergencyPresence) => string[];
  },
) {
  const head = words.headings.map((heading) => `<th>${escapeHtml(heading)}</th>`).join("");
  const body = people
    .map((row) => `<tr>${words.cells(row).map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(words.title)}</title><style>body{font-family:Arial,"Microsoft YaHei",sans-serif;padding:24px;color:#111}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 12px;font-size:12px;color:#444}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #999;padding:5px 6px;text-align:left;vertical-align:top}th{background:#eee}td:first-child{width:28px}</style></head><body><h1>${escapeHtml(words.title)}</h1><p>${escapeHtml(words.generated)} · ${escapeHtml(words.composition)}</p><table><thead><tr><th>#</th>${head}</tr></thead><tbody>${body.replace(/<tr>/g, (() => { let n = 0; return () => `<tr><td>${++n}</td>`; })())}</tbody></table><script>window.onload=()=>{window.print()}</script></body></html>`;
}

function duration(minutes: number, t: ReturnType<typeof useTranslations<"siteControl">>) { const hours = Math.floor(minutes / 60); const remaining = minutes % 60; return hours ? t("emergency.durationHours", { hours, minutes: remaining }) : t("emergency.durationMinutes", { minutes }); }
function State({ text, danger = false }: { text: string; danger?: boolean }) { return <div className={`grid min-h-48 place-items-center rounded-xl border border-dashed border-panel-border p-6 text-center text-sm ${danger ? "text-destructive" : "text-muted-foreground"}`}>{text}</div>; }
