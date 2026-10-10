"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Hash, Loader2, PencilLine, RotateCcw, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { EquipmentSiteNumbersDialog } from "@/components/equipment-hours/equipment-site-numbers";
import { ExportButton } from "@/components/shared/export-button";
import {
  FieldWrapper,
  FilterBar,
  ListHeader,
  QueryFailedNote,
  StatusBadge,
} from "@/components/shared/page-primitives";
import {
  RecordDetailDialog,
  RecordDetailShell,
  RecordRecorder,
  ShellPanel,
} from "@/components/shared/record-detail-shell";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { usePageProject } from "@/components/providers/current-project-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useDebounce } from "@/hooks/use-debounce";
import { ApiError } from "@/interfaces/api";
import type {
  EquipmentDayAdjustmentPayload,
  EquipmentHoursSession,
} from "@/interfaces/equipment-hours";
import { useDateFormat } from "@/lib/dates";
import { photoMeta } from "@/lib/photo-meta";
import type { ExportFormat } from "@/services/contractor.service";
import {
  adjustEquipmentDayEnd,
  exportEquipmentHoursDays,
  getEquipmentHoursDays,
  getEquipmentHoursFilterOptions,
  getEquipmentHoursMonth,
} from "@/services/equipment-hours.service";

/** `YYYY-MM-DD` of a date in the browser's own day. */
function isoDay(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** `YYYY-MM-DD` plus or minus whole days, by the calendar (no clock involved). */
function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, date + days));
  return value.toISOString().slice(0, 10);
}

/** Days from one `YYYY-MM-DD` to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The longest range the table reads at once (the server's own cap). */
export const MAX_RANGE_DAYS = 92;

/**
 * Keep a typed range within 92 days (B4 audit #17).
 *
 * The server used to clamp a longer range without a word, so the table and
 * the export's subtitle named a range they did not hold. Now the field just
 * typed wins and the other end moves to fit; `capped` says it moved.
 */
export function keepWithinRange(
  from: string,
  to: string,
  edited: "from" | "to",
): { from: string; to: string; capped: boolean } {
  if (!from || !to) return { from, to, capped: false };
  if (to < from) return edited === "from" ? { from, to: from, capped: false } : { from: to, to, capped: false };
  if (daysBetween(from, to) < MAX_RANGE_DAYS) return { from, to, capped: false };
  return edited === "from"
    ? { from, to: shiftDay(from, MAX_RANGE_DAYS - 1), capped: true }
    : { from: shiftDay(to, -(MAX_RANGE_DAYS - 1)), to, capped: true };
}

/**
 * The project the tables ask for: 「全部项目」 is no filter at all (B4 audit
 * #6). The picker says `all`; sent on as `project=all` it failed the tables.
 */
export function projectFilterValue(value: string): string {
  return value === "all" ? "" : value;
}

/** The value a `datetime-local` input wants, from an ISO moment. */
export function localInputValue(iso: string): string {
  const value = new Date(iso);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${isoDay(value)}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

type Session = Pick<
  EquipmentHoursSession,
  "start_at" | "end_at" | "previous_at" | "next_at" | "work_date"
>;

/**
 * The end time the office may enter for a session: after its start, and no
 * later than the machine's next photo (that is the next session) or now.
 * There is no day or night limit any more (Lucas 2026-10-10: 「不分白天晚上」).
 */
export function endTimeLimits(
  session: Session,
  now: Date = new Date(),
): { min: string | undefined; max: string } {
  const next = session.next_at ? new Date(session.next_at) : null;
  const latest = next && next < now ? next : now;
  return {
    min: session.start_at ? localInputValue(session.start_at) : undefined,
    max: localInputValue(latest.toISOString()),
  };
}

/**
 * The start time the office may enter for a stop photo with no start: after
 * the machine's photo before it and before the stop.
 */
export function startTimeLimits(session: Session): { min: string | undefined; max: string | undefined } {
  return {
    min: session.previous_at ? localInputValue(session.previous_at) : undefined,
    max: session.end_at ? localInputValue(session.end_at) : undefined,
  };
}

/** Which time the office fills in: the start of a stop with no start, else the end. */
export function adjustMode(
  session: Pick<EquipmentHoursSession, "has_start_photo" | "missing_start">,
): "start" | "end" {
  return !session.has_start_photo && session.missing_start ? "start" : "end";
}

/** What the office's time sends: the moment in full, the reason trimmed. */
export function adjustmentPayload(
  session: Pick<EquipmentHoursSession, "key">,
  mode: "start" | "end",
  atLocal: string,
  reason: string,
): EquipmentDayAdjustmentPayload {
  const moment = new Date(atLocal).toISOString();
  return {
    session: session.key,
    ...(mode === "start" ? { start_at: moment } : { end_at: moment }),
    reason: reason.trim(),
  };
}

type View = "day" | "month";

const ALL = "all";

/**
 * 设备操作员工时 (2026-10 B15; by in/out pairs since 2026-10-10), under 设备管理.
 *
 * 明细: one row per start-stop of a machine - start and end as full date and
 * time, hours, and 累计工时 down the rows shown. A start with no stop is
 * 「缺收工」, a stop with no start 「缺开工」; the office enters the missing time
 * with a reason; every correction stays in the history and the photos are
 * never changed. Filters: project, supplier, machine, plate / number / 现场编号,
 * dates. 「设备编号管理」 gives each machine its 现场编号 (2026-10-10).
 * With no dates chosen the table shows the latest records, not an empty day.
 *
 * 按月: each machine's sessions and hours for a month.
 */
export function EquipmentOperatorHours() {
  const t = useTranslations("equipmentHours");
  const tRoot = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const [view, setView] = useState<View>("day");
  // The top bar's 「当前项目」 in the office (B13).
  const [project, setProject] = usePageProject();
  const [supplier, setSupplier] = useState(ALL);
  const [equipment, setEquipment] = useState(ALL);
  const [search, setSearch] = useState("");
  const q = useDebounce(search.trim(), 300);
  // No dates chosen: the server opens on the latest records (图6).
  const [range, setRangeState] = useState<{ from: string; to: string } | null>(null);
  const [capped, setCapped] = useState(false);
  const [month, setMonth] = useState<string | null>(null);
  const [opened, setOpened] = useState<EquipmentHoursSession | null>(null);
  const [numbering, setNumbering] = useState(false);
  const canAdjust = can("equipment.manage");
  const canExport = can("report.export");

  const filters = {
    project,
    supplier: supplier === ALL ? "" : supplier,
    equipment: equipment === ALL ? "" : equipment,
    q,
  };
  const query = { ...filters, date_from: range?.from ?? "", date_to: range?.to ?? "" };
  const days = useQuery({
    queryKey: ["equipment-hours", "days", query],
    queryFn: () => getEquipmentHoursDays(query),
    enabled: view === "day",
  });
  const monthly = useQuery({
    queryKey: ["equipment-hours", "month", filters, month],
    queryFn: () => getEquipmentHoursMonth({ ...filters, month: month ?? "" }),
    enabled: view === "month",
  });
  // query-failure: the lists only narrow the table; without them the table and its other filters still work
  const options = useQuery({
    queryKey: ["equipment-hours", "filters", project],
    queryFn: () => getEquipmentHoursFilterOptions(project || undefined),
    staleTime: 60_000,
  });
  const machines = (options.data?.equipment ?? []).filter(
    (row) => supplier === ALL || row.supplier === supplier,
  );
  const suppliers = options.data?.suppliers ?? [];
  const rows = days.data?.rows ?? [];
  const monthRows = monthly.data?.rows ?? [];
  // What the table and the export hold is the range the server used.
  const shown = {
    from: days.data?.date_from ?? range?.from ?? "",
    to: days.data?.date_to ?? range?.to ?? "",
  };
  const automatic = range === null;
  const narrowed =
    !automatic && (capped || (days.data ? shown.from !== range.from || shown.to !== range.to : false));
  const setRange = (from: string, to: string, edited: "from" | "to") => {
    const next = keepWithinRange(from, to, edited);
    setRangeState({ from: next.from, to: next.to });
    setCapped(next.capped);
  };
  const today = isoDay(new Date());

  const subtitle = [
    shown.from && shown.to ? t("export.range", { from: shown.from, to: shown.to }) : "",
    suppliers.find((row) => row.id === filters.supplier)?.name ?? "",
    machines.find((row) => row.id === filters.equipment)?.code ?? "",
    q,
  ]
    .filter(Boolean)
    .join(" · ");

  const exportDays = (format: ExportFormat) =>
    exportEquipmentHoursDays(
      {
        format,
        title: tRoot("nav.submodule.equipmentOperatorHours"),
        subtitle,
        emptyLabel: t("day.empty"),
        columns: [
          { key: "equipment_name", label: t("field.equipment") },
          { key: "site_no", label: t("field.siteNo") },
          { key: "equipment_code", label: t("field.code") },
          { key: "supplier_name", label: t("field.supplier") },
          { key: "plate", label: t("field.plate") },
          { key: "project_name", label: t("field.project") },
          { key: "start_at", label: t("field.start") },
          { key: "end_at", label: t("field.end") },
          { key: "hours", label: t("field.hours") },
          { key: "cumulative_hours", label: t("field.cumulative") },
          {
            key: "status",
            label: t("field.status"),
            values: {
              MISSING_END: t("status.MISSING_END"),
              MISSING_START: t("status.MISSING_START"),
              ADJUSTED: t("status.ADJUSTED"),
              OK: t("status.OK"),
            },
          },
          { key: "photo_count", label: t("field.photos") },
          { key: "operators", label: t("field.operators") },
          { key: "adjustment_reason", label: t("field.reason") },
          { key: "adjusted_by", label: t("field.adjustedBy") },
        ],
        // The rows on screen: the same filters and the range the server used.
        query: { ...filters, date_from: shown.from, date_to: shown.to },
      },
      {
        title: t("export.summaryTitle"),
        equipment_label: t("field.equipment"),
        site_no_label: t("field.siteNo"),
        plate_label: t("field.plate"),
        supplier_label: t("field.supplier"),
        sessions_label: t("field.sessions"),
        hours_label: t("field.totalHours"),
        missing_label: t("field.incomplete"),
      },
    );

  return (
    <div className="flex flex-col gap-4">
      <ListHeader
        title={tRoot("nav.submodule.equipmentOperatorHours")}
        subtitle={t("subtitle")}
        action={
          canAdjust || (view === "day" && canExport) ? (
            <div className="flex flex-wrap items-center gap-2">
              {/* 现场编号 (2026-10-10): the short number painted on each machine. */}
              {canAdjust && (
                <Button variant="outline" onClick={() => setNumbering(true)}>
                  <Hash />
                  {t("siteNo.open")}
                </Button>
              )}
              {view === "day" && canExport && (
                <ExportButton onExport={exportDays} disabled={rows.length === 0} />
              )}
            </div>
          ) : undefined
        }
      />

      <FilterBar>
        <Tabs value={view} onValueChange={(value) => setView(value as View)}>
          <TabsList>
            <TabsTrigger value="day">{t("view.day")}</TabsTrigger>
            <TabsTrigger value="month">{t("view.month")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <ProjectPicker
          value={project}
          onValueChange={(value) => setProject(projectFilterValue(value))}
          placeholder={t("field.project")}
          allowAll
          allLabel={t("allProjects")}
          className="w-full sm:w-56"
        />
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t("filter.supplier")}
          <Select
            value={supplier}
            onValueChange={(value) => {
              setSupplier(value);
              setEquipment(ALL);
            }}
          >
            <SelectTrigger className="w-full sm:w-48" aria-label={t("filter.supplier")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filter.allSuppliers")}</SelectItem>
              {suppliers.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t("filter.equipment")}
          <Select value={equipment} onValueChange={setEquipment}>
            <SelectTrigger className="w-full sm:w-56" aria-label={t("filter.equipment")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filter.allEquipment")}</SelectItem>
              {machines.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {[row.site_no || row.code, row.name, row.plate].filter(Boolean).join(" · ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t("filter.search")}
          <span className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              className="w-full pl-8 sm:w-48"
              value={search}
              placeholder={t("filter.searchPlaceholder")}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </label>
        {view === "day" ? (
          <>
            <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t("filter.from")}
              <Input
                type="date"
                className="w-full sm:w-40"
                value={range?.from ?? shown.from}
                max={range?.to ?? shown.to}
                onChange={(event) =>
                  setRange(event.target.value || shown.from || today, range?.to ?? (shown.to || today), "from")
                }
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t("filter.to")}
              <Input
                type="date"
                className="w-full sm:w-40"
                value={range?.to ?? shown.to}
                min={range?.from ?? shown.from}
                onChange={(event) =>
                  setRange(range?.from ?? (shown.from || today), event.target.value || shown.to || today, "to")
                }
              />
            </label>
            {!automatic && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRangeState(null);
                  setCapped(false);
                }}
              >
                <RotateCcw />
                {t("filter.latest")}
              </Button>
            )}
          </>
        ) : (
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t("filter.month")}
            <Input
              type="month"
              className="w-full sm:w-44"
              value={month ?? monthly.data?.month ?? ""}
              onChange={(event) => setMonth(event.target.value || null)}
            />
          </label>
        )}
      </FilterBar>

      {view === "day" && automatic && days.data ? (
        <p className="text-xs text-muted-foreground" role="status">
          {t("filter.automatic", { from: df.date(shown.from), to: df.date(shown.to) })}
        </p>
      ) : null}
      {view === "day" && narrowed ? (
        <p className="text-xs text-muted-foreground" role="status">
          {t("filter.shown", { from: df.date(shown.from), to: df.date(shown.to), max: MAX_RANGE_DAYS })}
        </p>
      ) : null}

      {view === "day" ? (
        <div className="surface-panel overflow-hidden rounded-xl">
          <QueryFailedNote query={days} what={t("what.days")} className="p-3" />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("field.equipment")}</TableHead>
                <TableHead>{t("field.siteNo")}</TableHead>
                <TableHead>{t("field.supplier")}</TableHead>
                <TableHead>{t("field.plate")}</TableHead>
                <TableHead>{t("field.start")}</TableHead>
                <TableHead>{t("field.end")}</TableHead>
                <TableHead className="tabular text-right">{t("field.hours")}</TableHead>
                <TableHead className="tabular text-right">{t("field.cumulative")}</TableHead>
                <TableHead>{t("field.photos")}</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">{t("field.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-20 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-20 text-muted-foreground">
                    {t("day.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {rows.map((row) => (
                    <TableRow key={row.key} className="cursor-pointer" onClick={() => setOpened(row)}>
                      <TableCell>
                        <p className="font-medium">{row.equipment_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[row.equipment_code, row.project_name].filter(Boolean).join(" · ")}
                        </p>
                      </TableCell>
                      <TableCell className="font-medium">{row.site_no || "-"}</TableCell>
                      <TableCell>{row.supplier_name || "-"}</TableCell>
                      <TableCell>{row.plate || "-"}</TableCell>
                      <TableCell className="tabular whitespace-nowrap">
                        {row.missing_start ? (
                          <StatusBadge label={t("status.MISSING_START")} tone="warning" />
                        ) : (
                          df.dateTime(row.start_at)
                        )}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap">
                        {row.missing_end ? (
                          <StatusBadge label={t("status.MISSING_END")} tone="warning" />
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            {df.dateTime(row.end_at)}
                            {row.adjusted && <StatusBadge label={t("status.ADJUSTED")} tone="info" />}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="tabular text-right font-medium">{row.hours}</TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">
                        {row.cumulative_hours ?? ""}
                      </TableCell>
                      <TableCell>
                        <PhotoStrip session={row} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          {canAdjust && (
                            <Button
                              size="sm"
                              variant={row.missing_end || row.missing_start ? "default" : "ghost"}
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpened(row);
                              }}
                            >
                              <PencilLine />
                              {t(adjustLabelKey(row))}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-semibold">{t("month.total")}</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell />
                    <TableCell />
                    <TableCell />
                    <TableCell className="tabular text-right font-semibold">
                      {days.data?.total_hours ?? ""}
                    </TableCell>
                    <TableCell className="text-right" />
                    <TableCell />
                    <TableCell className="text-right" />
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="surface-panel overflow-hidden rounded-xl">
          <QueryFailedNote query={monthly} what={t("what.month")} className="p-3" />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("field.equipment")}</TableHead>
                <TableHead>{t("field.siteNo")}</TableHead>
                <TableHead>{t("field.supplier")}</TableHead>
                <TableHead>{t("field.plate")}</TableHead>
                <TableHead className="tabular text-right">{t("field.daysWorked")}</TableHead>
                <TableHead className="tabular text-right">{t("field.sessions")}</TableHead>
                <TableHead className="tabular text-right">{t("field.totalHours")}</TableHead>
                <TableHead className="tabular text-right">{t("field.incomplete")}</TableHead>
                <TableHead className="tabular text-right">{t("field.adjustedCount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthly.isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-20 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : monthRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-20 text-muted-foreground">
                    {t("month.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {monthRows.map((row) => (
                    <TableRow key={row.equipment}>
                      <TableCell>
                        <p className="font-medium">{row.equipment_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[row.equipment_code, row.project_name].filter(Boolean).join(" · ")}
                        </p>
                      </TableCell>
                      <TableCell className="font-medium">{row.site_no || "-"}</TableCell>
                      <TableCell>{row.supplier_name || "-"}</TableCell>
                      <TableCell>{row.plate || "-"}</TableCell>
                      <TableCell className="tabular text-right">{row.days_worked}</TableCell>
                      <TableCell className="tabular text-right">{row.session_count}</TableCell>
                      <TableCell className="tabular text-right font-medium">{row.total_hours}</TableCell>
                      <TableCell className="tabular text-right">
                        {row.incomplete_count > 0 ? (
                          <StatusBadge label={String(row.incomplete_count)} tone="warning" />
                        ) : (
                          0
                        )}
                      </TableCell>
                      <TableCell className="tabular text-right">{row.adjusted_count}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-semibold">{t("month.total")}</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-right" />
                    <TableCell className="text-right" />
                    <TableCell className="tabular text-right font-semibold">
                      {monthly.data?.total_hours}
                    </TableCell>
                    <TableCell className="text-right" />
                    <TableCell className="text-right" />
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {numbering && (
        <EquipmentSiteNumbersDialog project={project} onClose={() => setNumbering(false)} />
      )}

      {opened && (
        <DayDialog
          day={opened}
          canAdjust={canAdjust}
          onClose={() => setOpened(null)}
          onSaved={setOpened}
        />
      )}
    </div>
  );
}

/** The words on the button that opens the office's time form. */
export function adjustLabelKey(
  session: Pick<EquipmentHoursSession, "has_start_photo" | "missing_start" | "missing_end">,
): "adjust.addStart" | "adjust.add" | "adjust.edit" {
  if (adjustMode(session) === "start") return "adjust.addStart";
  return session.missing_end ? "adjust.add" : "adjust.edit";
}

/** The session's photos, small, and how many there are. */
function PhotoStrip({ session }: { session: EquipmentHoursSession }) {
  const t = useTranslations("equipmentHours");
  return (
    <span className="inline-flex items-center gap-1">
      {session.photos.slice(0, 3).map((photo) =>
        photo.watermarked_photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- a stamped evidence file served by the API
          <img loading="lazy" decoding="async"
            key={photo.id}
            src={photo.watermarked_photo}
            alt={t("photoAlt")}
            className="size-8 rounded object-cover"
          />
        ) : (
          <Camera key={photo.id} className="size-4 text-muted-foreground" />
        ),
      )}
      <span className="text-xs text-muted-foreground">{t("photoCount", { count: session.photo_count })}</span>
    </span>
  );
}

/**
 * One session in the record-detail popup (E8, Q31): its 开工 and 收工 photos,
 * the office's time and every correction.
 *
 * Saving needs a reason; the photos are not touched and an earlier correction
 * stays in the list under the new one. The correction history is the shell's
 * 更正记录; the time form is the decision panel.
 */
export function DayDialog({
  day,
  canAdjust,
  onClose,
  onSaved,
}: {
  day: EquipmentHoursSession;
  canAdjust: boolean;
  onClose: () => void;
  onSaved: (day: EquipmentHoursSession) => void;
}) {
  const t = useTranslations("equipmentHours");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const mode = adjustMode(day);
  const limits = mode === "start" ? startTimeLimits(day) : endTimeLimits(day);
  const [at, setAt] = useState(() => {
    if (mode === "start") {
      const morning = `${day.work_date}T08:00`;
      return limits.max && morning >= limits.max ? (limits.min ?? limits.max) : morning;
    }
    if (day.end_at) return localInputValue(day.end_at);
    // 17:00 on the start's day; a later start is closed by hand.
    const evening = `${day.work_date}T17:00`;
    const value = limits.min && limits.min >= evening ? limits.min : evening;
    return limits.max && value > limits.max ? limits.max : value;
  });
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const timeLabel = mode === "start" ? t("adjust.startAt") : t("adjust.endAt");

  const save = useMutation({
    mutationFn: () => adjustEquipmentDayEnd(adjustmentPayload(day, mode, at, reason)),
    onSuccess: (saved) => {
      setReason("");
      setError("");
      onSaved(saved);
      void queryClient.invalidateQueries({ queryKey: ["equipment-hours"] });
    },
    onError: (reason_) =>
      setError(reason_ instanceof ApiError ? reason_.message : t("adjust.failed")),
  });

  const start = day.start_at ? df.dateTime(day.start_at) : t("status.MISSING_START");
  const end = day.end_at ? df.dateTime(day.end_at) : t("status.MISSING_END");

  return (
    <RecordDetailDialog
      title={`${day.equipment_name}${day.plate ? ` · ${day.plate}` : ""}`}
      description={t("dialog.summary", { start, end, hours: day.hours })}
      onClose={onClose}
    >
      <RecordDetailShell
        reference={`${day.equipment_code || day.equipment_name}-${day.work_date}`}
        facts={[
          { label: t("field.code"), value: day.equipment_code || "-" },
          { label: t("field.siteNo"), value: day.site_no || "-" },
          { label: t("field.supplier"), value: day.supplier_name || "-" },
          { label: t("field.plate"), value: day.plate || "-" },
          { label: t("field.project"), value: day.project_name },
          {
            label: t("field.start"),
            value: day.missing_start ? (
              <StatusBadge label={t("status.MISSING_START")} tone="warning" />
            ) : (
              df.dateTime(day.start_at)
            ),
          },
          {
            label: t("field.end"),
            value: day.missing_end ? (
              <StatusBadge label={t("status.MISSING_END")} tone="warning" />
            ) : (
              <span className="inline-flex items-center gap-1.5">
                {df.dateTime(day.end_at)}
                {day.adjusted && <StatusBadge label={t("status.ADJUSTED")} tone="info" />}
              </span>
            ),
          },
          { label: t("field.hours"), value: <span className="tabular-nums">{day.hours}</span> },
        ]}
        // The stamped copy, as the table shows it; a photo the server has
        // not stamped yet has nothing to show.
        photos={day.photos.flatMap((photo) =>
          photo.watermarked_photo
            ? [{
                id: photo.id,
                url: photo.watermarked_photo,
                label: [
                  photo.kind ? t(`kind.${photo.kind}`) : "",
                  df.dateTime(photo.captured_at),
                  photo.operator_name,
                ]
                  .filter(Boolean)
                  .join(" · "),
                ...photoMeta(photo),
              }]
            : [],
        )}
        recorder={<RecordRecorder record={day} />}
        corrections={<AdjustmentHistory day={day} />}
        actions={
          canAdjust ? (
            <section className="space-y-3">
              <h3 className="panel-title">{t(adjustLabelKey(day))}</h3>
              <p className="text-xs text-muted-foreground">
                {mode === "start" ? t("adjust.helpStart") : t("adjust.help")}
              </p>
              <FieldWrapper label={timeLabel} required>
                <Input
                  type="datetime-local"
                  value={at}
                  min={limits.min}
                  max={limits.max}
                  onChange={(event) => setAt(event.target.value)}
                />
              </FieldWrapper>
              <FieldWrapper label={t("adjust.reason")} required>
                <Textarea
                  value={reason}
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={t("adjust.reasonPlaceholder")}
                />
              </FieldWrapper>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end">
                <Button
                  requires={[
                    [at, timeLabel],
                    [reason.trim(), t("adjust.reason")],
                  ]}
                  disabled={save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending && <Loader2 className="animate-spin" />}
                  {t("adjust.save")}
                </Button>
              </div>
            </section>
          ) : undefined
        }
      />
    </RecordDetailDialog>
  );
}

/**
 * Every time the office has entered for the session, newest first; the
 * newest of each kind is the one in use. The stop photo's own time is shown
 * under it, so a correction can always be read against what the phone
 * recorded.
 */
export function AdjustmentHistory({ day }: { day: EquipmentHoursSession }) {
  const t = useTranslations("equipmentHours");
  const df = useDateFormat();
  const current = new Set(
    [
      day.adjustments.find((entry) => entry.end_at),
      day.adjustments.find((entry) => entry.start_at),
    ]
      .filter(Boolean)
      .map((entry) => entry?.id),
  );
  return (
    <ShellPanel title={t("history.title")} className="space-y-2">
      {day.adjustments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
      ) : (
        <ol className="space-y-2">
          {day.adjustments.map((entry) => (
            <li key={entry.id} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">
                {entry.start_at
                  ? t("history.start", { start: df.dateTime(entry.start_at) })
                  : t("history.end", { end: df.dateTime(entry.end_at) })}
                {current.has(entry.id) && (
                  <span className="ml-2">
                    <StatusBadge label={t("history.current")} tone="positive" />
                  </span>
                )}
              </p>
              <p>{entry.reason}</p>
              <p className="text-xs text-muted-foreground">
                {t("history.by", { name: entry.created_by_name, at: df.dateTime(entry.created_at) })}
              </p>
            </li>
          ))}
        </ol>
      )}
      {day.photo_end_at && (
        <p className="text-xs text-muted-foreground">
          {t("history.photoEnd", { end: df.dateTime(day.photo_end_at) })}
        </p>
      )}
    </ShellPanel>
  );
}
