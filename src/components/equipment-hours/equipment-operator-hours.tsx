"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, PencilLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type {
  EquipmentDayAdjustmentPayload,
  EquipmentHoursDay,
} from "@/interfaces/equipment-hours";
import { useDateFormat } from "@/lib/dates";
import { photoMeta } from "@/lib/photo-meta";
import type { ExportFormat } from "@/services/contractor.service";
import {
  adjustEquipmentDayEnd,
  exportEquipmentHoursDays,
  getEquipmentHoursDays,
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

/** The longest range the day table reads at once (the server's own cap). */
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

/** `YYYY-MM-DD` of a moment on the site's clock. */
function siteDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/**
 * Whether a moment of the day falls on the next calendar morning - a night
 * shift's end (Q28: before 06:00 is still the previous day's shift).
 */
export function onNextMorning(iso: string | null, workDate: string): boolean {
  return Boolean(iso) && siteDay(iso as string) > workDate;
}

/**
 * The end time the office may enter for a day (Q28): after the first photo,
 * and no later than 06:00 the next morning, when the next shift starts.
 */
export function endTimeLimits(
  day: Pick<EquipmentHoursDay, "work_date" | "start_at">,
): { min: string | undefined; max: string } {
  return {
    min: day.start_at ? localInputValue(day.start_at) : undefined,
    max: `${shiftDay(day.work_date, 1)}T06:00`,
  };
}

/** The value a `datetime-local` input wants, from an ISO moment. */
export function localInputValue(iso: string): string {
  const value = new Date(iso);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${isoDay(value)}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

/** What the office's end time sends: the moment in full, the reason trimmed. */
export function adjustmentPayload(
  day: Pick<EquipmentHoursDay, "equipment" | "work_date">,
  endAtLocal: string,
  reason: string,
): EquipmentDayAdjustmentPayload {
  return {
    equipment: day.equipment,
    work_date: day.work_date,
    end_at: new Date(endAtLocal).toISOString(),
    reason: reason.trim(),
  };
}

type View = "day" | "month";

/**
 * 设备操作员工时 (2026-10 B15, Q8), under 设备管理.
 *
 * 按日: each machine's day - start (first photo), end (last photo, or the
 * office's end time), hours, 「缺收工」 when only one photo was taken, and the
 * photos. The office adds or corrects the end time with a reason; every
 * correction stays in the history and the photos are never changed.
 *
 * 按月: each machine's days and hours for the month.
 */
export function EquipmentOperatorHours() {
  const t = useTranslations("equipmentHours");
  const tRoot = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const today = isoDay(new Date());
  const [view, setView] = useState<View>("day");
  // The top bar's 「当前项目」 in the office (B13).
  const [project, setProject] = usePageProject();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [capped, setCapped] = useState(false);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [opened, setOpened] = useState<EquipmentHoursDay | null>(null);
  const canAdjust = can("equipment.manage");
  const canExport = can("report.export");
  const setRange = (from: string, to: string, edited: "from" | "to") => {
    const next = keepWithinRange(from, to, edited);
    setDateFrom(next.from);
    setDateTo(next.to);
    setCapped(next.capped);
  };

  const query = { project, date_from: dateFrom, date_to: dateTo };
  const days = useQuery({
    queryKey: ["equipment-hours", "days", query],
    queryFn: () => getEquipmentHoursDays(query),
    enabled: view === "day",
  });
  const monthly = useQuery({
    queryKey: ["equipment-hours", "month", project, month],
    queryFn: () => getEquipmentHoursMonth({ month, project }),
    enabled: view === "month" && Boolean(month),
  });
  const rows = days.data?.rows ?? [];
  const monthRows = monthly.data?.rows ?? [];
  // What the table and the export hold is the range the server used, which
  // is the typed one unless it had to be shortened.
  const shown = {
    from: days.data?.date_from ?? dateFrom,
    to: days.data?.date_to ?? dateTo,
  };
  const narrowed = capped || shown.from !== dateFrom || shown.to !== dateTo;

  const exportDays = (format: ExportFormat) =>
    exportEquipmentHoursDays(
      {
        format,
        title: tRoot("nav.submodule.equipmentOperatorHours"),
        subtitle: t("export.range", { from: shown.from, to: shown.to }),
        emptyLabel: t("day.empty"),
        columns: [
          { key: "work_date", label: t("field.date") },
          { key: "equipment_name", label: t("field.equipment") },
          { key: "plate", label: t("field.plate") },
          { key: "project_name", label: t("field.project") },
          { key: "start_at", label: t("field.start") },
          { key: "end_at", label: t("field.end") },
          { key: "hours", label: t("field.hours") },
          {
            key: "status",
            label: t("field.status"),
            values: {
              MISSING_END: t("status.MISSING_END"),
              ADJUSTED: t("status.ADJUSTED"),
              OK: t("status.OK"),
            },
          },
          { key: "photo_count", label: t("field.photos") },
          { key: "operators", label: t("field.operators") },
          { key: "adjustment_reason", label: t("field.reason") },
          { key: "adjusted_by", label: t("field.adjustedBy") },
        ],
        query,
      },
      {
        title: t("export.summaryTitle"),
        equipment_label: t("field.equipment"),
        plate_label: t("field.plate"),
        days_label: t("field.daysWorked"),
        hours_label: t("field.totalHours"),
        missing_label: t("field.missingEndDays"),
      },
    );

  return (
    <div className="flex flex-col gap-4">
      <ListHeader
        title={tRoot("nav.submodule.equipmentOperatorHours")}
        subtitle={t("subtitle")}
        action={
          view === "day" && canExport ? (
            <ExportButton onExport={exportDays} disabled={rows.length === 0} />
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
        {view === "day" ? (
          <>
            <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t("filter.from")}
              <Input
                type="date"
                className="w-full sm:w-40"
                value={dateFrom}
                max={dateTo}
                onChange={(event) => setRange(event.target.value || today, dateTo, "from")}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t("filter.to")}
              <Input
                type="date"
                className="w-full sm:w-40"
                value={dateTo}
                min={dateFrom}
                onChange={(event) => setRange(dateFrom, event.target.value || today, "to")}
              />
            </label>
          </>
        ) : (
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t("filter.month")}
            <Input
              type="month"
              className="w-full sm:w-44"
              value={month}
              onChange={(event) => setMonth(event.target.value || today.slice(0, 7))}
            />
          </label>
        )}
      </FilterBar>

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
                <TableHead>{t("field.date")}</TableHead>
                <TableHead>{t("field.equipment")}</TableHead>
                <TableHead>{t("field.plate")}</TableHead>
                <TableHead>{t("field.start")}</TableHead>
                <TableHead>{t("field.end")}</TableHead>
                <TableHead className="tabular text-right">{t("field.hours")}</TableHead>
                <TableHead>{t("field.photos")}</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">{t("field.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-20 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-20 text-muted-foreground">
                    {t("day.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.key} className="cursor-pointer" onClick={() => setOpened(row)}>
                    <TableCell className="tabular">{df.date(row.work_date)}</TableCell>
                    <TableCell>
                      <p className="font-medium">{row.equipment_name}</p>
                      <p className="text-xs text-muted-foreground">{row.project_name}</p>
                    </TableCell>
                    <TableCell>{row.plate || "-"}</TableCell>
                    <TableCell className="tabular">
                      <ShiftTime at={row.start_at} workDate={row.work_date} />
                    </TableCell>
                    <TableCell className="tabular">
                      {row.missing_end ? (
                        <StatusBadge label={t("status.MISSING_END")} tone="warning" />
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <ShiftTime at={row.end_at} workDate={row.work_date} />
                          {row.adjusted && <StatusBadge label={t("status.ADJUSTED")} tone="info" />}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-right font-medium">{row.hours}</TableCell>
                    <TableCell>
                      <PhotoStrip day={row} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        {canAdjust && (
                          <Button
                            size="sm"
                            variant={row.missing_end ? "default" : "ghost"}
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpened(row);
                            }}
                          >
                            <PencilLine />
                            {row.missing_end ? t("adjust.add") : t("adjust.edit")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
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
                <TableHead>{t("field.plate")}</TableHead>
                <TableHead className="tabular text-right">{t("field.daysWorked")}</TableHead>
                <TableHead className="tabular text-right">{t("field.totalHours")}</TableHead>
                <TableHead className="tabular text-right">{t("field.missingEndDays")}</TableHead>
                <TableHead className="tabular text-right">{t("field.adjustedDays")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthly.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : monthRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-muted-foreground">
                    {t("month.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {monthRows.map((row) => (
                    <TableRow key={row.equipment}>
                      <TableCell>
                        <p className="font-medium">{row.equipment_name}</p>
                        <p className="text-xs text-muted-foreground">{row.project_name}</p>
                      </TableCell>
                      <TableCell>{row.plate || "-"}</TableCell>
                      <TableCell className="tabular text-right">{row.days_worked}</TableCell>
                      <TableCell className="tabular text-right font-medium">{row.total_hours}</TableCell>
                      <TableCell className="tabular text-right">
                        {row.missing_end_days > 0 ? (
                          <StatusBadge label={String(row.missing_end_days)} tone="warning" />
                        ) : (
                          0
                        )}
                      </TableCell>
                      <TableCell className="tabular text-right">{row.adjusted_days}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-semibold">{t("month.total")}</TableCell>
                    <TableCell />
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

/**
 * A time of the day; on the next calendar morning it says so - a night
 * shift's end is still this day's (Q28).
 */
function ShiftTime({ at, workDate }: { at: string | null; workDate: string }) {
  const t = useTranslations("equipmentHours");
  const df = useDateFormat();
  if (!at) return null;
  return <>{onNextMorning(at, workDate) ? t("field.nextDay", { time: df.time(at) }) : df.time(at)}</>;
}

/** Up to three small photos of the day, and how many there are. */
function PhotoStrip({ day }: { day: EquipmentHoursDay }) {
  const t = useTranslations("equipmentHours");
  const shown = day.photos.slice(0, 3);
  return (
    <span className="inline-flex items-center gap-1">
      {shown.map((photo) =>
        photo.watermarked_photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- a stamped evidence file served by the API
          <img
            key={photo.id}
            src={photo.watermarked_photo}
            alt={t("photoAlt")}
            className="size-8 rounded object-cover"
          />
        ) : (
          <Camera key={photo.id} className="size-4 text-muted-foreground" />
        ),
      )}
      <span className="text-xs text-muted-foreground">{t("photoCount", { count: day.photo_count })}</span>
    </span>
  );
}

/**
 * One machine's day in the record-detail popup (E8, Q31): its photos, the
 * office's end time and every correction.
 *
 * Saving needs a reason; the photos are not touched and an earlier correction
 * stays in the list under the new one. The correction history is the shell's
 * 更正记录; the end-time form is the decision panel.
 */
export function DayDialog({
  day,
  canAdjust,
  onClose,
  onSaved,
}: {
  day: EquipmentHoursDay;
  canAdjust: boolean;
  onClose: () => void;
  onSaved: (day: EquipmentHoursDay) => void;
}) {
  const t = useTranslations("equipmentHours");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const limits = endTimeLimits(day);
  const [endAt, setEndAt] = useState(() => {
    if (day.end_at) return localInputValue(day.end_at);
    // 17:00 for a day shift; a shift that started after it is closed by hand.
    const evening = `${day.work_date}T17:00`;
    return limits.min && limits.min >= evening ? limits.min : evening;
  });
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: () => adjustEquipmentDayEnd(adjustmentPayload(day, endAt, reason)),
    onSuccess: (saved) => {
      setReason("");
      setError("");
      onSaved(saved);
      void queryClient.invalidateQueries({ queryKey: ["equipment-hours"] });
    },
    onError: (reason_) =>
      setError(reason_ instanceof ApiError ? reason_.message : t("adjust.failed")),
  });

  return (
    <RecordDetailDialog
      title={`${day.equipment_name}${day.plate ? ` · ${day.plate}` : ""}`}
      description={`${df.date(day.work_date)} · ${t("dialog.summary", {
        start: df.time(day.start_at),
        end: day.end_at
          ? onNextMorning(day.end_at, day.work_date)
            ? t("field.nextDay", { time: df.time(day.end_at) })
            : df.time(day.end_at)
          : t("status.MISSING_END"),
        hours: day.hours,
      })}`}
      onClose={onClose}
    >
      <RecordDetailShell
        reference={`${day.equipment_code || day.equipment_name}-${day.work_date}`}
        facts={[
          { label: t("field.date"), value: df.date(day.work_date) },
          { label: t("field.plate"), value: day.plate || "-" },
          { label: t("field.project"), value: day.project_name },
          { label: t("field.start"), value: <ShiftTime at={day.start_at} workDate={day.work_date} /> },
          {
            label: t("field.end"),
            value: day.missing_end ? (
              <StatusBadge label={t("status.MISSING_END")} tone="warning" />
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <ShiftTime at={day.end_at} workDate={day.work_date} />
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
                label: `${df.time(photo.captured_at)} · ${photo.operator_name}`,
                ...photoMeta(photo),
              }]
            : [],
        )}
        recorder={<RecordRecorder record={day} />}
        corrections={<AdjustmentHistory day={day} />}
        actions={
          canAdjust ? (
            <section className="space-y-3">
              <h3 className="panel-title">
                {day.missing_end ? t("adjust.add") : t("adjust.edit")}
              </h3>
              <p className="text-xs text-muted-foreground">{t("adjust.help")}</p>
              <FieldWrapper label={t("adjust.endAt")} required>
                <Input
                  type="datetime-local"
                  value={endAt}
                  min={limits.min}
                  max={limits.max}
                  onChange={(event) => setEndAt(event.target.value)}
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
                    [endAt, t("adjust.endAt")],
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
 * Every end time the office has entered for the day, newest first; the first
 * is the one in use. The photos' own last time is shown under it, so the
 * correction can always be read against what the phone recorded.
 */
export function AdjustmentHistory({ day }: { day: EquipmentHoursDay }) {
  const t = useTranslations("equipmentHours");
  const df = useDateFormat();
  return (
    <ShellPanel title={t("history.title")} className="space-y-2">
      {day.adjustments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
      ) : (
        <ol className="space-y-2">
          {day.adjustments.map((entry, index) => (
            <li key={entry.id} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">
                {t("history.end", { end: df.dateTime(entry.end_at) })}
                {index === 0 && (
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
          {t("history.photoEnd", { end: df.time(day.photo_end_at) })}
        </p>
      )}
    </ShellPanel>
  );
}
