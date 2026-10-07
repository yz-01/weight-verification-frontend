"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, PencilLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ExportButton } from "@/components/shared/export-button";
import {
  FieldWrapper,
  ListHeader,
  QueryFailedNote,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [project, setProject] = useState("");
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [opened, setOpened] = useState<EquipmentHoursDay | null>(null);
  const canAdjust = can("equipment.manage");

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

  const exportDays = (format: ExportFormat) =>
    exportEquipmentHoursDays(
      {
        format,
        title: tRoot("nav.submodule.equipmentOperatorHours"),
        subtitle: t("export.range", { from: dateFrom, to: dateTo }),
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
        action={view === "day" ? <ExportButton onExport={exportDays} disabled={rows.length === 0} /> : undefined}
      />

      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={view} onValueChange={(value) => setView(value as View)}>
          <TabsList>
            <TabsTrigger value="day">{t("view.day")}</TabsTrigger>
            <TabsTrigger value="month">{t("view.month")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <ProjectPicker
          value={project}
          onValueChange={setProject}
          placeholder={t("field.project")}
          allowAll
          allLabel={t("allProjects")}
          className="h-9 w-56"
        />
        {view === "day" ? (
          <>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {t("filter.from")}
              <Input
                type="date"
                className="h-9 w-40"
                value={dateFrom}
                max={dateTo}
                onChange={(event) => setDateFrom(event.target.value || today)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {t("filter.to")}
              <Input
                type="date"
                className="h-9 w-40"
                value={dateTo}
                min={dateFrom}
                onChange={(event) => setDateTo(event.target.value || today)}
              />
            </label>
          </>
        ) : (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {t("filter.month")}
            <Input
              type="month"
              className="h-9 w-44"
              value={month}
              onChange={(event) => setMonth(event.target.value || today.slice(0, 7))}
            />
          </label>
        )}
      </div>

      {view === "day" ? (
        <div className="rounded-lg border bg-card">
          <QueryFailedNote query={days} what={t("what.days")} className="p-3" />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("field.date")}</TableHead>
                <TableHead>{t("field.equipment")}</TableHead>
                <TableHead>{t("field.plate")}</TableHead>
                <TableHead>{t("field.start")}</TableHead>
                <TableHead>{t("field.end")}</TableHead>
                <TableHead className="text-right">{t("field.hours")}</TableHead>
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
                    <TableCell className="tabular-nums">{df.date(row.work_date)}</TableCell>
                    <TableCell>
                      <p className="font-medium">{row.equipment_name}</p>
                      <p className="text-xs text-muted-foreground">{row.project_name}</p>
                    </TableCell>
                    <TableCell>{row.plate || "-"}</TableCell>
                    <TableCell className="tabular-nums">{df.time(row.start_at)}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.missing_end ? (
                        <StatusBadge label={t("status.MISSING_END")} tone="warning" />
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          {df.time(row.end_at)}
                          {row.adjusted && <StatusBadge label={t("status.ADJUSTED")} tone="info" />}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{row.hours}</TableCell>
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
        <div className="rounded-lg border bg-card">
          <QueryFailedNote query={monthly} what={t("what.month")} className="p-3" />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("field.equipment")}</TableHead>
                <TableHead>{t("field.plate")}</TableHead>
                <TableHead className="text-right">{t("field.daysWorked")}</TableHead>
                <TableHead className="text-right">{t("field.totalHours")}</TableHead>
                <TableHead className="text-right">{t("field.missingEndDays")}</TableHead>
                <TableHead className="text-right">{t("field.adjustedDays")}</TableHead>
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
                      <TableCell className="text-right tabular-nums">{row.days_worked}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{row.total_hours}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.missing_end_days > 0 ? (
                          <StatusBadge label={String(row.missing_end_days)} tone="warning" />
                        ) : (
                          0
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.adjusted_days}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-semibold">{t("month.total")}</TableCell>
                    <TableCell />
                    <TableCell className="text-right" />
                    <TableCell className="text-right font-semibold tabular-nums">
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
 * One machine's day: its photos, the office's end time and every correction.
 *
 * Saving needs a reason; the photos are not touched and an earlier correction
 * stays in the list under the new one.
 */
function DayDialog({
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
  const [endAt, setEndAt] = useState(() =>
    day.end_at ? localInputValue(day.end_at) : `${day.work_date}T17:00`,
  );
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {day.equipment_name}
            {day.plate ? ` · ${day.plate}` : ""}
          </DialogTitle>
          <DialogDescription>
            {df.date(day.work_date)} · {t("dialog.summary", {
              start: df.time(day.start_at),
              end: day.end_at ? df.time(day.end_at) : t("status.MISSING_END"),
              hours: day.hours,
            })}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t("dialog.photos")}</h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {day.photos.map((photo) => (
              <a
                key={photo.id}
                href={photo.watermarked_photo ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-md border bg-muted/20"
              >
                {photo.watermarked_photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a stamped evidence file served by the API
                  <img src={photo.watermarked_photo} alt={t("photoAlt")} className="aspect-square w-full object-cover" />
                ) : (
                  <span className="grid aspect-square place-items-center">
                    <Camera className="size-5 text-muted-foreground" />
                  </span>
                )}
                <span className="block px-1.5 py-1 text-xs">
                  {df.time(photo.captured_at)} · {photo.operator_name}
                </span>
              </a>
            ))}
          </div>
        </section>

        {canAdjust && (
          <section className="space-y-3 rounded-lg border p-3">
            <h3 className="text-sm font-semibold">
              {day.missing_end ? t("adjust.add") : t("adjust.edit")}
            </h3>
            <p className="text-xs text-muted-foreground">{t("adjust.help")}</p>
            <FieldWrapper label={t("adjust.endAt")} required>
              <Input
                type="datetime-local"
                value={endAt}
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
            <DialogFooter>
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
            </DialogFooter>
          </section>
        )}

        <AdjustmentHistory day={day} />
      </DialogContent>
    </Dialog>
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
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{t("history.title")}</h3>
      {day.adjustments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
      ) : (
        <ol className="space-y-2">
          {day.adjustments.map((entry, index) => (
            <li key={entry.id} className="rounded-md border p-2 text-sm">
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
    </section>
  );
}
