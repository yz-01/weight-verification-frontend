"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudOff, Loader2, Play, ScanLine, Send, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldLoadNote } from "@/components/field-staff/field-load-note";
import { LocationField } from "@/components/field-staff/location-field";
import { SupplierQrScanner } from "@/components/field-staff/supplier-qr-scanner";
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
import type {
  EquipmentHoursMachine,
  EquipmentHoursSession,
  EquipmentPhotoKind,
} from "@/interfaces/equipment-hours";
import { useDateFormat } from "@/lib/dates";
import type { LocationFix } from "@/lib/field-location";
import { photoTakenAt } from "@/lib/photo-meta";
import { cn } from "@/lib/utils";
import { loadEquipmentHoursMachines } from "@/services/equipment-hours.service";
import { submitEquipmentHoursPhotoOfflineAware } from "@/services/offline-sync.service";

/**
 * 「编号 · 名称 · 车牌」 - how a machine is named on the phone: the equipment
 * number first, the way it is painted on the machine (no category, F3).
 */
export function machineLabel(
  machine: Pick<EquipmentHoursMachine, "name" | "plate"> & { code?: string },
): string {
  return [machine.code, machine.name, machine.plate].filter(Boolean).join(" · ");
}

/**
 * The moment the photo was taken, from the file itself (B4 audit #30, Q29.10):
 * the hours start when the shutter closed, not when 发送 was pressed. Shared
 * with every other upload now (`@/lib/photo-meta`).
 */
export { photoTakenAt };

/** Letters and digits only, upper case: how a plate or number is compared. */
function squash(value: string | undefined | null): string {
  return (value ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/**
 * The machine a scanned QR names (Lucas 2026-10-10: 「有些就是贴一张二维码在设备
 * 上。也需要扫码」). The system prints no machine QR of its own, so the code is
 * read as text: the machine's id, its equipment number, its plate or its
 * serial number; a link is read for an `equipment` / `code` / `id` parameter
 * or its last path part. Spaces, dashes and case do not matter.
 */
export function matchScannedMachine(
  text: string,
  machines: EquipmentHoursMachine[],
): EquipmentHoursMachine | null {
  const raw = text.trim();
  if (!raw) return null;
  const candidates = [raw];
  try {
    const url = new URL(raw);
    for (const name of ["equipment", "code", "id", "machine"]) {
      const value = url.searchParams.get(name);
      if (value) candidates.push(value);
    }
    const last = url.pathname.split("/").filter(Boolean).at(-1);
    if (last) candidates.push(decodeURIComponent(last));
  } catch {
    // Not a link: the text itself.
  }
  for (const candidate of candidates) {
    const byId = machines.find((machine) => machine.id === candidate);
    if (byId) return byId;
    const key = squash(candidate);
    if (!key) continue;
    const found =
      machines.find((machine) => squash(machine.code) === key) ??
      machines.find((machine) => squash(machine.plate) === key) ??
      machines.find((machine) => squash(machine.serial_no) === key);
    if (found) return found;
  }
  return null;
}

/** 开工 when the machine is not running, 收工 when it is. */
export function nextKind(machine: Pick<EquipmentHoursMachine, "open_since"> | undefined): EquipmentPhotoKind {
  return machine?.open_since ? "FINISH" : "START";
}

const ALL = "all";
const NO_SUPPLIER = "none";

/** Whether no machine on the site names its company (or there are none). */
export function noSupplierNamed(rows: { supplier?: string | null }[]): boolean {
  return rows.every((row) => !row.supplier);
}

export type LastSent =
  | { status: "uploaded"; label: string; kind: EquipmentPhotoKind; session: EquipmentHoursSession | null }
  | { status: "queued"; label: string; kind: EquipmentPhotoKind };

/**
 * 设备操作员工时 on the phone (2026-10 B15; in/out pairs since 2026-10-10):
 * pick the supplier and the machine - or scan the QR on it - say 开工 or 收工,
 * take the photo, send. A start and the stop after it are one row of hours
 * in the office. Works with no signal: the photo waits in the offline queue
 * with the moment it was taken.
 */
export function EquipmentHoursCapture({
  initialProject = "",
}: {
  initialProject?: string;
}) {
  const t = useTranslations("equipmentHours");
  const df = useDateFormat();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [project, setProject] = useState(initialProject);
  const [supplier, setSupplier] = useState(ALL);
  const [equipment, setEquipment] = useState("");
  const [kind, setKind] = useState<EquipmentPhotoKind>("START");
  const [shot, setShot] = useState<File>();
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [last, setLast] = useState<LastSent | null>(null);

  const machines = useQuery({
    queryKey: ["equipment-hours", "machines", project],
    queryFn: () => loadEquipmentHoursMachines(project),
    enabled: Boolean(project),
    staleTime: 60_000,
  });
  const rows = machines.data ?? [];
  const chosen = rows.find((row) => row.id === equipment);
  // A project hires machines from several companies: the supplier narrows
  // the list. Always offered, so every phone shows the same form (Lucas,
  // 2026-10-10: 「为什么客户的有供应商我没有」).
  const suppliers = [
    ...new Map(
      rows.map((row) => [row.supplier || NO_SUPPLIER, row.supplier_name || ""]),
    ).entries(),
  ];
  // No machine names its company: the one honest choice is 「未填供应商」,
  // not 「全部供应商」 (Lucas, 2026-10-10).
  const unfilledOnly = noSupplierNamed(rows);
  const supplierValue = unfilledOnly ? NO_SUPPLIER : supplier;
  const listed = rows.filter(
    (row) => supplierValue === ALL || (row.supplier || NO_SUPPLIER) === supplierValue,
  );

  const pick = (machine: EquipmentHoursMachine | undefined) => {
    setEquipment(machine?.id ?? "");
    setKind(nextKind(machine));
    setError("");
  };

  const send = useMutation({
    mutationFn: () => {
      if (!user || !chosen || !shot) throw new Error("missing");
      return submitEquipmentHoursPhotoOfflineAware(user.id, {
        equipment: chosen.id,
        equipmentLabel: machineLabel(chosen),
        kind,
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
          ? { status: "uploaded", label, kind, session: result.upload.session }
          : { status: "queued", label, kind },
      );
      // The machine stays picked and the other end comes next: the stop
      // photo is of the same machine.
      setKind(kind === "START" ? "FINISH" : "START");
      setShot(undefined);
      setError("");
      void queryClient.invalidateQueries({ queryKey: ["equipment-hours", "machines"] });
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
              setSupplier(ALL);
              pick(undefined);
            }}
            placeholder={t("phone.project")}
            className="h-11 w-full"
          />
        </FieldWrapper>
      )}

      <FieldWrapper label={t("phone.supplier")}>
        <Select
          value={supplierValue}
          onValueChange={(value) => {
            setSupplier(value);
            if (chosen && value !== ALL && (chosen.supplier || NO_SUPPLIER) !== value) {
              pick(undefined);
            }
          }}
        >
          <SelectTrigger className="h-12 w-full" aria-label={t("phone.supplier")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {!unfilledOnly && <SelectItem value={ALL}>{t("phone.allSuppliers")}</SelectItem>}
            {unfilledOnly && suppliers.length === 0 && (
              <SelectItem value={NO_SUPPLIER}>{t("phone.noSupplier")}</SelectItem>
            )}
            {suppliers.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {id === NO_SUPPLIER ? t("phone.noSupplier") : name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldWrapper>

      <FieldWrapper label={t("phone.machine")} required>
        <div className="flex gap-2">
          <Select
            value={equipment}
            onValueChange={(value) => pick(rows.find((row) => row.id === value))}
            disabled={!project}
          >
            <SelectTrigger className="h-12 min-w-0 flex-1" aria-label={t("phone.machine")}>
              <SelectValue placeholder={t("phone.pickMachine")} />
            </SelectTrigger>
            <SelectContent>
              {listed.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {machineLabel(row)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            className="h-12 shrink-0"
            requires={[[project, t("phone.project")]]}
            onClick={() => setScanning(true)}
          >
            <ScanLine />
            {t("phone.scan")}
          </Button>
        </div>
        {machines.isError ? (
          <FieldLoadNote query={machines} what={t("phone.machines")} />
        ) : machines.isSuccess && rows.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">{t("phone.noMachines")}</p>
        ) : null}
        {chosen?.supplier_name ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("phone.suppliedBy", { supplier: chosen.supplier_name })}
          </p>
        ) : null}
      </FieldWrapper>

      <FieldWrapper label={t("phone.kind")} required>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("phone.kind")}>
          {(["START", "FINISH"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
              className={cn(
                "flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-medium",
                kind === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground",
              )}
            >
              {value === "START" ? <Play className="size-4" /> : <Square className="size-4" />}
              {t(`kind.${value}`)}
            </button>
          ))}
        </div>
        {chosen?.open_since ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("phone.openSince", { start: df.dateTime(chosen.open_since) })}
          </p>
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
        {t("phone.send", { kind: t(`kind.${kind}`) })}
      </Button>

      {last && <LastSentNote last={last} />}

      <SupplierQrScanner
        open={scanning}
        raw
        labels={{
          title: t("phone.scanTitle"),
          help: t("phone.scanHelp"),
          image: t("phone.scanImage"),
        }}
        onClose={() => setScanning(false)}
        onDetected={(text) => {
          setScanning(false);
          const found = matchScannedMachine(text, rows);
          if (!found) {
            setError(t("phone.qrNoMatch", { text: text.slice(0, 60) }));
            return;
          }
          setSupplier(ALL);
          pick(found);
        }}
      />
    </div>
  );
}

/** What the phone says after a photo: the session so far, or that it waits. */
export function LastSentNote({ last }: { last: LastSent }) {
  const t = useTranslations("equipmentHours");
  const df = useDateFormat();
  const session = last.status === "uploaded" ? last.session : null;
  return (
    <section className="rounded-lg border bg-card p-3 text-sm" aria-live="polite">
      <p className="font-semibold">
        {t(`kind.${last.kind}`)} · {last.label}
      </p>
      {last.status === "queued" ? (
        <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
          <CloudOff className="size-4" />
          {t("phone.queued")}
        </p>
      ) : session ? (
        <div className="mt-1 space-y-1">
          {session.missing_start ? (
            <StatusBadge label={t("phone.missingStart")} tone="warning" />
          ) : session.missing_end ? (
            <>
              <p className="text-muted-foreground">
                {t("phone.started", { start: df.dateTime(session.start_at) })}
              </p>
              <StatusBadge label={t("phone.stopHint")} tone="warning" />
            </>
          ) : (
            <p>
              {t("phone.soFar", {
                start: df.dateTime(session.start_at),
                end: df.dateTime(session.end_at),
                hours: session.hours,
              })}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
