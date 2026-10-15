"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudOff, Keyboard, Loader2, Play, ScanLine, Send, Square, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldLoadNote } from "@/components/field-staff/field-load-note";
import { FieldSignaturePad } from "@/components/field-staff/field-signature-pad";
import { LocationField } from "@/components/field-staff/location-field";
import { SupplierQrScanner } from "@/components/field-staff/supplier-qr-scanner";
import { FieldCamera } from "@/components/shared/field-camera";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/interfaces/api";
import type { EquipmentHoursMachine, EquipmentPhotoKind } from "@/interfaces/equipment-hours";
import { useDateFormat } from "@/lib/dates";
import type { LocationFix } from "@/lib/field-location";
import { getOfflineJobs } from "@/lib/offline-db";
import { photoTakenAt } from "@/lib/photo-meta";
import { matchScanned, squashCode } from "@/lib/machine-scan";
import { cn } from "@/lib/utils";
import { loadEquipmentHoursMachines } from "@/services/equipment-hours.service";
import { submitEquipmentHoursPhotoOfflineAware } from "@/services/offline-sync.service";

/**
 * 「编号 · 名称 · 车牌」 - how a machine is named in the offline queue: the
 * number painted on the machine first (no category, F3). That is the office's
 * 现场编号 when it has given one (「12 · 挖机 · WXY 1234」, 2026-10-10), else
 * the equipment number.
 */
export function machineLabel(
  machine: Pick<EquipmentHoursMachine, "name" | "plate"> & { code?: string; site_no?: string },
): string {
  return [machine.site_no || machine.code, machine.name, machine.plate].filter(Boolean).join(" · ");
}

/** The number the phone shows to check a scan: the 设备编号, else the code. */
export function machineNumber(machine: { code?: string; site_no?: string }): string {
  return machine.site_no || machine.code || "";
}

/**
 * The moment the photo was taken, from the file itself (B4 audit #30, Q29.10):
 * the hours start when the shutter closed, not when 发送 was pressed. Shared
 * with every other upload now (`@/lib/photo-meta`).
 */
export { photoTakenAt };

/** Letters and digits only, upper case - see `lib/machine-scan`. */
const squash = squashCode;

/**
 * The machine a scanned QR names (Lucas 2026-10-10: 「有些就是贴一张二维码在设备
 * 上。也需要扫码」). Since 2026-10 I24 the system prints its own code for every
 * machine - the link `/scan/equipment?equipment=<id>`, from 设备清单 - and this
 * reads it like any other sticker (`lib/machine-scan`, the server's rule too):
 * the machine's id, its equipment number, its 现场编号, its plate or its serial
 * number; a link is read for an `equipment` / `code` / `id` / `machine`
 * parameter or its last path part. Spaces, dashes and case do not matter.
 */
export function matchScannedMachine(
  text: string,
  machines: EquipmentHoursMachine[],
): EquipmentHoursMachine | null {
  return matchScanned(text, machines, (machine) => ({
    id: machine.id,
    code: machine.code,
    site_no: machine.site_no,
    plate: machine.plate,
    serial_no: machine.serial_no,
  }));
}

/**
 * The machine a typed number names (「二维码损坏，可输入固定设备编号」): the
 * office's 现场编号 first - 「12」 is what is painted on the machine - then
 * whatever a scan would match (equipment number, plate, serial). Spaces,
 * dashes and case do not matter.
 */
export function matchTypedMachine(
  text: string,
  machines: EquipmentHoursMachine[],
): EquipmentHoursMachine | null {
  const key = squash(text);
  if (!key) return null;
  return (
    machines.find((machine) => squash(machine.site_no) === key) ??
    matchScannedMachine(text, machines)
  );
}

/** 开工 when the machine is not running, 收工 when it is. */
export function nextKind(machine: Pick<EquipmentHoursMachine, "open_since"> | undefined): EquipmentPhotoKind {
  return machine?.open_since ? "FINISH" : "START";
}

/** A photo of a machine still waiting on this phone (no signal yet). */
export interface WaitingPhoto {
  equipment: string;
  kind?: EquipmentPhotoKind;
  capturedAt: string;
}

/**
 * 开工 or 收工 for a machine just scanned (2026-10 I4, ID17). The server says
 * whether it is running - but a photo still waiting in this phone's offline
 * queue is newer than anything the server knows, so the newest of those
 * decides first (「手机离线排队时，排队里的上一笔也要算进去」). The worker can
 * still change it.
 */
export function kindToTake(
  machine: Pick<EquipmentHoursMachine, "id" | "open_since">,
  waiting: readonly WaitingPhoto[],
): EquipmentPhotoKind {
  const newest = waiting
    .filter((photo) => photo.equipment === machine.id && photo.kind)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    .at(-1);
  if (newest) return newest.kind === "START" ? "FINISH" : "START";
  return nextKind(machine);
}

async function waitingPhotos(ownerId: string): Promise<WaitingPhoto[]> {
  try {
    const jobs = await getOfflineJobs(ownerId);
    return jobs.flatMap((job) =>
      job.kind === "EQUIPMENT_HOURS_PHOTO"
        ? [{ equipment: job.payload.equipment, kind: job.payload.kind, capturedAt: job.payload.capturedAt }]
        : [],
    );
  } catch {
    // No offline store on this browser: the server's word stands.
    return [];
  }
}

/** What the line over the scan button says after a photo. */
export interface LastSent {
  status: "uploaded" | "queued";
  /** The machine's number, 「12」. */
  number: string;
  kind: EquipmentPhotoKind;
  /** When the photo was taken (ISO). */
  at: string;
}

/**
 * 设备操作员工时 on the phone (2026-10 I4; in/out pairs since 2026-10-10).
 *
 * The client: 「只设一个『扫描设备二维码』入口。开工：扫码 → 拍照 → 司机签名 →
 * 提交。收工：扫码 → 拍照 → 司机签名 → 提交。二维码损坏，可输入固定设备编号。支持
 * 连续操作多部设备，不同人员、不同手机均可使用。手机端不需要显示设备资料。」
 *
 * So: one big 「扫描设备二维码」 button, and a small 「二维码坏了？输入编号」.
 * A machine found shows one line - 「12 号 · 挖土机」 - to check the scan
 * (ID18), says 开工 or 收工 by itself (ID17, changeable), then photo, the
 * driver's signature (ID20), send. Sent - or kept on the phone with no
 * signal - the screen is back on the scan button at once with a line
 * 「已提交：12 号 收工 19:23」, so ten machines are ten rounds of scan, photo,
 * sign, send.
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
  const [machine, setMachine] = useState<EquipmentHoursMachine | null>(null);
  const [kind, setKind] = useState<EquipmentPhotoKind>("START");
  const [shot, setShot] = useState<File>();
  const [signature, setSignature] = useState<File>();
  // Each machine gets a clean signature pad: the key remounts it.
  const [round, setRound] = useState(0);
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [last, setLast] = useState<LastSent | null>(null);

  const machines = useQuery({
    queryKey: ["equipment-hours", "machines", project],
    queryFn: () => loadEquipmentHoursMachines(project),
    enabled: Boolean(project),
    staleTime: 60_000,
  });
  const rows = machines.data ?? [];

  const pick = (found: EquipmentHoursMachine) => {
    setMachine(found);
    setKind(nextKind(found));
    setShot(undefined);
    setSignature(undefined);
    setRound((value) => value + 1);
    setError("");
    setTyping(false);
    setTyped("");
    if (user) {
      void waitingPhotos(user.id).then((waiting) => setKind(kindToTake(found, waiting)));
    }
  };

  /** Back to the scan button, ready for the next machine. */
  const reset = () => {
    setMachine(null);
    setShot(undefined);
    setSignature(undefined);
    setRound((value) => value + 1);
    setTyping(false);
    setTyped("");
  };

  const typedMatch = typed.trim() ? matchTypedMachine(typed, rows) : null;
  const takeTyped = () => {
    if (typedMatch) pick(typedMatch);
    else setError(t("phone.typedNoMatch"));
  };

  const send = useMutation({
    mutationFn: () => {
      if (!user || !machine || !shot || !signature) throw new Error("missing");
      return submitEquipmentHoursPhotoOfflineAware(user.id, {
        equipment: machine.id,
        equipmentLabel: machineLabel(machine),
        kind,
        photo: shot,
        signature,
        capturedAt: photoTakenAt(shot),
        latitude: fix?.latitude,
        longitude: fix?.longitude,
        locationAccuracyM: fix?.accuracy,
      });
    },
    onSuccess: (result) => {
      if (!machine) return;
      setLast({
        status: result.status,
        number: machineNumber(machine),
        kind,
        at:
          result.status === "uploaded"
            ? result.upload.captured_at
            : ((shot && photoTakenAt(shot)) ?? new Date().toISOString()),
      });
      setError("");
      reset();
      void queryClient.invalidateQueries({ queryKey: ["equipment-hours", "machines"] });
    },
    onError: (reason) =>
      setError(reason instanceof ApiError ? reason.message : t("phone.failed")),
  });

  return (
    <div className="space-y-4">
      {!initialProject && (
        <FieldWrapper label={t("phone.project")} required>
          <ProjectPicker
            value={project}
            onValueChange={(value) => {
              setProject(value);
              reset();
              setLast(null);
            }}
            placeholder={t("phone.project")}
            className="h-11 w-full"
          />
        </FieldWrapper>
      )}

      {last && <LastSentNote last={last} />}

      {!machine ? (
        <section className="space-y-3">
          <p className="text-sm leading-5 text-muted-foreground">{t("phone.howTo")}</p>
          <Button
            type="button"
            className="h-16 w-full text-base"
            requires={[[project, t("phone.project")]]}
            onClick={() => {
              setError("");
              setScanning(true);
            }}
          >
            <ScanLine className="size-6" />
            {t("phone.scanBig")}
          </Button>
          {typing ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Input
                  className="h-12 min-w-0 flex-1"
                  value={typed}
                  maxLength={40}
                  aria-label={t("phone.typeNumber")}
                  autoCapitalize="characters"
                  autoComplete="off"
                  enterKeyHint="go"
                  placeholder={t("phone.typeNumberPlaceholder")}
                  onChange={(event) => {
                    setTyped(event.target.value);
                    setError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") takeTyped();
                  }}
                />
                <Button type="button" className="h-12 shrink-0" onClick={takeTyped}>
                  {t("phone.useNumber")}
                </Button>
              </div>
              {typed.trim() && machines.isSuccess && !typedMatch ? (
                <p className="text-xs font-medium text-destructive" aria-live="polite">
                  {t("phone.typedNoMatch")}
                </p>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 py-1 text-sm text-muted-foreground underline underline-offset-4"
              onClick={() => setTyping(true)}
            >
              <Keyboard className="size-4" />
              {t("phone.brokenQr")}
            </button>
          )}
          {machines.isError ? (
            <FieldLoadNote query={machines} what={t("phone.machines")} />
          ) : machines.isSuccess && rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("phone.noMachines")}</p>
          ) : null}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </section>
      ) : (
        <section className="space-y-4">
          {/* One line to check the scan (ID18): number and name, nothing else. */}
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <p className="min-w-0 flex-1 truncate text-base font-semibold">
              {t("phone.machineLine", { number: machineNumber(machine), name: machine.name })}
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              <X />
              {t("phone.another")}
            </Button>
          </div>

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
          {machine.open_since ? (
            <p className="-mt-2 text-xs text-muted-foreground">
              {t("phone.openSince", { start: df.dateTime(machine.open_since) })}
            </p>
          ) : null}

          <FieldWrapper label={t("phone.photo")} required="quiet" hint={t("phone.photoHint")}>
            <FieldCamera
              label={shot ? t("phone.photoReady") : t("phone.takePhoto")}
              file={shot}
              fileCount={shot ? 1 : 0}
              onCapture={setShot}
              onClear={() => setShot(undefined)}
            />
          </FieldWrapper>

          <FieldSignaturePad
            key={round}
            label={t("phone.signature")}
            clearLabel={t("phone.clearSignature")}
            required="quiet"
            hint={t("phone.signatureHint")}
            value={signature}
            onChange={setSignature}
          />

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
              [shot, t("phone.photo")],
              [signature, t("phone.signature")],
            ]}
            disabled={send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {t("phone.send", { kind: t(`kind.${kind}`) })}
          </Button>
        </section>
      )}

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
          pick(found);
        }}
      />
    </div>
  );
}

/** The one line over the scan button after a photo: 「已提交：12 号 收工 19:23」. */
export function LastSentNote({ last }: { last: LastSent }) {
  const t = useTranslations("equipmentHours");
  const df = useDateFormat();
  const values = { number: last.number, kind: t(`kind.${last.kind}`), time: df.time(last.at) };
  return (
    <p
      className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm"
      aria-live="polite"
    >
      {last.status === "queued" ? (
        <CloudOff className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <CheckCircle2 className="size-4 shrink-0 text-primary" />
      )}
      {last.status === "queued" ? t("phone.sentQueued", values) : t("phone.sent", values)}
    </p>
  );
}
