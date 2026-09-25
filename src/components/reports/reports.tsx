"use client";

import { useQuery } from "@tanstack/react-query";
import { FilterX, Info, Package, Truck } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DISPATCH_STATE_TONE } from "@/components/dispatches/dispatches";
import { LoadFailed, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useListQuery } from "@/hooks/use-list-query";
import { DISPATCH_STATES, type DispatchState } from "@/interfaces/contractor";
import {
  getDispatchSummary,
  getProjects,
  getReceiptSummary,
} from "@/services/contractor.service";

const ALL_PROJECTS = "__all__";

/**
 * Material in, waste out.
 *
 * The whole screen is filtered by one bar — project and date range — because
 * the two halves answer the same question about the same site over the same
 * period, and filtering them separately would invite comparing two different
 * selections without noticing.
 *
 * Quantities are never rolled into one figure. A site takes concrete in tonnes,
 * cement in bags and formwork by the piece; adding those produces a number
 * that looks authoritative and means nothing. The charts count deliveries and
 * loads, which do compare, and the tables carry the quantities beside their
 * units.
 */
export function Reports() {
  const t = useTranslations();
  const list = useListQuery(["project", "date_from", "date_to"]);

  const projectQuery = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () => getProjects({ page_size: 100 }),
  });
  const projectPage = projectQuery.data;

  const filters = {
    project: list.filters.project,
    date_from: list.filters.date_from,
    date_to: list.filters.date_to,
  };

  const receipts = useQuery({
    queryKey: ["receipts", "summary", filters],
    queryFn: () => getReceiptSummary(filters),
  });
  const dispatches = useQuery({
    queryKey: ["dispatches", "summary", filters],
    queryFn: () => getDispatchSummary(filters),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-foreground">
            {t("reports.title")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("reports.subtitle")}
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {t("reports.filter.project")}
            </Label>
            <Select
              value={list.filters.project ?? ALL_PROJECTS}
              onValueChange={(value) =>
                list.setFilter(
                  "project",
                  value === ALL_PROJECTS ? undefined : value,
                )
              }
            >
              <SelectTrigger className="w-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PROJECTS}>
                  {t("reports.filter.allProjects")}
                </SelectItem>
                {(projectPage?.results ?? []).map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.code} — {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <QueryFailedNote query={projectQuery} what={t("reports.what.projects")} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {t("reports.filter.dateFrom")}
            </Label>
            <Input
              type="date"
              className="bg-card"
              value={list.filters.date_from ?? ""}
              onChange={(event) =>
                list.setFilter("date_from", event.target.value || undefined)
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {t("reports.filter.dateTo")}
            </Label>
            <Input
              type="date"
              className="bg-card"
              value={list.filters.date_to ?? ""}
              onChange={(event) =>
                list.setFilter("date_to", event.target.value || undefined)
              }
            />
          </div>

          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full px-4"
              disabledReason={
                !list.hasFilters ? t("common.noFiltersSet") : undefined
              }
              disabled={!list.hasFilters}
              onClick={list.clearFilters}
            >
              <FilterX className="h-3.5 w-3.5" />
              {t("reports.filter.clear")}
            </Button>
          </div>
        </div>
      </div>

      <ReceiptsPanel
        data={receipts.data}
        isLoading={receipts.isLoading}
        failed={receipts.isError}
        onRetry={() => void receipts.refetch()}
      />
      <DispatchesPanel
        data={dispatches.data}
        isLoading={dispatches.isLoading}
        failed={dispatches.isError}
        onRetry={() => void dispatches.refetch()}
      />
    </div>
  );
}

function PanelShell({
  icon: Icon,
  title,
  total,
  totalLabel,
  children,
}: {
  icon: typeof Package;
  title: string;
  /** null when the summary failed to load - a dash, never a zero. */
  total: number | null;
  totalLabel: string;
  children: React.ReactNode;
}) {
  const formatter = useFormatter();
  const t = useTranslations();
  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-3 px-6 py-5">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <div className="ml-auto text-right">
          <p className="tabular text-2xl font-semibold text-foreground">
            {total === null ? t("common.emptyValue") : formatter.number(total)}
          </p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {totalLabel}
          </p>
        </div>
      </div>
      <div className="border-t">{children}</div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-3 px-6 py-5">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function EmptyPanel() {
  const t = useTranslations();
  return (
    <p className="px-6 py-12 text-center text-sm text-muted-foreground">
      {t("reports.empty")}
    </p>
  );
}

/** A note the reader needs in order to read the numbers correctly. */
function Caveat({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {text}
    </p>
  );
}

/**
 * Rough width of a label, in Latin character widths.
 *
 * Chinese, Japanese and Korean glyphs are full-width — about twice a Latin
 * character at the same size. The platform ships in Chinese, so a width
 * derived from `.length` is wrong on one of its three languages.
 */
function textWidth(label: string): number {
  let width = 0;
  for (const character of label) {
    const code = character.codePointAt(0) ?? 0;
    width += code > 0x2e80 && code < 0xfe70 ? 2 : 1;
  }
  return width;
}

/**
 * A ranked bar chart: one series, one colour, one unit.
 *
 * Horizontal, because the categories are material names and supplier names —
 * text that a vertical axis can only fit by rotating it, which is slower to
 * read and collides the moment a name is long.
 *
 * Every bar carries its own value. A report is read once and quoted from, so
 * making the reader estimate a figure off an axis would only invite them to
 * quote the wrong one. That is also why the axis is not drawn: with the
 * numbers on the bars it would be redundant furniture.
 *
 * Slot 1 is the only palette entry that has been through the contrast
 * validator — the note in `globals.css` says the others have not — so keeping
 * every chart to a single series is what stays inside that guarantee.
 */
function RankedBars({
  data,
  valueKey,
}: {
  data: Array<{ label: string } & Record<string, string | number>>;
  valueKey: string;
}) {
  // Room for the name column, capped so the bars are never left as stubs.
  // Measured in character widths rather than characters: a CJK glyph is close
  // to twice the width of a Latin one at the same size, so counting `.length`
  // clipped the first character off 混凝土与砖石 while leaving Latin names
  // room to spare.
  const widest = Math.max(...data.map((row) => textWidth(row.label)), 8);
  const nameWidth = Math.min(Math.round(widest * 6.4) + 14, 220);

  return (
    <div style={{ height: Math.max(data.length * 34 + 16, 90) }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 56, bottom: 4, left: 0 }}
          barCategoryGap="22%"
        >
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            stroke="var(--border)"
          />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={nameWidth}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              fontSize: "0.8125rem",
              color: "var(--popover-foreground)",
            }}
          />
          <Bar dataKey={valueKey} fill="var(--chart-1)" radius={[0, 4, 4, 0]}>
            <LabelList
              dataKey={valueKey}
              position="right"
              className="tabular"
              style={{ fill: "var(--foreground)", fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Material in, one section per unit.
 *
 * Grouping by unit is not presentation — it is the only way this chart is
 * true. Within tonnes, 24.75 against 18.5 is a comparison; across tonnes and
 * bags, bar length would compare two different things and read as if it
 * meant something.
 */
function ReceiptsPanel({
  data,
  isLoading,
  failed,
  onRetry,
}: {
  data?: Awaited<ReturnType<typeof getReceiptSummary>>;
  isLoading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations();

  const units = (data?.by_unit ?? []).map((unit) => ({
    ...unit,
    materials: (data?.by_material ?? [])
      .filter((material) => material.unit === unit.unit)
      .map((material) => ({
        label: material.material_name,
        value: Number(material.quantity),
        receipts: material.receipts,
      })),
  }));

  return (
    <PanelShell
      icon={Package}
      title={t("reports.receipts.title")}
      total={failed ? null : data?.total_receipts ?? 0}
      totalLabel={t("reports.receipts.totalReceipts")}
    >
      {isLoading ? (
        <PanelSkeleton />
      ) : failed ? (
        <LoadFailed className="m-4" what={t("reports.what.receipts")} onRetry={onRetry} />
      ) : (data?.total_receipts ?? 0) === 0 ? (
        <EmptyPanel />
      ) : (
        <div className="divide-y">
          {units.map((unit) => (
            <section key={unit.unit} className="space-y-3 px-6 py-5">
              <div className="flex flex-wrap items-baseline gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(`receipts.unit.${unit.unit}`)}
                </h4>
                <span className="tabular text-sm font-medium text-foreground">
                  {unit.quantity}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("reports.receipts.deliveries")} · {unit.receipts}
                </span>
              </div>
              <RankedBars data={unit.materials} valueKey="value" />
            </section>
          ))}

          <div className="px-6 py-4">
            <Caveat text={t("reports.receipts.unitNote")} />
          </div>
        </div>
      )}
    </PanelShell>
  );
}

function DispatchesPanel({
  data,
  isLoading,
  failed,
  onRetry,
}: {
  data?: Awaited<ReturnType<typeof getDispatchSummary>>;
  isLoading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations();

  // Charted by weight rather than by load count: every dispatch reports kg, so
  // the comparison holds, and "how much left the site" is the question a waste
  // report is opened to answer. Loads stay in the table beside it.
  const chartData = (data?.by_type ?? [])
    .filter((row) => Number(row.estimated_weight_kg ?? 0) > 0)
    .map((row) => ({
      label: t(`dispatches.wasteType.${row.waste_type}`),
      value: Number(row.estimated_weight_kg),
    }));

  return (
    <PanelShell
      icon={Truck}
      title={t("reports.dispatches.title")}
      total={failed ? null : data?.total_dispatches ?? 0}
      totalLabel={t("reports.dispatches.totalDispatches")}
    >
      {isLoading ? (
        <PanelSkeleton />
      ) : failed ? (
        <LoadFailed className="m-4" what={t("reports.what.dispatches")} onRetry={onRetry} />
      ) : (data?.total_dispatches ?? 0) === 0 ? (
        <EmptyPanel />
      ) : (
        <div className="divide-y">
          <section className="space-y-3 px-6 py-5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("reports.dispatches.byType")}
            </h4>
            {chartData.length > 0 && (
              <RankedBars data={chartData} valueKey="value" />
            )}
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-0">
                    {t("reports.dispatches.wasteType")}
                  </TableHead>
                  <TableHead className="px-0 text-right">
                    {t("reports.dispatches.loads")}
                  </TableHead>
                  <TableHead className="px-0 text-right">
                    {t("reports.dispatches.estimatedWeight")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.by_type ?? []).map((row) => (
                  <TableRow key={row.waste_type}>
                    <TableCell className="px-0 font-medium">
                      {t(`dispatches.wasteType.${row.waste_type}`)}
                    </TableCell>
                    <TableCell className="tabular px-0 text-right">
                      {row.dispatches}
                    </TableCell>
                    <TableCell className="tabular px-0 text-right text-muted-foreground">
                      {row.estimated_weight_kg ?? t("common.emptyValue")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Caveat text={t("reports.dispatches.estimateNote")} />
          </section>

          <section className="space-y-3 px-6 py-5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("reports.dispatches.byState")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {DISPATCH_STATES.filter(
                (state) => (data?.by_state?.[state] ?? 0) > 0,
              ).map((state: DispatchState) => (
                <div
                  key={state}
                  className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5"
                >
                  <StatusBadge
                    label={t(`dispatches.state.${state}`)}
                    tone={DISPATCH_STATE_TONE[state]}
                  />
                  <span className="tabular text-sm font-medium text-foreground">
                    {data?.by_state?.[state] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </PanelShell>
  );
}
