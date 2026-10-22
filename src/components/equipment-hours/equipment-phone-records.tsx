"use client";

/**
 * Hours records on a phone (J37): 正常 / 超时 / 总工时, as the office has them.
 *
 * - 「我的记录」 on a driver's own clock link (J37-1): that driver's last 30
 *   days, one row per session, and this month's totals. Read only.
 * - The field staff's equipment-hours page (J37-2): the project's last days
 *   and their totals.
 *
 * The numbers come from the server's own split (`split_overtime`); nothing is
 * added up or cut at 8 hours here. Colours as the office table (J31): normal
 * blue, overtime orange - never gold (已修改) nor red.
 */

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { NORMAL_CLASS, OVERTIME_CLASS } from "@/components/equipment-hours/equipment-operator-hours";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import type { EquipmentPhoneRecord, EquipmentPhoneTotals } from "@/interfaces/equipment-hours";
import { cn } from "@/lib/utils";
import { getDriverMyRecords } from "@/services/driver-clock.service";
import { getEquipmentPhoneRecords } from "@/services/equipment-hours.service";

const clockFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** `07:05`: 24 hours on the site's clock, whatever the phone's own setting. */
export function clockTime(iso: string | null): string {
  if (!iso) return "";
  const moment = new Date(iso);
  return Number.isNaN(moment.getTime()) ? "" : clockFormat.format(moment);
}

/** The machine as a line: 「12 · Excavator」 - the site number first. */
export function recordMachine(row: Pick<EquipmentPhoneRecord, "site_no" | "equipment_code" | "equipment_name">): string {
  return [row.site_no || row.equipment_code, row.equipment_name].filter(Boolean).join(" · ");
}

function Figures({
  normal,
  overtime,
  total,
  big,
}: {
  normal: string | null;
  overtime: string | null;
  total: string | null;
  big?: boolean;
}) {
  const t = useTranslations("equipmentHours.records");
  const cell = (label: string, value: string | null, tone?: string) => (
    <div className="min-w-0 flex-1 text-center">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular-nums font-semibold", big ? "text-xl" : "text-base", tone)}>{value ?? "-"}</p>
    </div>
  );
  return (
    <div className="flex gap-2">
      {cell(t("normal"), normal, NORMAL_CLASS)}
      {cell(t("overtime"), overtime, OVERTIME_CLASS)}
      {cell(t("total"), total)}
    </div>
  );
}

export function PhoneRecordsList({
  rows,
  totals,
  totalsTitle,
}: {
  rows: EquipmentPhoneRecord[];
  totals: EquipmentPhoneTotals;
  totalsTitle: string;
}) {
  const t = useTranslations("equipmentHours.records");
  return (
    <div className="space-y-3">
      <section className="space-y-2 rounded-lg border bg-card px-3 py-3" data-testid="records-totals">
        <p className="text-sm font-medium">{totalsTitle}</p>
        <Figures
          big
          normal={totals.normal_hours}
          overtime={totals.overtime_hours}
          total={totals.total_hours}
        />
      </section>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.key} className="space-y-2 rounded-lg border bg-card px-3 py-2" data-testid="record-row">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{recordMachine(row)}</p>
                <p className="shrink-0 text-xs tabular-nums text-muted-foreground">{row.work_date}</p>
              </div>
              <p className="text-sm tabular-nums text-muted-foreground">
                {t("start")} {clockTime(row.start_at) || "-"}
                {" · "}
                {row.end_at ? `${t("end")} ${clockTime(row.end_at)}` : t("running")}
                {row.operator_name ? ` · ${row.operator_name}` : ""}
              </p>
              <Figures normal={row.normal_hours} overtime={row.overtime_hours} total={row.hours} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 「我的记录」 on the driver's link (J37-1). */
export function DriverMyRecords({ token, device }: { token: string; device: string }) {
  const t = useTranslations("equipmentHours.records");
  const query = useQuery({
    queryKey: ["equipment-hours", "driver-records", token],
    queryFn: () => getDriverMyRecords(token, device),
    enabled: Boolean(token && device),
  });
  return (
    <section className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("driverHint", { days: query.data?.days ?? 30 })}</p>
      {query.isError ? (
        <QueryFailedNote query={query} what={t("what")} />
      ) : !query.data ? (
        <Loader2 className="mx-auto size-6 animate-spin text-primary" />
      ) : (
        <PhoneRecordsList rows={query.data.rows} totals={query.data.month_totals} totalsTitle={t("monthTotals")} />
      )}
    </section>
  );
}

/** The project's recent records under the field staff's entry (J37-2). */
export function FieldStaffRecords({ project }: { project: string }) {
  const t = useTranslations("equipmentHours.records");
  const query = useQuery({
    queryKey: ["equipment-hours", "phone-records", project],
    queryFn: () => getEquipmentPhoneRecords(project),
    enabled: Boolean(project),
  });
  if (!project) return null;
  return (
    <section className="space-y-3 border-t pt-4">
      <h2 className="text-base font-semibold">{t("staffTitle")}</h2>
      <p className="text-xs text-muted-foreground">{t("staffHint", { days: query.data?.days ?? 7 })}</p>
      {query.isError ? (
        <QueryFailedNote query={query} what={t("what")} />
      ) : !query.data ? (
        <Loader2 className="mx-auto size-6 animate-spin text-primary" />
      ) : (
        <PhoneRecordsList rows={query.data.rows} totals={query.data.totals} totalsTitle={t("recentTotals")} />
      )}
    </section>
  );
}
