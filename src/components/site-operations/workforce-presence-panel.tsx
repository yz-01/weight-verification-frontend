"use client";

import { useQuery } from "@tanstack/react-query";
import { HardHat, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDateFormat } from "@/lib/dates";
import { getWorkforcePresence } from "@/services/field-staff-gps.service";
import { getDepartments, getWorkTrades } from "@/services/users.service";

const ALL = "__all__";

/**
 * On-site headcount, sliced the way requirement 15.2.3 asks for.
 *
 * Presence is the geofence verdict, not a gate scan — the requirement is
 * explicit that a worker counts as on site once inside the project fence, and
 * the two can legitimately disagree when somebody walks in through a gap in
 * the hoarding.
 *
 * The breakdowns always sum to the headcount: everyone with no department or
 * no trade is counted under an explicit "unassigned" rather than dropped, so
 * nobody plans a shift around a number that is quietly short.
 */
export function WorkforcePresencePanel({ projectId }: { projectId: string }) {
  const t = useTranslations("workforcePresence");
  const common = useTranslations("common");
  const df = useDateFormat();
  const [department, setDepartment] = useState(ALL);
  const [trade, setTrade] = useState(ALL);

  const departments = useQuery({
    queryKey: ["company-departments", "presence"],
    queryFn: () => getDepartments({ page_size: 200, sort_by: "name" }),
  });
  const trades = useQuery({
    queryKey: ["company-trades", "presence"],
    queryFn: () => getWorkTrades({ page_size: 200, sort_by: "name" }),
  });
  const presence = useQuery({
    queryKey: ["workforce-presence", projectId, department, trade],
    queryFn: () =>
      getWorkforcePresence({
        project: projectId || undefined,
        department: department === ALL ? undefined : department,
        trade: trade === ALL ? undefined : trade,
      }),
  });

  const data = presence.data;

  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b p-4">
        <HardHat className="size-4 text-muted-foreground" />
        <p className="text-sm font-semibold">{t("title")}</p>
        <p className="text-xs text-muted-foreground">{t("help")}</p>
        <div className="ml-auto flex flex-wrap gap-2">
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="h-8 w-44" aria-label={t("filter.department")}>
              <SelectValue placeholder={t("filter.allDepartments")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filter.allDepartments")}</SelectItem>
              {(departments.data?.results ?? []).map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={trade} onValueChange={setTrade}>
            <SelectTrigger className="h-8 w-44" aria-label={t("filter.trade")}>
              <SelectValue placeholder={t("filter.allTrades")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filter.allTrades")}</SelectItem>
              {(trades.data?.results ?? []).map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {presence.isLoading ? (
        <p className="p-4 text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline size-4 animate-spin" />
          {common("loading")}
        </p>
      ) : presence.isError || !data ? (
        <div className="m-4 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{t("loadError")}</p>
          <Button size="sm" variant="outline" onClick={() => void presence.refetch()}>
            {common("retry")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile label={t("onSiteNow")} value={data.on_site_now} emphasis />
            <Tile label={t("enteredToday")} value={data.entered_today} />
            <Tile label={t("leftToday")} value={data.left_today} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Breakdown
              title={t("byDepartment")}
              rows={data.by_department}
              total={data.on_site_now}
              unassigned={t("unassigned")}
              emptyLabel={t("noBreakdown")}
            />
            <Breakdown
              title={t("byTrade")}
              rows={data.by_trade}
              total={data.on_site_now}
              unassigned={t("unassigned")}
              emptyLabel={t("noBreakdown")}
            />
          </div>

          {!data.people.length ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {t("nobodyOnSite")}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {data.people.map((person) => (
                <li
                  key={`${person.project_id}:${person.user_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="text-sm font-medium">{person.full_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {[
                        person.project_name,
                        person.department_name || t("unassigned"),
                        person.trade_name || t("unassigned"),
                      ].join(" · ")}
                    </span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t("since", { at: df.dateTime(person.since) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Tile({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          emphasis
            ? "mt-1 text-2xl font-semibold tabular-nums"
            : "mt-1 text-xl font-medium tabular-nums"
        }
      >
        {value}
      </p>
    </div>
  );
}

function Breakdown({
  title,
  rows,
  total,
  unassigned,
  emptyLabel,
}: {
  title: string;
  rows: Record<string, number>;
  total: number;
  unassigned: string;
  emptyLabel: string;
}) {
  const entries = Object.entries(rows).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-lg border">
      <p className="border-b px-3 py-2 text-sm font-medium">{title}</p>
      {!entries.length ? (
        <p className="p-3 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="divide-y">
          {entries.map(([name, count]) => (
            <li
              key={name || "__unassigned__"}
              className="flex items-center gap-3 px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {name || unassigned}
              </span>
              <span
                aria-hidden
                className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{
                    width: `${total ? Math.round((count / total) * 100) : 0}%`,
                  }}
                />
              </span>
              <span className="w-8 text-right text-sm tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
