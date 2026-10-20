"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Hash, Link2, Loader2, PencilLine, RotateCcw, ScanLine, Search, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { matchScannedMachine } from "@/components/equipment-hours/equipment-hours-capture";
import { OperatorDialog, OperatorHistory } from "@/components/equipment-hours/equipment-session-operator";
import { DriverClockLinksDialog } from "@/components/equipment-hours/driver-clock-links";
import { EquipmentSiteNumbersDialog } from "@/components/equipment-hours/equipment-site-numbers";
import { SupplierQrScanner } from "@/components/field-staff/supplier-qr-scanner";
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
  EquipmentHoursMachineTotal,
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
  getEquipmentHoursMonth, exportEquipmentHoursMonth,
  getEquipmentSiteNumbers,
  moveEquipmentSession,
} from "@/services/equipment-hours.service";
import {
  CORRECTED_ROW_CLASS,
  CorrectedTag,
  RecordCorrectionHistory,
  recordCorrectionsKey,
} from "@/components/shared/record-correction";
import { cn } from "@/lib/utils";

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
  // 司机打卡链接 (J26): the drivers' own clock-in links.
  const [driverLinks, setDriverLinks] = useState(false);
  // 操作人员 / CIDB 卡号 being written for this row (I4, ID19).
  const [naming, setNaming] = useState<EquipmentHoursSession | null>(null);
  // 「设备编号 / 扫描二维码」 in the filters (I4): a webcam or a scanner gun.
  const [scanning, setScanning] = useState(false);
  const [scanMiss, setScanMiss] = useState("");
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
        // The client's order (2026-10 I4): 设备编号｜设备名称｜供应商｜操作人员｜
        // CIDB 卡号｜日期｜开工时间｜收工时间｜工时, then the office's own.
        columns: [
          { key: "site_no", label: t("field.machineNo") },
          { key: "equipment_name", label: t("field.equipmentName") },
          { key: "supplier_name", label: t("field.supplier") },
          { key: "operator_name", label: t("field.operator") },
          { key: "cidb_no", label: t("field.cidb") },
          { key: "work_date", label: t("field.date") },
          { key: "start_at", label: t("field.startTime") },
          { key: "end_at", label: t("field.endTime") },
          { key: "hours", label: t("field.hours") },
          { key: "cumulative_hours", label: t("field.cumulative") },
          { key: "equipment_code", label: t("field.code") },
          { key: "plate", label: t("field.plate") },
          { key: "project_name", label: t("field.project") },
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
          canAdjust || (view === "day" && canExport) || view === "month" ? (
            <div className="flex flex-wrap items-center gap-2">
              {/* 现场编号 (2026-10-10): the short number painted on each machine. */}
              {canAdjust && (
                <Button variant="outline" onClick={() => setNumbering(true)}>
                  <Hash />
                  {t("siteNo.open")}
                </Button>
              )}
              {canAdjust && (
                <Button variant="outline" onClick={() => setDriverLinks(true)}>
                  <Link2 />
                  {tRoot("driverClock.office.title")}
                </Button>
              )}
              {view === "day" && canExport && (
                <ExportButton onExport={exportDays} disabled={rows.length === 0} />
              )}
              {/* 按月, as a file: one row per machine for the month (H16). */}
              {view === "month" && (
                <ExportButton
                  disabled={!monthly.data?.rows.length}
                  disabledReason={t("subtitle")}
                  title={tRoot("nav.submodule.equipmentOperatorHours")}
                  onExport={(format) =>
                    exportEquipmentHoursMonth({
                      format,
                      title: `${tRoot("nav.submodule.equipmentOperatorHours")} · ${monthly.data?.month ?? ""}`,
                      query: { ...filters, month: month ?? "" },
                      columns: [
                        { key: "equipment_name", label: t("field.equipment") },
                        { key: "equipment_code", label: t("field.code") },
                        { key: "site_no", label: t("field.siteNo") },
                        { key: "supplier_name", label: t("field.supplier") },
                        { key: "plate", label: t("field.plate") },
                        { key: "project_name", label: t("field.project") },
                        { key: "days_worked", label: t("field.daysWorked") },
                        { key: "session_count", label: t("field.sessions") },
                        { key: "total_hours", label: t("field.totalHours") },
                        { key: "incomplete_count", label: t("field.incomplete") },
                        { key: "adjusted_count", label: t("field.adjustedCount") },
                      ],
                    })
                  }
                />
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
        <Button
          variant="outline"
          className="self-end"
          onClick={() => {
            setScanMiss("");
            setScanning(true);
          }}
        >
          <ScanLine />
          {t("filter.scan")}
        </Button>
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

      {scanMiss ? (
        <p className="text-xs font-medium text-destructive" role="status">
          {scanMiss}
        </p>
      ) : null}
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

      {view === "day" && days.data?.machine_totals ? (
        <SupplierTotals
          supplier={suppliers.find((row) => row.id === filters.supplier)?.name ?? ""}
          rows={days.data.machine_totals}
          total={days.data.total_hours ?? ""}
          onPick={setEquipment}
        />
      ) : null}

      {view === "day" ? (
        <div className="surface-panel overflow-hidden rounded-xl">
          <QueryFailedNote query={days} what={t("what.days")} className="p-3" />
          {/* The client's columns, in the client's order (2026-10 I4):
              设备编号｜设备名称｜供应商｜操作人员｜CIDB 卡号｜日期｜开工时间｜收工时间｜
              工时｜查看 - with 累计工时 (Lucas, 2026-10-10) before 查看.
              Fits the page with 查看 pinned at the right (I39). */}
          <Table fit>
            <TableHeader>
              <TableRow>
                <TableHead>{t("field.machineNo")}</TableHead>
                <TableHead>{t("field.equipmentName")}</TableHead>
                <TableHead>{t("field.supplier")}</TableHead>
                <TableHead>{t("field.operator")}</TableHead>
                <TableHead>{t("field.cidb")}</TableHead>
                <TableHead>{t("field.date")}</TableHead>
                <TableHead>{t("field.startTime")}</TableHead>
                <TableHead>{t("field.endTime")}</TableHead>
                <TableHead className="tabular text-right">{t("field.hours")}</TableHead>
                <TableHead className="tabular text-right">{t("field.cumulative")}</TableHead>
                <TableHead pin="end" className="text-right">{t("field.view")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-20 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-20 text-muted-foreground">
                    {t("day.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {rows.map((row) => (
                    <TableRow
                      key={row.key}
                      className={cn("cursor-pointer", row.was_corrected && CORRECTED_ROW_CLASS)}
                      onClick={() => setOpened(row)}
                    >
                      <TableCell className="font-medium">
                        {/* The gold 已修改 at the front (J20): a time or the machine corrected. */}
                        <span className="inline-flex items-center gap-1.5">
                          {row.was_corrected && <CorrectedTag kind="EQUIPMENT_HOURS" recordId={row.key} />}
                          {row.site_no || row.equipment_code || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{row.equipment_name}</p>
                        {row.project_name ? (
                          <p className="text-xs text-muted-foreground">{row.project_name}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>{row.supplier_name || "-"}</TableCell>
                      <TableCell>
                        {canAdjust ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-auto px-1.5 py-1 font-normal"
                            onClick={(event) => {
                              event.stopPropagation();
                              setNaming(row);
                            }}
                          >
                            {row.operator_name ? (
                              row.operator_name
                            ) : (
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <UserRound />
                                {t("operator.fill")}
                              </span>
                            )}
                          </Button>
                        ) : (
                          row.operator_name || ""
                        )}
                      </TableCell>
                      <TableCell>{row.cidb_no || ""}</TableCell>
                      <TableCell className="tabular whitespace-nowrap">{df.date(row.work_date)}</TableCell>
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
                      {/* Blank, not 0, while an end is missing (「未收工的时间及工时留空」). */}
                      <TableCell className="tabular text-right font-medium">{row.hours ?? ""}</TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">
                        {row.cumulative_hours ?? ""}
                      </TableCell>
                      <TableCell pin="end">
                        <div className="flex items-center justify-end gap-0.5">
                          {canAdjust && (row.missing_end || row.missing_start) ? (
                            <Button
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpened(row);
                              }}
                            >
                              <PencilLine />
                              {t(adjustLabelKey(row))}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpened(row);
                              }}
                            >
                              <Eye />
                              {t("field.view")}
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
                    <TableCell />
                    <TableCell />
                    <TableCell className="tabular text-right font-semibold">
                      {days.data?.total_hours ?? ""}
                    </TableCell>
                    <TableCell className="text-right" />
                    <TableCell pin="end" className="text-right" />
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="surface-panel overflow-hidden rounded-xl">
          <QueryFailedNote query={monthly} what={t("what.month")} className="p-3" />
          <Table fit>
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

      {driverLinks && (
        <DriverClockLinksDialog project={project} onClose={() => setDriverLinks(false)} />
      )}

      {opened && (
        <DayDialog
          day={opened}
          canAdjust={canAdjust}
          onClose={() => setOpened(null)}
          onSaved={setOpened}
        />
      )}

      {naming && <OperatorDialog session={naming} onClose={() => setNaming(null)} />}

      <SupplierQrScanner
        open={scanning}
        raw
        labels={{
          title: t("filter.scanTitle"),
          help: t("filter.scanHelp"),
          image: t("phone.scanImage"),
        }}
        onClose={() => setScanning(false)}
        onDetected={(text) => {
          setScanning(false);
          const found = matchScannedMachine(text, options.data?.equipment ?? []);
          if (!found) {
            setScanMiss(t("filter.scanNoMatch"));
            return;
          }
          setScanMiss("");
          if (supplier !== ALL && found.supplier !== supplier) setSupplier(ALL);
          setEquipment(found.id);
        }}
      />
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

/**
 * 「可查看该公司全部设备……的累计工时」 (2026-10 I4): with a supplier chosen and
 * no single machine, each of its machines on one line and the company's total.
 * A line opens that machine's rows.
 */
export function SupplierTotals({
  supplier,
  rows,
  total,
  onPick,
}: {
  supplier: string;
  rows: EquipmentHoursMachineTotal[];
  total: string;
  onPick: (equipment: string) => void;
}) {
  const t = useTranslations("equipmentHours");
  return (
    <section className="surface-panel space-y-2 rounded-xl p-3">
      <h2 className="panel-title">{t("supplierTotals.title", { supplier })}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("day.empty")}</p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((row) => (
            <li key={row.equipment}>
              <button
                type="button"
                className="flex w-full items-center gap-3 py-1.5 text-left hover:bg-muted/40"
                onClick={() => onPick(row.equipment)}
              >
                <span className="w-16 shrink-0 font-medium">{row.site_no || row.equipment_code || "-"}</span>
                <span className="min-w-0 flex-1 truncate">{row.equipment_name}</span>
                <span className="text-xs text-muted-foreground">
                  {t("supplierTotals.sessions", { count: row.session_count })}
                </span>
                <span className="tabular w-20 text-right font-medium">{row.total_hours}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="flex justify-between border-t pt-2 text-sm font-semibold">
        <span>{t("supplierTotals.total")}</span>
        <span className="tabular">{total}</span>
      </p>
    </section>
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
  const [naming, setNaming] = useState(false);
  const timeLabel = mode === "start" ? t("adjust.startAt") : t("adjust.endAt");

  const save = useMutation({
    mutationFn: () => adjustEquipmentDayEnd(adjustmentPayload(day, mode, at, reason)),
    onSuccess: (saved) => {
      setReason("");
      setError("");
      onSaved(saved);
      void queryClient.invalidateQueries({ queryKey: ["equipment-hours"] });
      void queryClient.invalidateQueries({ queryKey: recordCorrectionsKey("EQUIPMENT_HOURS", day.key) });
    },
    onError: (reason_) =>
      setError(reason_ instanceof ApiError ? reason_.message : t("adjust.failed")),
  });

  // 改设备归属 (J1-13): the project's other machines.
  const [machine, setMachine] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [moveError, setMoveError] = useState("");
  const machines = useQuery({
    queryKey: ["equipment-hours", "site-numbers", day.project],
    queryFn: () => getEquipmentSiteNumbers(day.project),
    enabled: canAdjust,
  });
  const otherMachines = (machines.data ?? []).filter((row) => row.id !== day.equipment);
  const move = useMutation({
    mutationFn: () => moveEquipmentSession({ session: day.key, equipment: machine, reason: moveReason }),
    onSuccess: (moved) => {
      setMachine("");
      setMoveReason("");
      setMoveError("");
      onSaved(moved);
      void queryClient.invalidateQueries({ queryKey: ["equipment-hours"] });
      void queryClient.invalidateQueries({ queryKey: recordCorrectionsKey("EQUIPMENT_HOURS", day.key) });
    },
    onError: (reason_) =>
      setMoveError(reason_ instanceof ApiError ? reason_.message : t("move.failed")),
  });

  const start = day.start_at ? df.dateTime(day.start_at) : t("status.MISSING_START");
  const end = day.end_at ? df.dateTime(day.end_at) : t("status.MISSING_END");

  return (
    <RecordDetailDialog
      title={`${day.equipment_name}${day.plate ? ` · ${day.plate}` : ""}`}
      description={t("dialog.summary", { start, end, hours: day.hours ?? "-" })}
      onClose={onClose}
      // 预览 · 打印 · 导出 · 发送 on this one start-to-stop (H16, HD13): the
      // session is named by its start (or stop) photograph.
      exportRecord={{
        kind: "EQUIPMENT_HOURS",
        recordId: day.key,
        reference: `${day.equipment_code || day.equipment_name}-${day.work_date}`,
        href: "/equipment-operator-hours",
      }}
    >
      <RecordDetailShell
        reference={`${day.equipment_code || day.equipment_name}-${day.work_date}`}
        facts={[
          { label: t("field.machineNo"), value: day.site_no || "-" },
          { label: t("field.code"), value: day.equipment_code || "-" },
          // 改设备归属 (J1-13): the machine the photos were taken of stays known.
          ...(day.taken_on_name ? [{ label: t("field.takenOn"), value: day.taken_on_name }] : []),
          { label: t("field.supplier"), value: day.supplier_name || "-" },
          // 操作人员 / CIDB 卡号 as the office wrote them (I4, ID19).
          { label: t("field.operator"), value: day.operator_name || "-" },
          { label: t("field.cidb"), value: day.cidb_no || "-" },
          // A photo the older phone screen queued offline, before the
          // signature existed: said, not left as a gap.
          ...(day.photos.some((photo) => !photo.signature)
            ? [{ label: t("phone.signature"), value: t("dialog.unsigned") }]
            : []),
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
          { label: t("field.hours"), value: <span className="tabular-nums">{day.hours ?? "-"}</span> },
        ]}
        // 司机签名 at the start and at the stop (I4, ID20).
        signatures={day.photos.flatMap((photo) =>
          photo.signature
            ? [
                {
                  label: t("dialog.signature", { kind: photo.kind ? t(`kind.${photo.kind}`) : "" }),
                  url: photo.signature,
                },
              ]
            : [],
        )}
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
        corrections={
          <div className="space-y-4">
            {/* Who, when, why: the machine and the times, as for every record (J1-16). */}
            <RecordCorrectionHistory kind="EQUIPMENT_HOURS" recordId={day.key} />
            <AdjustmentHistory day={day} />
            <OperatorHistory session={day} />
          </div>
        }
        actions={
          canAdjust ? (
            <div className="space-y-4">
            <section className="space-y-3">
              <h3 className="panel-title">{t("operator.title")}</h3>
              <p className="text-sm">
                {day.operator_name
                  ? [day.operator_name, day.cidb_no ? `CIDB ${day.cidb_no}` : ""].filter(Boolean).join(" · ")
                  : t("operator.none")}
              </p>
              <Button variant="outline" onClick={() => setNaming(true)}>
                <UserRound />
                {day.operator_name ? t("operator.edit") : t("operator.fill")}
              </Button>
            </section>
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
            {/* 改设备 (J1-13): scanned the wrong machine. Signed; office only. */}
            <section className="space-y-3">
              <h3 className="panel-title">{t("move.title")}</h3>
              <p className="text-xs text-muted-foreground">{t("move.help")}</p>
              <QueryFailedNote query={machines} what={t("move.machine")} />
              <FieldWrapper label={t("move.machine")} required>
                <Select value={machine} onValueChange={setMachine}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("move.choose")} />
                  </SelectTrigger>
                  <SelectContent>
                    {otherMachines.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {[row.site_no || row.code, row.name, row.plate].filter(Boolean).join(" · ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>
              <FieldWrapper label={t("move.reason")} required>
                <Textarea
                  value={moveReason}
                  maxLength={500}
                  onChange={(event) => setMoveReason(event.target.value)}
                  placeholder={t("move.reasonPlaceholder")}
                />
              </FieldWrapper>
              {moveError && <p className="text-sm text-destructive">{moveError}</p>}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  requires={[
                    [machine, t("move.machine")],
                    [moveReason.trim(), t("move.reason")],
                  ]}
                  disabled={move.isPending}
                  onClick={() => move.mutate()}
                >
                  {move.isPending && <Loader2 className="animate-spin" />}
                  {t("move.save")}
                </Button>
              </div>
            </section>
            </div>
          ) : undefined
        }
      />
      {naming && (
        <OperatorDialog
          session={day}
          onClose={() => setNaming(false)}
          onSaved={(rows) => {
            const mine = rows.find((row) => row.key === day.key);
            if (mine) onSaved(mine);
          }}
        />
      )}
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
