"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { KpiCard } from "@/components/shared/kpi-card";
import { QueryFailedNote } from "@/components/shared/page-primitives";
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
  const { can } = useAuth();
  const [department, setDepartment] = useState(ALL);
  const [trade, setTrade] = useState(ALL);

  /**
   * F-291. These two lists only fill the filter dropdowns, and reading them
   * needs permissions that watching the headcount does not: the endpoints
   * require `department.view` and `work_trade.view`, while the presence figure
   * itself requires `field_position.view`. Site Staff hold the third and
   * neither of the first two, so every field worker who opened the Location
   * tab fired two requests that could only be refused - and `api-client`
   * toasts a refused read unless the call site opts out, so the customer got
   * "You do not have permission to perform this action" across a screen whose
   * numbers had loaded correctly.
   *
   * Gated rather than silenced: a request that cannot succeed should not be
   * sent at all. Silencing it would keep the wasted round trip and the
   * authentication and permission query behind it.
   */
  const mayFilterByDepartment = can("department.view");
  const mayFilterByTrade = can("work_trade.view");

  const departments = useQuery({
    queryKey: ["company-departments", "presence"],
    queryFn: () => getDepartments({ page_size: 200, sort_by: "name" }),
    enabled: mayFilterByDepartment,
  });
  const trades = useQuery({
    queryKey: ["company-trades", "presence"],
    queryFn: () => getWorkTrades({ page_size: 200, sort_by: "name" }),
    enabled: mayFilterByTrade,
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
    <section className="surface-panel overflow-hidden rounded-xl">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b p-4 sm:px-6">
        <p className="panel-title">{t("title")}</p>
        <p className="text-xs text-muted-foreground">{t("help")}</p>
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          {/* A dropdown whose options can never load is worse than no
              dropdown: it looks like a filter that is simply empty. */}
          {mayFilterByDepartment && (
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="w-full sm:w-44" aria-label={t("filter.department")}>
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
          )}
          {mayFilterByTrade && (
          <Select value={trade} onValueChange={setTrade}>
            <SelectTrigger className="w-full sm:w-44" aria-label={t("filter.trade")}>
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
          )}
        </div>
        {mayFilterByDepartment && (
          <QueryFailedNote className="w-full" query={departments} what={t("what.departments")} />
        )}
        {mayFilterByTrade && (
          <QueryFailedNote className="w-full" query={trades} what={t("what.trades")} />
        )}
      </div>

      {presence.isLoading ? (
        <p className="p-4 text-sm text-muted-foreground sm:px-6">
          <Loader2 className="mr-2 inline size-4 animate-spin" />
          {common("loading")}
        </p>
      ) : presence.isError || !data ? (
        <div className="m-4 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3 sm:mx-6">
          <p className="text-sm text-destructive">{t("loadError")}</p>
          <Button size="sm" variant="outline" onClick={() => void presence.refetch()}>
            {common("retry")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4 p-4 sm:p-6">
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
            <p className="rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground">
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
                  <span className="tabular text-xs text-muted-foreground">
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
    <KpiCard size="sm" tone={emphasis ? "cyan" : "slate"} label={label} value={value} />
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
              <span className="tabular w-8 text-right text-sm">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
