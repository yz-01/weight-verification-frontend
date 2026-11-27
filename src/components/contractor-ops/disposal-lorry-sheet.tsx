"use client";

/**
 * Each lorry's plate and two signatures before the gate (JB290, 客户 11-27d):
 *
 *   「请完善手机端垃圾清运流程，在门岗拍照上传之前，必须完成以下资料：填写车辆车牌号码。
 *   清运司机签名。工地现场负责人签名。以上资料全部必填，完成后才进入门岗拍照、上传及
 *   正式放行环节。车牌号码、双方签名及门岗照片必须关联同一条垃圾清运记录，并同步至后台
 *   预览、打印及归档资料，形成完整的清运证据闭环。」
 *
 * The site phone fills the job's next lorry - the first one not yet released -
 * on the 垃圾清运 record (【填写车牌和签名】): the plate, the driver's name and
 * drawn signature, the site person-in-charge's name and drawn signature. The
 * server holds the order: the gate cannot photograph, upload or release that
 * lorry before it (`disposal_lorry_sheet_missing`). The record window shows
 * each lorry's sheet and the 门岗事项 that let it out.
 */

import { useMutation } from "@tanstack/react-query";
import { Loader2, PenLine, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { FieldSignaturePad } from "@/components/field-staff/field-signature-pad";
import { useAuth } from "@/components/providers/auth-provider";
import { PhotoLink } from "@/components/shared/photo-link";
import { FieldWrapper } from "@/components/shared/page-primitives";
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
import { ApiError } from "@/interfaces/api";
import type { DisposalLorrySheet, DisposalRequest, DisposalTrip } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import { normalisePlate } from "@/lib/disposal-supplier";
import { signDisposalLorry } from "@/services/contractor-ops.service";

/** Approved and not yet finished: the only time a lorry is filled (the server's rule too). */
const RUNNING = ["APPROVED", "ASSIGNED", "IN_PROGRESS", "RETURNED"];

/**
 * The lorry the site fills and the gate releases now: the first one still
 * planned that the gate has not released (`disposal_lorries.next_lorry`).
 * `null` when every lorry has left.
 */
export function nextLorry(row: Pick<DisposalRequest, "trips">): DisposalTrip | null {
  const trips = [...(row.trips ?? [])].sort((a, b) => a.seq - b.seq);
  return trips.find((trip) => trip.status === "PLANNED" && !trip.release) ?? null;
}

/**
 * Whether this reader is offered 【填写车牌和签名】, and in which state:
 * `"open"`; `"locked"` when every lorry has left (the office adds one first);
 * `null` when the job is not running or the reader may not take the site's
 * photographs (`disposal.submit`, the same people as 【拍车辆出场 / Gate Pass】).
 */
export function lorrySheetStep(
  row: Pick<DisposalRequest, "status" | "trips" | "trips_closed_at">,
  may: { submit: boolean },
): "open" | "locked" | null {
  if (!may.submit || !RUNNING.includes(row.status) || row.trips_closed_at) return null;
  // A job approved before C5 has no lorries yet; the server plans them on the first fill.
  if (!(row.trips ?? []).length) return "open";
  return nextLorry(row) ? "open" : "locked";
}

/** The five items, as the server requires them; what is still missing, in the form's order. */
export function lorrySheetMissing(draft: {
  plate: string;
  driverName: string;
  driverSignature?: File;
  siteName: string;
  siteSignature?: File;
}): Array<"plate" | "driverName" | "driverSignature" | "siteName" | "siteSignature"> {
  const missing: Array<"plate" | "driverName" | "driverSignature" | "siteName" | "siteSignature"> = [];
  if (!normalisePlate(draft.plate)) missing.push("plate");
  if (!draft.driverName.trim()) missing.push("driverName");
  if (!draft.driverSignature) missing.push("driverSignature");
  if (!draft.siteName.trim()) missing.push("siteName");
  if (!draft.siteSignature) missing.push("siteSignature");
  return missing;
}

function fieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError ? error.fieldError(field) : undefined;
}

/**
 * 【填写车牌和签名】: the next lorry's sheet. The site person-in-charge is the
 * account on this phone - its name is filled in, and changed when somebody
 * else on site signs on it. All five are required; the button says what is
 * still missing.
 */
export function LorrySignDialog({
  row,
  onClose,
  onSaved,
}: {
  row: DisposalRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("jb290");
  const field = useTranslations("fieldStaffPwa");
  const common = useTranslations("siteDisposal");
  const { user } = useAuth();
  const lorry = nextLorry(row);
  const seq = lorry?.seq ?? 1;
  const [plate, setPlate] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverSignature, setDriverSignature] = useState<File | undefined>();
  const [siteName, setSiteName] = useState(user?.full_name ?? "");
  const [siteSignature, setSiteSignature] = useState<File | undefined>();
  // One id per fill, kept across a retry (a resend is the same fill).
  const eventId = useRef(`lorry-${crypto.randomUUID()}`);
  const save = useMutation({
    mutationFn: () =>
      signDisposalLorry(row.id, {
        vehicle_plate: normalisePlate(plate),
        driver_name: driverName.trim(),
        driver_signature: driverSignature as File,
        site_signer_name: siteName.trim(),
        site_signature: siteSignature as File,
        client_event_id: eventId.current,
      }),
    onSuccess: onSaved,
  });
  const missing = new Set(lorrySheetMissing({ plate, driverName, driverSignature, siteName, siteSignature }));
  const label = {
    plate: t("plate"),
    driverName: t("driverName"),
    driverSignature: t("driverSignature"),
    siteName: t("siteName"),
    siteSignature: t("siteSignature"),
  } as const;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] min-w-0 flex-col overflow-hidden sm:max-w-lg" data-lorry-sheet-dialog>
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("dialogTitle", { seq })}</DialogTitle>
          <DialogDescription>{t("dialogHelp", { reference: row.reference_no })}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto pr-1">
          {lorry?.sheet ? (
            <p className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm" data-lorry-sheet-refill>
              {t("refillNote", { plate: lorry.sheet.vehicle_plate })}
            </p>
          ) : null}
          <FieldWrapper label={label.plate} required error={fieldError(save.error, "vehicle_plate")}>
            <Input
              value={plate}
              autoCapitalize="characters"
              onChange={(event) => setPlate(event.target.value)}
              onBlur={() => setPlate((value) => normalisePlate(value))}
            />
          </FieldWrapper>
          <FieldWrapper label={label.driverName} required error={fieldError(save.error, "driver_name")}>
            <Input value={driverName} onChange={(event) => setDriverName(event.target.value)} />
          </FieldWrapper>
          <FieldSignaturePad
            label={label.driverSignature}
            clearLabel={field("action.clearSignature")}
            required
            hint={t("driverHint")}
            value={driverSignature}
            onChange={setDriverSignature}
          />
          <FieldWrapper label={label.siteName} required hint={t("siteHint")} error={fieldError(save.error, "site_signer_name")}>
            <Input value={siteName} onChange={(event) => setSiteName(event.target.value)} />
          </FieldWrapper>
          <FieldSignaturePad
            label={label.siteSignature}
            clearLabel={field("action.clearSignature")}
            required
            value={siteSignature}
            onChange={setSiteSignature}
          />
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose}>
            {common("action.cancel")}
          </Button>
          <Button
            data-lorry-sheet-submit
            requires={(Object.keys(label) as Array<keyof typeof label>).map((key) => [!missing.has(key), label[key]] as const)}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The record's button: 【填写车牌和签名】, or locked saying why. */
export function LorrySignButton({
  step,
  onOpen,
}: {
  step: "open" | "locked" | null;
  onOpen: () => void;
}) {
  const t = useTranslations("jb290");
  if (step === "open") {
    return (
      <Button size="sm" data-lorry-sheet-open onClick={onOpen}>
        <PenLine />
        {t("action")}
      </Button>
    );
  }
  if (step === "locked") {
    return (
      <Button size="sm" variant="outline" data-lorry-sheet-locked disabled disabledReason={t("lockedNoLorry")} showReason>
        <PenLine />
        {t("action")}
      </Button>
    );
  }
  return null;
}

function SignatureThumb({ url, label }: { url: string | null; label: string }) {
  if (!url) return null;
  return (
    <PhotoLink href={url} image label={label} title={label}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a stored signature, not a static asset */}
      <img loading="lazy" decoding="async" src={url} alt={label} className="h-12 w-24 rounded border bg-paper object-contain" />
    </PhotoLink>
  );
}

/**
 * One lorry's sheet and release on the record window (per lorry): 车牌, 清运司机
 * and 工地现场负责人 with their signatures, who filled it and when, and the
 * 门岗事项 that let it out. The next lorry still waiting says so.
 */
export function LorrySignLines({
  trip,
  waiting,
}: {
  trip: Pick<DisposalTrip, "sheet" | "release" | "vehicle_plate">;
  /** This is the lorry the gate releases next. */
  waiting: boolean;
}) {
  const t = useTranslations("jb290");
  const df = useDateFormat();
  const sheet: DisposalLorrySheet | null | undefined = trip.sheet;
  const release = trip.release;
  if (!sheet && !release) {
    return waiting ? (
      <p className="mt-1 text-xs font-medium text-warning" data-lorry-sheet-waiting>
        {t("tripWaiting")}
      </p>
    ) : null;
  }
  return (
    <div className="mt-2 space-y-1.5 rounded-md bg-muted/30 p-2 text-xs" data-lorry-sheet-lines>
      {sheet ? (
        <>
          <p className="font-medium text-foreground">{t("tripPlate", { plate: trip.vehicle_plate || sheet.vehicle_plate })}</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <p>{t("tripDriver", { name: sheet.driver_name })}</p>
              <SignatureThumb url={sheet.driver_signature} label={t("driverSignature")} />
            </div>
            <div className="space-y-1">
              <p>{t("tripSite", { name: sheet.site_signer_name })}</p>
              <SignatureThumb url={sheet.site_signature} label={t("siteSignature")} />
            </div>
          </div>
          <p className="text-muted-foreground">
            {t("tripFilled", { name: sheet.filled_by_name, at: sheet.signed_at ? df.dateTime(sheet.signed_at) : "" })}
          </p>
        </>
      ) : null}
      {release ? (
        <p className="text-muted-foreground" data-lorry-released={release.incident_no}>
          {t("tripReleased", {
            number: release.incident_no,
            name: release.by,
            at: release.at ? df.dateTime(release.at) : "",
            count: release.photo_count,
          })}
        </p>
      ) : null}
    </div>
  );
}
