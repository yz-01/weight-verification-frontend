"use client";

import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { useAuth } from "@/components/providers/auth-provider";
import {
  FormSection,
  FormSkeleton,
  LoadErrorCard,
} from "@/components/shared/form-shell";
import {
  DetailHeader,
  ReadField,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  DriverWorkStatus,
  FleetTaskHistory,
  VehicleWorkStatus,
} from "@/interfaces/recycler";
import { useDateFormat } from "@/lib/dates";
import {
  getDriver,
  getDriverHistory,
  getVehicle,
  getVehicleHistory,
} from "@/services/recycler.service";

export function DriverDetail({ id }: { id: string }) {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const detail = useQuery({
    queryKey: ["drivers", "detail", id],
    queryFn: () => getDriver(id),
  });
  const history = useQuery({
    queryKey: ["drivers", "history", id],
    queryFn: () => getDriverHistory(id, { page_size: 100 }),
  });

  if (detail.isLoading) return <FormSkeleton sections={3} />;
  if (detail.isError || !detail.data) {
    return <LoadErrorCard backHref="/drivers" backLabel={t("drivers.title")} />;
  }
  const driver = detail.data;

  return (
    <div className="space-y-4">
      <DetailHeader
        backHref="/drivers"
        backLabel={t("drivers.title")}
        action={
          can("fleet.manage") ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href={`/drivers/${id}/edit`}>
                <Pencil className="h-4 w-4" />
                {t("common.edit")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <h1 className="text-lg font-semibold">{driver.full_name}</h1>
          <span className="text-sm text-muted-foreground">{driver.driver_no}</span>
          <StatusBadge
            label={t(`drivers.status.${driver.work_status}`)}
            tone={driverTone(driver.work_status)}
          />
          <StatusBadge
            label={t(driver.is_online ? "drivers.online" : "drivers.offline")}
            tone={driver.is_online ? "positive" : "neutral"}
          />
        </div>
        <div className="divide-y border-t">
          <FormSection title={t("drivers.section.identity")}>
            <ReadField label={t("drivers.field.phone")} value={driver.phone} />
            <ReadField label={t("drivers.field.icNo")} value={driver.ic_no} />
            <ReadField
              label={t("drivers.field.emergencyContact")}
              value={driver.emergency_contact}
            />
            <ReadField
              label={t("drivers.field.defaultVehicle")}
              value={driver.default_vehicle_plate}
            />
          </FormSection>
          <FormSection title={t("drivers.section.licence")}>
            <ReadField label={t("drivers.field.licenceNo")} value={driver.licence_no} />
            <ReadField
              label={t("drivers.field.licenceExpires")}
              value={driver.licence_expires_on ? df.date(driver.licence_expires_on) : null}
            />
            <PhotoLink label={t("drivers.field.licencePhoto")} href={driver.licence_photo} />
            <PhotoLink label={t("drivers.field.driverPhoto")} href={driver.photo} />
          </FormSection>
          <FormSection title={t("drivers.section.availability")}>
            <ReadField label={t("drivers.field.currentTask")} value={driver.current_task_no} />
            <ReadField
              label={t("drivers.field.lastPosition")}
              value={driver.last_position_at ? df.dateTime(driver.last_position_at) : null}
            />
            <ReadField label={t("drivers.field.notes")} value={driver.notes} className="md:col-span-2" />
          </FormSection>
        </div>
      </div>

      <HistoryTable rows={history.data?.results ?? []} loading={history.isLoading} />
    </div>
  );
}

export function VehicleDetail({ id }: { id: string }) {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const detail = useQuery({
    queryKey: ["vehicles", "detail", id],
    queryFn: () => getVehicle(id),
  });
  const history = useQuery({
    queryKey: ["vehicles", "history", id],
    queryFn: () => getVehicleHistory(id, { page_size: 100 }),
  });

  if (detail.isLoading) return <FormSkeleton sections={3} />;
  if (detail.isError || !detail.data) {
    return <LoadErrorCard backHref="/vehicles" backLabel={t("vehicles.title")} />;
  }
  const vehicle = detail.data;
  const brandModel =
    [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || vehicle.make_model;

  return (
    <div className="space-y-4">
      <DetailHeader
        backHref="/vehicles"
        backLabel={t("vehicles.title")}
        action={
          can("fleet.manage") ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href={`/vehicles/${id}/edit`}>
                <Pencil className="h-4 w-4" />
                {t("common.edit")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <h1 className="text-lg font-semibold">{vehicle.plate_no}</h1>
          <StatusBadge
            label={t(`vehicles.status.${vehicle.work_status}`)}
            tone={vehicleTone(vehicle.work_status)}
          />
        </div>
        <div className="divide-y border-t">
          <FormSection title={t("vehicles.section.identity")}>
            <ReadField label={t("vehicles.field.vehicleType")} value={t(`vehicles.type.${vehicle.vehicle_type}`)} />
            <ReadField label={t("vehicles.field.brandModel")} value={brandModel} />
            <ReadField
              label={t("vehicles.field.payloadCapacity")}
              value={vehicle.payload_capacity_kg ? `${vehicle.payload_capacity_kg} kg` : null}
            />
            <PhotoLink label={t("vehicles.field.photo")} href={vehicle.photo} />
          </FormSection>
          <FormSection title={t("vehicles.section.limits")}>
            <ReadField
              label={t("vehicles.field.maxLaden")}
              value={vehicle.max_laden_kg ? `${vehicle.max_laden_kg} kg` : null}
            />
            <ReadField label={t("vehicles.field.roadTaxExpires")} value={vehicle.road_tax_expires_on ? df.date(vehicle.road_tax_expires_on) : null} />
            <ReadField label={t("vehicles.field.insuranceExpires")} value={vehicle.insurance_expires_on ? df.date(vehicle.insurance_expires_on) : null} />
            <ReadField label={t("vehicles.field.permitExpires")} value={vehicle.permit_expires_on ? df.date(vehicle.permit_expires_on) : null} />
          </FormSection>
          <FormSection title={t("vehicles.section.availability")}>
            <ReadField label={t("vehicles.field.currentTask")} value={vehicle.current_task_no} />
            <ReadField label={t("vehicles.field.notes")} value={vehicle.notes} />
          </FormSection>
        </div>
      </div>

      <HistoryTable rows={history.data?.results ?? []} loading={history.isLoading} />
    </div>
  );
}

function PhotoLink({ label, href }: { label: string; href: string | null }) {
  const t = useTranslations();
  return (
    <ReadField
      label={label}
      value={href ? <a href={href} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{t("common.view")}</a> : null}
    />
  );
}

function HistoryTable({ rows, loading }: { rows: FleetTaskHistory[]; loading: boolean }) {
  const t = useTranslations();
  const df = useDateFormat();
  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold">{t("fleetHistory.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading ? t("common.loading") : t("fleetHistory.count", { count: rows.length })}
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("fleetHistory.task")}</TableHead>
            <TableHead>{t("fleetHistory.order")}</TableHead>
            <TableHead>{t("fleetHistory.project")}</TableHead>
            <TableHead>{t("fleetHistory.completed")}</TableHead>
            <TableHead>{t("fleetHistory.netWeight")}</TableHead>
            <TableHead>{t("fleetHistory.ticket")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.task_no}</TableCell>
              <TableCell>{row.dispatch_no ?? "—"}</TableCell>
              <TableCell>{row.project_name ?? "—"}</TableCell>
              <TableCell>{row.completed_at ? df.dateTime(row.completed_at) : "—"}</TableCell>
              <TableCell>{row.net_weight_kg ? `${row.net_weight_kg} kg` : "—"}</TableCell>
              <TableCell>
                {row.weigh_session_id ? (
                  <Link className="font-medium text-primary hover:underline" href={`/weigh-sessions/${row.weigh_session_id}`}>
                    {row.weigh_session_no}
                  </Link>
                ) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function driverTone(status: DriverWorkStatus) {
  if (status === "AVAILABLE" || status === "COMPLETED_TODAY") return "positive" as const;
  if (status === "ON_TASK") return "info" as const;
  if (status === "ON_LEAVE") return "warning" as const;
  return "neutral" as const;
}

function vehicleTone(status: VehicleWorkStatus) {
  if (status === "AVAILABLE") return "positive" as const;
  if (status === "ON_TASK") return "info" as const;
  if (status === "MAINTENANCE") return "warning" as const;
  return "neutral" as const;
}
