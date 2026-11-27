"use client";

/**
 * 报表中心 「项目现场费用总览」 (JB259, 客户 11-24b 事项 6, 图 10).
 *
 * 「请将以下五个业务模块的数据进行关联：材料成本报表、设备租赁费用报表、Progress
 * Claim 报表（支出部分）、杂费报销报表、垃圾清运报表。……自动汇总各项费用、累计
 * 总金额及圆形百分比占比图，支持按项目及日期范围查询，并能够追溯原始业务记录。」
 *
 * As the client's design: filters (项目, 日期范围), six cards (项目总费用 and
 * the five), the donut with each share, the module table with 查看明细 (the
 * source's own report, same project and dates), the monthly stacked bars and
 * the five quick links. The server reads every amount as its own report
 * does (`contractor_ops/site_cost_overview.py`).
 *
 * Colours: the theme's blue, orange, green, purple and rose, as the client's
 * design - each source keeps its colour whatever is shown; every mark is
 * also named in the legend, the table and the tooltip.
 */

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Database, HardHat, Package, ReceiptText, Truck, UsersRound, Wrench } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { money } from "@/components/contractor-ops/company-material-list";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import { ReportClearButton } from "@/components/reports/report-filter-bar";
import { ReportSelector } from "@/components/reports/report-selector";
import { FilterBar, FilterField, ListHeader, QueryFailedNote } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useListQuery } from "@/hooks/use-list-query";
import { useKeptFilters } from "@/lib/kept-filters";
import {
  SITE_COST_SOURCES,
  getSiteCostOverview,
  siteCostReportHref,
  type SiteCostOverview as Overview,
  type SiteCostSource,
} from "@/services/site-cost-overview.service";

/** Each source's colour: the theme's own tones, light and dark (validated:
 * colour-blind separation and contrast pass in both modes). */
export const SOURCE_COLOR: Record<SiteCostSource, string> = {
  material_cost: "var(--tone-blue)",
  equipment_rental: "var(--tone-orange)",
  progress_claim: "var(--tone-green)",
  sundry_claims: "var(--tone-purple)",
  disposal: "var(--tone-rose)",
  labour: "var(--tone-cyan)",
};

const SOURCE_ICON = {
  material_cost: Package,
  equipment_rental: Wrench,
  progress_claim: HardHat,
  sundry_claims: ReceiptText,
  disposal: Truck,
  labour: UsersRound,
} as const;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function day(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** 「RM 2,659,900.00」, or 「—」 when 金额查看 is off for the reader. */
export function rm(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return `RM ${money(value)}`;
}

/** The share as the client's design writes it: 「47.2%」. */
export function share(value: string | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value}%`;
}

/** The trend's rows: one per month, each source's amount as a number. */
export function monthRows(data: Overview | undefined) {
  return (data?.months ?? []).map((month) => ({
    month: month.month,
    total: Number(month.total_amount ?? 0),
    ...Object.fromEntries(month.sources.map((source) => [source.key, Number(source.amount ?? 0)])),
  }));
}

export function SiteCostOverview() {
  const t = useTranslations("jb259");
  const tOff = useTranslations("jb250fix");
  const list = useListQuery(["project", "date_from", "date_to"]);
  // JB300 (客户 11-28d 事项 3): the 开始 / 结束日期 stay when the page is left
  // and opened again, until changed or 【清除】.
  const kept = useKeptFilters("site-cost-overview", ["date_from", "date_to"]);
  const topBar = useCurrentProject();
  const now = new Date();
  const dateFrom = list.filters.date_from ?? day(new Date(now.getFullYear(), now.getMonth(), 1));
  const dateTo = list.filters.date_to ?? day(now);
  const project = list.filters.project;
  const filters = { project, date_from: dateFrom, date_to: dateTo };
  const query = useQuery({
    queryKey: ["site-cost-overview", filters],
    queryFn: () => getSiteCostOverview(filters),
    enabled: kept.ready && Boolean(dateFrom && dateTo && dateFrom <= dateTo),
  });
  const data = query.data;
  const byKey = new Map((data?.sources ?? []).map((row) => [row.key, row]));
  const t295 = useTranslations("jb295");
  // JB295: 人工费用's words are in its own group.
  const name = (key: SiteCostSource) => (key === "labour" ? t295("cost.source") : t(`source.${key}`));
  const reportName = (key: SiteCostSource) => (key === "labour" ? t295("cost.report") : t(`report.${key}`));
  const pie = (data?.sources ?? [])
    .filter((row) => Number(row.amount ?? 0) > 0)
    .map((row) => ({ key: row.key, value: Number(row.amount), name: name(row.key) }));
  const trend = monthRows(data);
  // JB250: a source whose module is off says 「没有开通」, not 「暂时没有金额」.
  // JB287: 垃圾清运 has its amount now (每车清运费用 × 实际验收车次); the old
  // 「没有金额栏…算 0」 note is gone.
  const missing = (data?.sources ?? []).filter(
    (row) => !row.available && !row.switched_off && row.key !== "disposal" && row.key !== "labour",
  );
  const offWord = tOff("cardOff");
  const tFee = useTranslations("jb287");
  const t298 = useTranslations("jb298");

  return (
    <div className="space-y-4" data-slot="site-cost-overview">
      <ReportSelector />
      <ListHeader title={t("title")} subtitle={t("subtitle")} />

      <FilterBar>
        {!topBar.active && (
          <FilterField label={t("filter.project")} className="sm:w-64">
            <ProjectPicker
              value={project ?? "all"}
              onValueChange={(value) => list.setFilter("project", value === "all" ? undefined : value)}
              placeholder={t("filter.project")}
              allowAll
              allLabel={t("filter.allProjects")}
              className="w-full"
            />
          </FilterField>
        )}
        <FilterField label={t("filter.dateFrom")} className="sm:w-40">
          <Input
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={(event) => list.setFilter("date_from", event.target.value || undefined)}
          />
        </FilterField>
        <FilterField label={t("filter.dateTo")} className="sm:w-40">
          <Input
            type="date"
            value={dateTo}
            min={dateFrom}
            onChange={(event) => list.setFilter("date_to", event.target.value || undefined)}
          />
        </FilterField>
        <ReportClearButton active={list.hasFilters} onClear={list.clearFilters} />
      </FilterBar>
      <QueryFailedNote query={query} what={t("title")} />

      {/* 项目总费用 on its own row, then the six sources (JB295: 人工费用 the sixth). */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" data-slot="cost-cards">
        <div className="surface-panel flex items-center gap-3 rounded-xl border-2 border-primary/40 p-4 sm:col-span-2 lg:col-span-3 xl:col-span-6">
          <Database className="size-8 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{t("total")}</p>
            {query.isLoading ? (
              <Skeleton className="h-7 w-32" />
            ) : (
              <p className="tabular text-xl font-semibold" data-slot="cost-total">{rm(data?.total_amount)}</p>
            )}
          </div>
        </div>
        {SITE_COST_SOURCES.map((key) => {
          const Icon = SOURCE_ICON[key];
          const row = byKey.get(key);
          return (
            <div key={key} className="surface-panel flex items-center gap-3 rounded-xl p-4" data-slot="cost-card">
              <Icon className="size-7 shrink-0" style={{ color: SOURCE_COLOR[key] }} aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">{name(key)}</p>
                {query.isLoading ? (
                  <Skeleton className="h-6 w-24" />
                ) : (
                  <p className="tabular text-lg font-semibold">{rm(row?.amount)}</p>
                )}
                {row?.switched_off ? (
                  <p className="text-xs text-muted-foreground" data-module-off={key}>{offWord}</p>
                ) : row && !row.available ? (
                  <p className="text-xs text-muted-foreground">{t("notAvailableShort")}</p>
                ) : row?.no_fee_count ? (
                  // JB287: 「X 笔还没有设每车费用」 - counted 0 until a fee is set.
                  <p className="text-xs text-warning" data-slot="cost-no-fee">{tFee("cost.noFee", { count: row.no_fee_count })}</p>
                ) : row?.not_counted_amount && Number(row.not_counted_amount) > 0 ? (
                  // JB295: 「还有 RM x 未核对，不算在内」 - only 已核对 / 已结算 count.
                  // JB298: Progress Claim - 「还有 RM x 未结算，不算在内」.
                  <p className="text-xs text-muted-foreground" data-slot="cost-not-counted">
                    {key === "progress_claim"
                      ? t298("cost.notCounted", { amount: rm(row.not_counted_amount) })
                      : t295("cost.notCounted", { amount: rm(row.not_counted_amount) })}
                  </p>
                ) : key === "progress_claim" && row && row.available && !row.switched_off ? (
                  // JB298: what the card counts - only 已结算, by the 审核归档 day.
                  <p className="text-xs text-muted-foreground" data-slot="cost-claim-basis">
                    {t298("cost.basis")}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 费用构成（占比）: the donut, named in the legend beside it. */}
        <section className="surface-panel rounded-xl p-4" data-slot="cost-donut">
          <h2 className="panel-title mb-3">{t("share")}</h2>
          <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="relative h-56">
              {pie.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="62%"
                      outerRadius="92%"
                      paddingAngle={1}
                      stroke="var(--card)"
                      strokeWidth={2}
                      isAnimationActive={false}
                    >
                      {pie.map((slice) => (
                        <Cell key={slice.key} fill={SOURCE_COLOR[slice.key]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => rm(String(value))}
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.5rem",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">{t("empty")}</p>
              )}
              {pie.length > 0 ? (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xs text-muted-foreground">{t("totalShort")}</span>
                  <span className="tabular text-sm font-semibold">{rm(data?.total_amount)}</span>
                </div>
              ) : null}
            </div>
            <ul className="space-y-2 text-sm" data-slot="cost-legend">
              {SITE_COST_SOURCES.map((key) => (
                <li key={key} className="flex items-center gap-2">
                  <span className="size-3 shrink-0 rounded-sm" style={{ background: SOURCE_COLOR[key] }} aria-hidden />
                  <span className="min-w-0 flex-1">{name(key)}</span>
                  <span className="tabular font-medium">{share(byKey.get(key)?.share)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 业务模块（关联来源）: amounts, shares, 查看明细. */}
        <section className="surface-panel overflow-hidden rounded-xl" data-slot="cost-modules">
          <Table fit>
            <TableHeader>
              <TableRow>
                <TableHead>{t("column.module")}</TableHead>
                <TableHead className="tabular text-right">{t("column.amount")}</TableHead>
                <TableHead className="tabular text-right">{t("column.share")}</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {SITE_COST_SOURCES.map((key) => {
                const row = byKey.get(key);
                return (
                  <TableRow key={key}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className="size-3 shrink-0 rounded-sm" style={{ background: SOURCE_COLOR[key] }} aria-hidden />
                        {reportName(key)}
                      </span>
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {row?.switched_off ? offWord : row ? (row.amount === null ? "—" : money(row.amount)) : ""}
                    </TableCell>
                    <TableCell className="tabular text-right">{row ? share(row.share) : ""}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={siteCostReportHref(key, filters)}>
                          {t("detail")}
                          <ChevronRight />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow>
                <TableCell className="font-semibold">{t("sum")}</TableCell>
                <TableCell className="tabular text-right font-semibold">
                  {data ? (data.total_amount === null ? "—" : money(data.total_amount)) : ""}
                </TableCell>
                <TableCell className="tabular text-right font-semibold">{data && Number(data.total_amount ?? 0) > 0 ? "100%" : ""}</TableCell>
                <TableCell className="text-right" />
              </TableRow>
            </TableBody>
          </Table>
        </section>
      </div>

      {missing.length > 0 ? (
        <ul className="space-y-1 rounded-lg border px-3 py-2 text-sm text-muted-foreground" data-slot="cost-notes">
          {missing.map((row) => (
            <li key={row.key}>{t(`notAvailable.${row.key}`)}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 费用趋势（按月份）: one stacked bar per month, its total on top. */}
        <section className="surface-panel rounded-xl p-4" data-slot="cost-trend">
          <h2 className="panel-title mb-3">{t("trend")}</h2>
          <div className="h-64">
            {trend.some((row) => row.total > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 24, right: 8, bottom: 0, left: 8 }} barCategoryGap="30%">
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={72}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickFormatter={(value: number) => value.toLocaleString("en-US")}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    formatter={(value, key) => [rm(String(value)), name(key as SiteCostSource)]}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.5rem",
                    }}
                  />
                  {SITE_COST_SOURCES.map((key, index) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="cost"
                      fill={SOURCE_COLOR[key]}
                      stroke="var(--card)"
                      strokeWidth={1}
                      isAnimationActive={false}
                    >
                      {index === SITE_COST_SOURCES.length - 1 ? (
                        <LabelList
                          dataKey="total"
                          position="top"
                          className="fill-foreground text-xs font-semibold"
                          formatter={(value) => rm(String(value))}
                        />
                      ) : null}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">{t("empty")}</p>
            )}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {SITE_COST_SOURCES.map((key) => (
              <li key={key} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: SOURCE_COLOR[key] }} aria-hidden />
                {name(key)}
              </li>
            ))}
          </ul>
        </section>

        {/* 快速进入关联报表. */}
        <section className="surface-panel rounded-xl p-4" data-slot="cost-links">
          <h2 className="panel-title mb-3">{t("links")}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SITE_COST_SOURCES.map((key) => {
              const Icon = SOURCE_ICON[key];
              return (
                <Link
                  key={key}
                  href={siteCostReportHref(key, filters)}
                  className="flex min-h-20 flex-col justify-between gap-2 rounded-lg border-2 p-3 text-sm font-medium hover:bg-muted/40"
                  style={{ borderColor: SOURCE_COLOR[key] }}
                >
                  <Icon className="size-6" style={{ color: SOURCE_COLOR[key] }} aria-hidden />
                  <span className="flex items-end justify-between gap-1">
                    {reportName(key)}
                    <ChevronRight className="size-4 shrink-0" aria-hidden />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{t("help")}</p>
    </div>
  );
}
