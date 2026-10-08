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
    <section className="space-y-2">
      <QueryFailedNote query={presence} what={t("what")} />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href={emergencyHref(project)}
          className="rounded-lg border border-warning/30 bg-warning/5 p-3 transition-colors hover:bg-warning/10"
        >
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="size-4 text-warning" />
            {t("currentTotal")}
          </span>
          <span className="mt-1 block text-2xl font-semibold tabular-nums">
            {data?.current_total ?? "–"}
          </span>
          <span className="block text-xs text-muted-foreground">
            {data
              ? t("composition", { app: data.app_on_site, gate: data.gate_on_site })
              : t("loading")}
          </span>
          <span className="mt-1 block text-xs font-medium text-primary">{t("openList")}</span>
        </Link>
        <Tile icon={LogIn} label={t("enteredToday")} value={data?.entered_today} />
        <Tile icon={LogOut} label={t("leftToday")} value={data?.left_today} />
        <Tile icon={Users} label={t("stillOnSite")} value={data?.still_on_site} hint={t("stillHint")} />
      </div>
      {data && data.projects.length > 0 && !project && (
        <div className="rounded-lg border bg-card">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            {t("byProject", { count: data.projects.length })}
            <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="border-t">
              <Table className="min-w-160">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("project")}</TableHead>
                    <TableHead className="text-right">{t("currentTotal")}</TableHead>
                    <TableHead className="text-right">{t("enteredToday")}</TableHead>
                    <TableHead className="text-right">{t("leftToday")}</TableHead>
                    <TableHead className="text-right">{t("stillOnSite")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.projects.map((row) => (
                    <TableRow key={row.project_id}>
                      <TableCell>{row.project_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
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
  return <TableCell className="text-right tabular-nums">{row[field]}</TableCell>;
}

function Tile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: number | undefined;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </span>
      <span className="mt-1 block text-2xl font-semibold tabular-nums">{value ?? "–"}</span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
