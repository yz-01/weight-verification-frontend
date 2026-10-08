"use client";

/**
 * 电子围栏／人员进场 (C21): how many are on site, came in and left today.
 *
 * Counted from the same 人员进场记录 the table below lists (L8), so a number
 * can always be traced to its rows. 当前现场总人数 says what it is made of -
 * App 人员 plus 门岗通行 - because it is the one figure that is not the same as
 * 仍在场, and an unexplained difference reads as a bug.
 */

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, LogIn, LogOut, ShieldAlert, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { KpiCard } from "@/components/shared/kpi-card";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PresenceNumbers } from "@/interfaces/site-operations";
import { getAttendancePresence } from "@/services/site-operations.service";
import type { Tone } from "@/lib/tones";

function emergencyHref(project?: string) {
  return project ? `/emergency-list?project=${encodeURIComponent(project)}` : "/emergency-list";
}

export function PresenceSummary({ project }: { project?: string }) {
  const t = useTranslations("attendance.presence");
  const [open, setOpen] = useState(false);
  const presence = useQuery({
    queryKey: ["attendance-presence", project ?? "all"],
    queryFn: () => getAttendancePresence(project),
    refetchInterval: 60_000,
  });
  const data = presence.data;

  return (
    <section className="flex flex-col gap-3">
      <QueryFailedNote query={presence} what={t("what")} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          href={emergencyHref(project)}
          size="sm"
          tone="amber"
          icon={ShieldAlert}
          label={t("currentTotal")}
          value={data?.current_total ?? "–"}
          detail={
            data
              ? t("composition", { app: data.app_on_site, gate: data.gate_on_site })
              : t("loading")
          }
        >
          <span className="block text-xs font-medium text-primary">{t("openList")}</span>
        </KpiCard>
        <Tile icon={LogIn} tone="green" label={t("enteredToday")} value={data?.entered_today} />
        <Tile icon={LogOut} tone="slate" label={t("leftToday")} value={data?.left_today} />
        <Tile icon={Users} tone="cyan" label={t("stillOnSite")} value={data?.still_on_site} hint={t("stillHint")} />
      </div>
      {data && data.projects.length > 0 && !project && (
        <div className="surface-panel overflow-hidden rounded-xl">
          <button
            type="button"
            className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm font-medium transition-colors hover:bg-muted/40 sm:px-6"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            {t("byProject", { count: data.projects.length })}
            <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="border-t">
              <Table className="min-w-160">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("project")}</TableHead>
                    <TableHead className="text-right tabular">{t("currentTotal")}</TableHead>
                    <TableHead className="text-right tabular">{t("enteredToday")}</TableHead>
                    <TableHead className="text-right tabular">{t("leftToday")}</TableHead>
                    <TableHead className="text-right tabular">{t("stillOnSite")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.projects.map((row) => (
                    <TableRow key={row.project_id}>
                      <TableCell>{row.project_name}</TableCell>
                      <TableCell className="text-right tabular">
                        <Link className="font-semibold text-primary hover:underline" href={emergencyHref(row.project_id)}>
                          {row.current_total}
                        </Link>
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({t("composition", { app: row.app_on_site, gate: row.gate_on_site })})
                        </span>
                      </TableCell>
                      <NumberCell row={row} field="entered_today" />
                      <NumberCell row={row} field="left_today" />
                      <NumberCell row={row} field="still_on_site" />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function NumberCell({ row, field }: { row: PresenceNumbers; field: keyof PresenceNumbers }) {
  return <TableCell className="text-right tabular">{row[field]}</TableCell>;
}

function Tile({
  icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  tone: Tone;
  label: string;
  value: number | undefined;
  hint?: string;
}) {
  return (
    <KpiCard size="sm" tone={tone} icon={icon} label={label} value={value ?? "–"} detail={hint} />
  );
}
