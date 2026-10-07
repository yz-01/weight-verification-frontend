"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CloudOff, Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldLoadNote } from "@/components/field-staff/field-load-note";
import { LocationField } from "@/components/field-staff/location-field";
import { FieldCamera } from "@/components/shared/field-camera";
import { FieldWrapper, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/interfaces/api";
import type { EquipmentHoursDay, EquipmentHoursMachine } from "@/interfaces/equipment-hours";
import { useDateFormat } from "@/lib/dates";
import type { LocationFix } from "@/lib/field-location";
import { loadEquipmentHoursMachines } from "@/services/equipment-hours.service";
import { submitEquipmentHoursPhotoOfflineAware } from "@/services/offline-sync.service";

/** 「名称 · 车牌」 - how a machine is named on the phone (no category, F3). */
export function machineLabel(machine: Pick<EquipmentHoursMachine, "name" | "plate">): string {
  return machine.plate ? `${machine.name} · ${machine.plate}` : machine.name;
}

/**
 * The moment the photo was taken, from the file itself (B4 audit #30, Q29.10).
 *
 * The in-app camera stamps each shot with the moment the shutter closed
 * (`FieldCamera` sets `lastModified` when it draws the frame), so the day
 * starts then - not when 发送 is pressed a few minutes later. A file with no
 * usable time gives nothing, and the queue then uses the moment of sending.
 */
export function photoTakenAt(file: File | undefined): string | undefined {
  if (!file || !Number.isFinite(file.lastModified) || file.lastModified <= 0) return undefined;
  return new Date(file.lastModified).toISOString();
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

export type LastSent =
  | { status: "uploaded"; label: string; day: EquipmentHoursDay | null }
  | { status: "queued"; label: string };

/**
 * 设备操作员工时 on the phone (2026-10 B15): pick the machine, take the
 * photo, send. Once when the machine starts, once when it stops - the office
 * works out the hours. Works with no signal: the photo waits in the offline
 * queue with the moment it was taken.
 */
export function EquipmentHoursCapture({
  initialProject = "",
}: {
  initialProject?: string;
}) {
  const t = useTranslations("equipmentHours");
  const { user } = useAuth();
  const [project, setProject] = useState(initialProject);
  const [equipment, setEquipment] = useState("");
  const [shot, setShot] = useState<File>();
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [error, setError] = useState("");
  const [last, setLast] = useState<LastSent | null>(null);

  const machines = useQuery({
    queryKey: ["equipment-hours", "machines", project],
    queryFn: () => loadEquipmentHoursMachines(project),
    enabled: Boolean(project),
    staleTime: 60_000,
  });
  const rows = machines.data ?? [];
  const chosen = rows.find((row) => row.id === equipment);

  const send = useMutation({
    mutationFn: () => {
      if (!user || !chosen || !shot) throw new Error("missing");
      return submitEquipmentHoursPhotoOfflineAware(user.id, {
        equipment: chosen.id,
        equipmentLabel: machineLabel(chosen),
        photo: shot,
        capturedAt: photoTakenAt(shot),
        latitude: fix?.latitude,
        longitude: fix?.longitude,
        locationAccuracyM: fix?.accuracy,
      });
    },
    onSuccess: (result) => {
      const label = chosen ? machineLabel(chosen) : "";
      setLast(
        result.status === "uploaded"
          ? { status: "uploaded", label, day: result.upload.day }
          : { status: "queued", label },
      );
      // The machine stays picked: the stop photo is of the same machine.
      setShot(undefined);
      setError("");
    },
    onError: (reason) =>
      setError(reason instanceof ApiError ? reason.message : t("phone.failed")),
  });

  return (
    <div className="space-y-4">
      <p className="rounded-lg border bg-muted/30 p-3 text-sm leading-5 text-muted-foreground">
        {t("phone.howTo")}
      </p>

      {!initialProject && (
        <FieldWrapper label={t("phone.project")} required>
          <ProjectPicker
            value={project}
            onValueChange={(value) => {
              setProject(value);
              setEquipment("");
            }}
            placeholder={t("phone.project")}
            className="h-11 w-full"
          />
        </FieldWrapper>
      )}

      <FieldWrapper label={t("phone.machine")} required>
        <Select value={equipment} onValueChange={setEquipment} disabled={!project}>
          <SelectTrigger className="h-12 w-full" aria-label={t("phone.machine")}>
            <SelectValue placeholder={t("phone.pickMachine")} />
          </SelectTrigger>
          <SelectContent>
            {rows.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {machineLabel(row)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {machines.isError ? (
          <FieldLoadNote query={machines} what={t("phone.machines")} />
        ) : machines.isSuccess && rows.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">{t("phone.noMachines")}</p>
        ) : null}
      </FieldWrapper>

      <FieldWrapper label={t("phone.photo")} required>
        <FieldCamera
          label={shot ? t("phone.photoReady") : t("phone.takePhoto")}
          file={shot}
          fileCount={shot ? 1 : 0}
          onCapture={setShot}
          onClear={() => setShot(undefined)}
        />
      </FieldWrapper>

      <LocationField
        label={t("phone.location")}
        actionLabel={t("phone.location")}
        readyLabel={t("phone.locationReady")}
        value={fix}
        onChange={setFix}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        className="h-12 w-full text-sm"
        requires={[
          [equipment, t("phone.machine")],
          [shot, t("phone.photo")],
        ]}
        disabled={send.isPending}
        onClick={() => send.mutate()}
      >
        {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
        {t("phone.send")}
      </Button>

      {last && <LastSentNote last={last} />}
    </div>
  );
}

/** What the phone says after a photo: the machine's day so far, or that it waits. */
export function LastSentNote({ last }: { last: LastSent }) {
  const t = useTranslations("equipmentHours");
  const df = useDateFormat();
  // A photo before 06:00 belongs to the shift that started the evening
  // before (Q28): the line names that shift instead of saying 「今天」.
  const newest = last.status === "uploaded" ? last.day?.photos.at(-1)?.captured_at : undefined;
  const earlierShift =
    last.status === "uploaded" && last.day && newest
      ? siteDay(newest) !== last.day.work_date
      : false;
  return (
    <section className="rounded-lg border bg-card p-3 text-sm shadow-sm" aria-live="polite">
      <p className="font-semibold">{last.label}</p>
      {last.status === "queued" ? (
        <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
          <CloudOff className="size-4" />
          {t("phone.queued")}
        </p>
      ) : last.day ? (
        <div className="mt-1 space-y-1">
          <p className="text-muted-foreground">
            {earlierShift
              ? t("phone.shift", {
                  date: df.date(last.day.work_date),
                  count: last.day.photo_count,
                  start: df.time(last.day.start_at),
                })
              : t("phone.today", {
                  count: last.day.photo_count,
                  start: df.time(last.day.start_at),
                })}
          </p>
          {last.day.missing_end ? (
            <StatusBadge label={t("phone.stopHint")} tone="warning" />
          ) : (
            <p>
              {t("phone.soFar", {
                end: df.time(last.day.end_at),
                hours: last.day.hours,
              })}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
