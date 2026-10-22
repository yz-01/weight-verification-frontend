"use client";

/**
 * A column's records as the client's picture (J34-6, J34-7, 10-20 图 6).
 *
 * The parts of the page above and below the table: a row of figures counted
 * from what is filed in the column, tabs by stage with their counts, and page
 * numbers with 「显示第 1 到 10 条，共 N 条记录」. Everything is real: a figure
 * with nothing to compare against has no 「较昨日」, a column without a target
 * says so rather than showing one, and the source column of the picture
 * (「来源」) is not drawn - the system records no such thing.
 */

import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CalendarRange,
  CircleCheck,
  Layers,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { KpiCard } from "@/components/shared/kpi-card";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUnitName } from "@/hooks/use-material-units";
import type { CategoryRecordStage, CategorySummary } from "@/interfaces/contractor-ops";
import type { CategoryModuleKey } from "@/lib/category-modules";
import { TONES, type Tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { getCategorySummary } from "@/services/contractor-ops.service";

/** 「较昨日 / 较上月同期」: only where the earlier figure is counted the same way. */
function Change({ now, before, label }: { now: number; before: number; label: string }) {
  const t = useTranslations("categoryManagement.records.summary");
  const format = useFormatter();
  const change = now - before;
  const Icon = change >= 0 ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("inline-flex items-center gap-0.5", change > 0 ? TONES.green.text : change < 0 ? TONES.rose.text : "")}>
        {change !== 0 ? <Icon className="size-3" aria-hidden /> : null}
        {change === 0 ? t("same") : format.number(Math.abs(change), { maximumFractionDigits: 3 })}
        {change !== 0 && before > 0 ? ` (${format.number(Math.abs(change) / before, { style: "percent", maximumFractionDigits: 1 })})` : ""}
      </span>
    </span>
  );
}

interface Tile {
  key: string;
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  icon: LucideIcon;
  tone: Tone;
  bar?: number;
}

/** The figures above the table (图 6): today, this month, all, target, how far, suppliers. */
export function ColumnSummary({ moduleKey, column }: { moduleKey: CategoryModuleKey; column: string }) {
  const t = useTranslations("categoryManagement.records.summary");
  const format = useFormatter();
  const unitName = useUnitName();
  const summary = useQuery({
    queryKey: ["category-records", "summary", moduleKey, column],
    queryFn: () => getCategorySummary({ module: moduleKey, category: column }),
  });
  if (summary.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }
  if (summary.isError) return <QueryFailedNote query={summary} what={t("title")} />;
  if (!summary.data) return null;
  const data: CategorySummary = summary.data;
  const quantity = data.measure === "quantity";
  const unit = data.unit ? (data.unit_label ?? unitName(data.unit)) : "";
  const figure = (value: string | number) => {
    const shown = format.number(Number(value), { maximumFractionDigits: 3 });
    return quantity ? (
      <>
        {shown} <span className="text-sm font-normal text-muted-foreground">{unit}</span>
      </>
    ) : (
      shown
    );
  };
  const words = quantity ? "quantity" : "count";
  const tiles: Tile[] = [
    {
      key: "today",
      label: t(`${words}.today`),
      value: figure(data.today),
      detail: <Change now={Number(data.today)} before={Number(data.yesterday)} label={t("vsYesterday")} />,
      icon: CalendarDays,
      tone: "blue",
    },
    {
      key: "month",
      label: t(`${words}.month`),
      value: figure(data.month),
      detail: <Change now={Number(data.month)} before={Number(data.last_month)} label={t("vsLastMonth")} />,
      icon: CalendarRange,
      tone: "cyan",
    },
    {
      key: "total",
      label: t(`${words}.total`),
      value: figure(data.total),
      detail: data.target?.percent != null ? t("ofTarget", { percent: data.target.percent }) : undefined,
      icon: Layers,
      tone: "purple",
    },
  ];
  if (quantity) {
    const target = data.target;
    tiles.push(
      target
        ? {
            key: "target",
            label: t("target"),
            value: figure(target.target_quantity),
            detail:
              Number(target.remaining) > 0
                ? t("remaining", { value: format.number(Number(target.remaining), { maximumFractionDigits: 3 }) })
                : t("reached"),
            icon: Target,
            tone: "amber",
          }
        : { key: "target", label: t("target"), value: "—", detail: t("noTarget"), icon: Target, tone: "amber" },
    );
    if (target?.percent != null) {
      tiles.push({
        key: "completion",
        label: t("completion"),
        value: format.number(target.percent / 100, { style: "percent", maximumFractionDigits: 1 }),
        icon: CircleCheck,
        tone: "green",
        bar: Math.min(100, target.percent),
      });
    }
  }
  if (data.suppliers !== null) {
    tiles.push({
      key: "suppliers",
      label: t("suppliers"),
      value: format.number(data.suppliers),
      detail: t("suppliersNote"),
      icon: Users,
      tone: "blue",
    });
  }
  return (
    <section aria-label={t("title")} className="space-y-1.5" data-column-summary>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => (
          <KpiCard
            key={tile.key}
            label={tile.label}
            value={tile.value}
            detail={tile.detail}
            icon={tile.icon}
            tone={tile.tone}
            size="sm"
            data-summary-card={tile.key}
          >
            {tile.bar !== undefined ? (
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span className={cn("block h-full rounded-full", TONES.green.dot)} style={{ width: `${tile.bar}%` }} />
              </span>
            ) : null}
          </KpiCard>
        ))}
      </div>
      {quantity && data.other_units ? <p className="text-2xs text-muted-foreground">{t("otherUnits", { unit })}</p> : null}
    </section>
  );
}

const STAGES: ReadonlyArray<"all" | CategoryRecordStage> = ["all", "pending", "done", "returned"];

/** 「全部记录 / 待处理 / 已完成 / 已退回」 with their counts (图 6); a material column says 验收. */
export function StageTabs({
  moduleKey,
  tabs,
  value,
  onChange,
}: {
  moduleKey: CategoryModuleKey;
  tabs: Record<"all" | CategoryRecordStage, number>;
  value: CategoryRecordStage | undefined;
  onChange: (next: CategoryRecordStage | undefined) => void;
}) {
  const t = useTranslations("categoryManagement.records.stage");
  const words = moduleKey === "material" ? "material" : "other";
  return (
    <div role="tablist" aria-label={t("label")} className="flex gap-1 overflow-x-auto border-b">
      {STAGES.map((stage) => {
        const active = stage === "all" ? value === undefined : value === stage;
        return (
          <button
            key={stage}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(stage === "all" ? undefined : stage)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition",
              active ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {stage === "all" ? t("all") : t(`${words}.${stage}`)} ({tabs[stage]})
          </button>
        );
      })}
    </div>
  );
}

/** 「显示第 1 到 10 条，共 N 条记录」 and the page numbers (图 6). */
export function PageNumbers({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations("categoryManagement.records.pager");
  const last = Math.max(1, Math.ceil(total / pageSize));
  const numbers = pageWindow(page, last);
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-panel-border bg-muted p-3 text-sm">
      <span className="text-muted-foreground">
        {t("showing", { from: total === 0 ? 0 : (page - 1) * pageSize + 1, to: Math.min(total, page * pageSize), total })}
      </span>
      {last > 1 && (
        <nav aria-label={t("label")} className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="outline" disabled={page <= 1} disabledReason={t("first")} onClick={() => onPage(page - 1)}>
            {t("previous")}
          </Button>
          {numbers.map((number, index) =>
            number === null ? (
              <span key={`gap-${index}`} className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={number}
                size="sm"
                variant={number === page ? "default" : "ghost"}
                aria-current={number === page ? "page" : undefined}
                onClick={() => onPage(number)}
                className="min-w-8 px-2"
              >
                {number}
              </Button>
            ),
          )}
          <Button size="sm" variant="outline" disabled={page >= last} disabledReason={t("last")} onClick={() => onPage(page + 1)}>
            {t("next")}
          </Button>
        </nav>
      )}
    </footer>
  );
}

/** The first, the last and the two either side of this page; a gap is `null`. */
export function pageWindow(page: number, last: number): Array<number | null> {
  const shown = new Set([1, last, page - 2, page - 1, page, page + 1, page + 2].filter((n) => n >= 1 && n <= last));
  const sorted = [...shown].sort((a, b) => a - b);
  const out: Array<number | null> = [];
  sorted.forEach((n, index) => {
    if (index > 0 && n - sorted[index - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}
