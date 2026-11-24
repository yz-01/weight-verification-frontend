"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudOff, Keyboard, Loader2, Play, ScanLine, Send, Square, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldStaffRecords, OperatorTodayRecords } from "@/components/equipment-hours/equipment-phone-records";
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
import type { EquipmentHoursMachine, EquipmentPhoneRecord, EquipmentPhotoKind } from "@/interfaces/equipment-hours";
import { useDateFormat } from "@/lib/dates";
import { asFix, type LocationFix } from "@/lib/field-location";
import { getOfflineJobs } from "@/lib/offline-db";
import { photoTakenAt } from "@/lib/photo-meta";
import { isSystemMachineQr, matchScanned, squashCode } from "@/lib/machine-scan";
import { cn } from "@/lib/utils";
import { getDriverMachines, getDriverMyRecords } from "@/services/driver-clock.service";
import { getOperatorToday, loadEquipmentHoursMachines } from "@/services/equipment-hours.service";
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

/**
 * 「你可以打卡的设备：12 号 · 挖土机、15 号 · 吊车」 (JB227): the machines bound to
 * this driver phone, the first three by name, then how many in all.
 */
export function boundMachinesLine(
  rows: readonly { name: string; code?: string; site_no?: string }[],
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const names = rows
    .slice(0, 3)
    .map((row) => t("phone.machineLine", { number: machineNumber(row), name: row.name }))
    .join(t("phone.boundJoin"));
  return rows.length > 3
    ? t("phone.boundMore", { machines: names, count: rows.length })
    : t("phone.boundLine", { machines: names });
}

/**
 * Which sentence a scan that names none of this phone's machines gets (JB227
 * audit F7). A driver phone holds only its bound machines, so the system's
 * own code of another machine is 「不在你可以打卡的设备里」 (`notYourMachine`),
 * while another company's sticker or a bad read is 「认不出是哪台设备」
 * (`qrUnknown`) - two different things to do. Any other phone: `qrNoMatch`.
 */
export function scanMissKind(text: string, bound: boolean): "qrNoMatch" | "notYourMachine" | "qrUnknown" {
  if (!bound) return "qrNoMatch";
  return isSystemMachineQr(text) ? "notYourMachine" : "qrUnknown";
}

/** The number the phone shows to check a scan: the 设备编号, else the code. */
export function machineNumber(machine: { code?: string; site_no?: string }): string {
  return machine.site_no || machine.code || "";
}

/**
 * JB227 audit F1: the machines this driver started (his own running record)
 * that his phone no longer lists - the office has unbound him while they ran,
 * so he cannot take their 收工 and the office enters the end time. One per
 * machine.
 */
export function strandedRecords(
  records: readonly EquipmentPhoneRecord[],
  machines: readonly { code?: string; site_no?: string }[],
): EquipmentPhoneRecord[] {
  const listed = new Set(machines.map(machineNumber));
  const seen = new Set<string>();
  return records.filter((row) => {
    const number = row.site_no || row.equipment_code;
    if (row.end_at || listed.has(number) || seen.has(number)) return false;
    seen.add(number);
    return true;
  });
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

/**
 * 开工 when the machine is not running, 收工 when it is. A 开工 left open
 * from an earlier day (a forgotten 收工) is not running: the server leaves
 * ``open_since`` empty and says ``unclosed_since`` instead, so a new day
 * starts with 开工, never with a 收工 that would bill the whole night.
 */
export function nextKind(machine: Pick<EquipmentHoursMachine, "open_since"> | undefined): EquipmentPhotoKind {
  return machine?.open_since ? "FINISH" : "START";
}

/** How long a 开工 from an earlier day still counts as running (a night
 * shift across midnight); the server's ``OPEN_START_ACROSS_DAYS``. */
export const OPEN_START_ACROSS_DAYS_MS = 16 * 60 * 60 * 1000;

const siteDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date(iso));

/** Whether a still-open 开工 at ``startedAt`` is a forgotten one by ``now``:
 * from an earlier day on the site's clock and older than 16 hours. */
export function isForgottenStart(startedAt: string, now: Date = new Date()): boolean {
  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) return false;
  return (
    siteDay(startedAt) < siteDay(now.toISOString()) &&
    now.getTime() - started.getTime() > OPEN_START_ACROSS_DAYS_MS
  );
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
  now: Date = new Date(),
): EquipmentPhotoKind {
  const newest = waiting
    .filter((photo) => photo.equipment === machine.id && photo.kind)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    .at(-1);
  if (newest) {
    if (newest.kind !== "START") return "START";
    return isForgottenStart(newest.capturedAt, now) ? "START" : "FINISH";
  }
  return nextKind(machine);
}

/** The offline queue's owner for a driver's link (J26): one queue per link. */
export function driverQueueOwner(token: string): string {
  return `driver-link:${token}`;
}

/** A driver's link's machines, in the phone list's shape (J26). */
async function loadDriverMachines(token: string, device: string): Promise<EquipmentHoursMachine[]> {
  const rows = await getDriverMachines(token, device);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    site_no: row.site_no,
    plate: row.plate,
    supplier_name: row.supplier_name,
    project: "",
    project_name: "",
    status: "",
    open_since: row.open_since,
    unclosed_since: row.unclosed_since,
  }));
}

/**
 * The photos still waiting on this phone. One the server refused is not
 * waiting - it goes nowhere until the worker retries it - so it no longer
 * decides 开工 or 收工 (JB204-2, Lucas 11-16 audit): a 开工 refused would
 * otherwise have the next scan offer 收工.
 */
export async function waitingPhotos(ownerId: string): Promise<WaitingPhoto[]> {
  try {
    const jobs = await getOfflineJobs(ownerId);
    return jobs.flatMap((job) =>
      job.kind === "EQUIPMENT_HOURS_PHOTO" && !job.needsAttention
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
  driver,
  operator = false,
}: {
  initialProject?: string;
  /**
   * 设备操作 on the operator's own phone (JB104): the account's machines and
   * queue, checked on the server as a driver's link is - so a location is
   * required - and under it the operator's own 「当天工时」, not the
   * project's records.
   */
  operator?: boolean;
  /**
   * A driver's own clock-in link (J26): no account and no project to pick -
   * the link's machines, the link's endpoint, its own offline queue, and a
   * GPS fix inside the site's fence required (item 125-4).
   */
  driver?: { token: string; device: string };
}) {
  const t = useTranslations("equipmentHours");
  const df = useDateFormat();
  const { user } = useAuth();
  // Whose queue a photo waits in: the account's, or the link's.
  const ownerId = driver ? driverQueueOwner(driver.token) : user?.id;
  const queryClient = useQueryClient();
  const [project, setProject] = useState(driver ? "driver-link" : initialProject);
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
    queryKey: ["equipment-hours", "machines", project, driver?.token ?? ""],
    queryFn: () => (driver ? loadDriverMachines(driver.token, driver.device) : loadEquipmentHoursMachines(project)),
    enabled: Boolean(project),
    staleTime: 60_000,
  });
  const rows = machines.data ?? [];
  // JB227 (客户 11-19 事项 7): a driver phone - the operator's 设备操作 or a
  // driver's link - is offered only the machines bound to it; with none it
  // cannot clock, and says whom to ask.
  const bound = Boolean(driver || operator);
  const notBound = bound && machines.isSuccess && rows.length === 0;
  // Audit F1: a machine he started that the office has since unbound him
  // from is not on his list, so a scan never reaches the server's refusal -
  // the page says it from his own running record (the same records the page
  // lists, one cache).
  // query-failure: an extra line; on a failed read the records list shows its own note and a 收工 still gets the server's refusal
  const own = useQuery({
    queryKey: driver
      ? ["equipment-hours", "driver-records", driver.token]
      : ["equipment-hours", "phone-records", "operator-today"],
    queryFn: (): Promise<{ rows: EquipmentPhoneRecord[] }> =>
      driver ? getDriverMyRecords(driver.token, driver.device) : getOperatorToday(),
    enabled: bound && machines.isSuccess,
  });
  const stranded = bound && machines.isSuccess ? strandedRecords(own.data?.rows ?? [], rows) : [];

  const pick = (found: EquipmentHoursMachine) => {
    setMachine(found);
    setKind(nextKind(found));
    setShot(undefined);
    setSignature(undefined);
    setRound((value) => value + 1);
    setError("");
    setTyping(false);
    setTyped("");
    if (ownerId) {
      void waitingPhotos(ownerId).then((waiting) => setKind(kindToTake(found, waiting)));
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

  /**
   * A scan or a number that names none of this phone's machines (audit F7).
   * A driver phone's list may be older than a binding the office has just
   * made (no signal at the time), so it reads its machines again once
   * before saying so.
   */
  const missed = (find: (list: EquipmentHoursMachine[]) => EquipmentHoursMachine | null, say: () => string) => {
    if (!bound) {
      setError(say());
      return;
    }
    void machines.refetch().then((result) => {
      const again = find(result.data ?? []);
      if (again) pick(again);
      else setError(say());
    });
  };

  const typedMatch = typed.trim() ? matchTypedMachine(typed, rows) : null;
  const takeTyped = () => {
    if (typedMatch) pick(typedMatch);
    else
      missed(
        (list) => matchTypedMachine(typed, list),
        () => t(bound ? "phone.notYourMachine" : "phone.typedNoMatch"),
      );
  };
  const sayScanMiss = (text: string) => {
    const kind = scanMissKind(text, bound);
    if (kind === "notYourMachine") return t("phone.notYourMachine");
    if (kind === "qrUnknown") return t("phone.qrUnknown", { text: text.slice(0, 60) });
    return t("phone.qrNoMatch", { text: text.slice(0, 60) });
  };

  const send = useMutation({
    mutationFn: () => {
      if (!ownerId || !machine || !shot || !signature) throw new Error("missing");
      return submitEquipmentHoursPhotoOfflineAware(ownerId, {
        equipment: machine.id,
        equipmentLabel: machineLabel(machine),
        kind,
        photo: shot,
        signature,
        capturedAt: photoTakenAt(shot),
        latitude: fix?.latitude,
        longitude: fix?.longitude,
        locationAccuracyM: fix?.accuracy,
        ...(driver ? { driverLink: driver } : {}),
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
      void queryClient.invalidateQueries({ queryKey: ["equipment-hours", "phone-records"] });
      void queryClient.invalidateQueries({ queryKey: ["equipment-hours", "driver-records"] });
    },
    onError: (reason) => {
      setError(reason instanceof ApiError ? reason.message : t("phone.failed"));
      // Refused as not (or no longer) bound: read this phone's machines again,
      // so the list shows what the office has bound now (audit F7).
      if (
        reason instanceof ApiError &&
        (reason.code === "equipment_hours_not_bound" || reason.code === "equipment_hours_no_longer_bound")
      ) {
        void queryClient.invalidateQueries({ queryKey: ["equipment-hours", "machines"] });
      }
      // JB246: the office stopped (or sent again) this driver's link while
      // the page was open - read the link again, so the page ends at once.
      if (
        driver &&
        reason instanceof ApiError &&
        (reason.code === "driver_link_closed" || reason.code === "driver_link_invalid")
      ) {
        void queryClient.invalidateQueries({ queryKey: ["driver-clock-link", driver.token] });
      }
    },
  });

  return (
    <div className="space-y-4">
      {!initialProject && !driver && (
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

      {!machine && stranded.length > 0 ? (
        <p
          role="status"
          data-testid="hours-no-longer-bound"
          className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-3 text-base font-medium leading-6"
        >
          {t("phone.noLongerBound", {
            machines: stranded
              .map((row) =>
                t("phone.machineLine", { number: row.site_no || row.equipment_code, name: row.equipment_name }),
              )
              .join(t("phone.boundJoin")),
          })}
        </p>
      ) : null}

      {!machine && notBound ? (
        <p
          role="status"
          data-testid="hours-not-bound"
          className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-3 text-base font-medium leading-6"
        >
          {t("phone.notBound")}
        </p>
      ) : !machine ? (
        <section className="space-y-3">
          <p className="text-sm leading-5 text-muted-foreground">{t("phone.howTo")}</p>
          {bound && rows.length > 0 ? (
            <p data-testid="hours-bound-machines" className="text-sm font-medium">
              {boundMachinesLine(rows, t)}
            </p>
          ) : null}
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
                  {t(bound ? "phone.notYourMachine" : "phone.typedNoMatch")}
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
          ) : machine.unclosed_since ? (
            <p role="status" className="-mt-2 text-xs font-medium text-warning">
              {t("phone.unclosedYesterday")}
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
            readyLabel={t("phone.locationReady")}
            required={Boolean(driver || operator)}
            value={fix}
            onChange={(next) => setFix(asFix(next))}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            className="h-12 w-full text-sm"
            requires={[
              [shot, t("phone.photo")],
              [signature, t("phone.signature")],
              // On a driver's link the server judges the fence (item 125-4),
              // and on the operator's phone too (JB104).
              ...(driver || operator ? ([[fix, t("phone.location")]] as [unknown, string][]) : []),
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
            missed((list) => matchScannedMachine(text, list), () => sayScanMiss(text));
            return;
          }
          pick(found);
        }}
      />

      {/* J37-2: the project's recent records with 正常 / 超时 / 总工时. */}
      {operator ? (
        !machine ? <OperatorTodayRecords /> : null
      ) : !driver && !machine && project ? (
        <FieldStaffRecords project={project} />
      ) : null}
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
