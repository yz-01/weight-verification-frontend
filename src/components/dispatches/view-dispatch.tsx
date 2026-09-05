"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Camera, Clock3, Info, MapPin, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useMemo, useState } from "react";

import { DISPATCH_STATE_TONE } from "@/components/dispatches/dispatches";
import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  FormSection,
  FormSkeleton,
  LoadErrorCard,
} from "@/components/shared/form-shell";
import {
  DetailHeader,
  ReadField,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
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
import type { DispatchPhotoKind } from "@/interfaces/contractor";
import { Label } from "@/components/ui/label";
import { useDateFormat } from "@/lib/dates";
import { useOrderRealtime } from "@/hooks/use-order-realtime";
import { getWasteTracking } from "@/services/waste-outgoing.service";
import { PrintTicketButton } from "@/components/weighing/print-ticket-button";
import {
  addDispatchPhoto,
  cancelDispatch,
  getDispatch,
  releaseDispatch,
} from "@/services/contractor.service";

const DISPATCH_PHOTO_KINDS: DispatchPhotoKind[] = [
  "LOADING",
  "VEHICLE",
  "PLATE",
  "OTHER",
];

/**
 * Attach a photograph to a dispatch that is already raised.
 *
 * The load is photographed at the gate, and the gate is not where the dispatch
 * was created. The endpoint has always taken them; no screen offered it, so a
 * plate shot taken two minutes late had nowhere to go (F-101).
 */
function AddDispatchPhoto({
  dispatchId,
  onAdded,
}: {
  dispatchId: string;
  onAdded: () => void;
}) {
  const t = useTranslations();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<DispatchPhotoKind>("LOADING");

  const upload = useMutation({
    mutationFn: (image: File) =>
      addDispatchPhoto(dispatchId, { image, kind }),
    onSuccess: () => {
      setFile(null);
      onAdded();
    },
  });

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3">
      <Input
        type="file"
        accept="image/*"
        className="h-8 max-w-xs text-xs"
        aria-label={t("dispatches.addPhoto.choose")}
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <select
        className="h-8 rounded-md border bg-background px-2 text-sm"
        aria-label={t("dispatches.addPhoto.kind")}
        value={kind}
        onChange={(event) => setKind(event.target.value as DispatchPhotoKind)}
      >
        {DISPATCH_PHOTO_KINDS.map((option) => (
          <option key={option} value={option}>
            {t(`dispatches.photoKind.${option}`)}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="outline"
        requires={[[file, t("dispatches.addPhoto.choose")]]}
        disabled={upload.isPending}
        onClick={() => file && upload.mutate(file)}
      >
        {t("dispatches.addPhoto.upload")}
      </Button>
    </div>
  );
}

export function ViewDispatch({ id }: { id: string }) {
  const t = useTranslations();
  const df = useDateFormat();
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const [releasing, setReleasing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const realtimeKeys = useMemo(
    () => [
      ["dispatches", "detail", id],
      ["waste-outgoing", "tracking"],
      ["incoming"],
      ["tasks"],
    ],
    [id],
  );
  useOrderRealtime(realtimeKeys);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dispatches", "detail", id],
    queryFn: () => getDispatch(id),
  });
  const tracking = useQuery({
    queryKey: ["waste-outgoing", "tracking", data?.source_record_id],
    queryFn: () => getWasteTracking(data!.source_record_id!),
    enabled: Boolean(data?.source_record_id && user?.portal !== "MSE_SCRAP"),
    refetchInterval: 15_000,
  });

  // The same detail route is shared by the contractor and recycler portals.
  // Keep the back link on the portal's canonical list page instead of sending
  // recycler users to the contractor-only dispatch list.
  const isRecycler = user?.portal === "MSE_SCRAP";
  const backHref = isRecycler ? "/waste-orders" : "/dispatches";
  const backLabel = isRecycler
    ? t("nav.waste_orders")
    : t("dispatches.title");

  const cancellation = useMutation({
    mutationFn: () => cancelDispatch(id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dispatches"] });
      setCancelling(false);
      setReason("");
    },
  });

  if (isLoading) return <FormSkeleton sections={4} />;
  if (isError || !data) {
    return <LoadErrorCard backHref={backHref} backLabel={backLabel} />;
  }

  const coordinates =
    data.latitude && data.longitude ? `${data.latitude}, ${data.longitude}` : null;
  // Some migrated orders predate WasteOutgoingRecord. Their shared dispatch
  // still owns the driver, route, evidence, weighing and settlement, so the
  // contractor must not lose those sections merely because there is no source
  // application to ask for milestones.
  const execution = tracking.data ?? {
    driver_name: data.driver_name,
    vehicle_plate: data.vehicle_plate,
    milestones: [],
    tasks: data.tasks,
    weighing: data.weighing,
    settlement: data.settlement,
  };
  const canCancel =
    !isRecycler &&
    can("dispatch.update") &&
    (data.state === "DRAFT" || data.state === "RELEASED");

  return (
    <div className="space-y-4">
      <DetailHeader
        backHref={backHref}
        backLabel={backLabel}
      />

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <h2 className="tabular text-base font-semibold text-foreground">
            {data.dispatch_no}
          </h2>
          <StatusBadge
            label={t(`dispatches.state.${data.state}`)}
            tone={DISPATCH_STATE_TONE[data.state]}
          />
          <TypeBadge label={t(`dispatches.wasteType.${data.waste_type}`)} />

          <div className="ml-auto flex items-center gap-2">
            {!isRecycler && can("dispatch.update") && data.state === "DRAFT" && (
              <Button
                size="sm"
                className="rounded-full px-4 shadow-sm"
                onClick={() => setReleasing(true)}
              >
                <Truck className="h-4 w-4" />
                {t("dispatches.release.confirm")}
              </Button>
            )}
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full px-4 text-destructive"
                onClick={() => setCancelling(true)}
              >
                <Ban className="h-4 w-4" />
                {t("dispatches.cancel.confirm")}
              </Button>
            )}
          </div>
        </div>

        {!data.is_editable && data.state !== "CANCELLED" && (
          <p className="flex items-start gap-2 border-t bg-muted/40 px-6 py-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("dispatches.lockedNote")}
          </p>
        )}

        <div className="divide-y border-t">
          {data.source_record && (
            <FormSection title={t("dispatches.section.application")}>
              <ReadField label={t("dispatches.field.applicationNo")} value={data.source_record.reference_no} />
              <ReadField label={t("dispatches.field.applicant")} value={data.source_record.submitted_by_name} />
              <ReadField label={t("dispatches.field.approvedBy")} value={data.source_record.reviewed_by_name} />
              <ReadField label={t("dispatches.field.approvedAt")} value={data.source_record.reviewed_at ? df.dateTime(data.source_record.reviewed_at) : null} />
              <ReadField label={t("dispatches.field.applicationNote")} value={data.source_record.note} className="md:col-span-2" />
              <ReadField label={t("dispatches.field.approvalNote")} value={data.source_record.review_note} className="md:col-span-2" />
              {data.source_record.photos.length > 0 && (
                <div className="md:col-span-2">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">{t("dispatches.section.applicationPhotos")}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {data.source_record.photos.map((photo) => (
                      <a key={photo.id} href={photo.watermarked || photo.image} target="_blank" rel="noreferrer" className="overflow-hidden rounded-md border bg-muted/20">
                        <Image src={photo.watermarked || photo.image} alt={photo.caption || data.source_record!.reference_no} width={360} height={270} unoptimized className="aspect-[4/3] w-full object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </FormSection>
          )}
          {/*
            The dispatch's own photographs, which had nowhere to be seen and no
            way to be added: only the application's photos and the driver's
            were on this page (F-101).
          */}
          <FormSection title={t("dispatches.section.photos")}>
            <div className="md:col-span-2">
              {data.photos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("dispatches.noPhotos")}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {data.photos.map((photo) => (
                    <a
                      key={photo.id}
                      href={photo.watermarked || photo.image}
                      target="_blank"
                      rel="noreferrer"
                      className="overflow-hidden rounded-md border bg-muted/20"
                    >
                      <Image
                        src={photo.watermarked || photo.image}
                        alt={t(`dispatches.photoKind.${photo.kind}`)}
                        width={360}
                        height={270}
                        unoptimized
                        className="aspect-[4/3] w-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
              {can("dispatch.create") && (
                <AddDispatchPhoto
                  dispatchId={data.id}
                  onAdded={() =>
                    void queryClient.invalidateQueries({
                      queryKey: ["dispatch", data.id],
                    })
                  }
                />
              )}
            </div>
          </FormSection>

          <FormSection title={t("dispatches.section.destination")}>
            <ReadField
              label={t("dispatches.field.project")}
              value={`${data.project_code} — ${data.project_name}`}
            />
            <ReadField
              label={t("dispatches.field.recycler")}
              value={data.recycler_name}
            />
          </FormSection>

          <FormSection title={t("dispatches.section.load")}>
            <ReadField
              label={t("dispatches.field.wasteType")}
              value={t(`dispatches.wasteType.${data.waste_type}`)}
            />
            <ReadField
              label={t("dispatches.field.estimatedWeight")}
              value={data.estimated_weight_kg}
            />
            <ReadField
              label={t("dispatches.field.description")}
              value={data.description}
              className="md:col-span-2"
            />
          </FormSection>

          <FormSection title={t("dispatches.section.vehicle")}>
            <ReadField
              label={t("dispatches.field.vehiclePlate")}
              value={data.vehicle_plate}
            />
            <ReadField
              label={t("dispatches.field.driverName")}
              value={data.driver_name}
            />
            <ReadField
              label={t("dispatches.field.driverPhone")}
              value={data.driver_phone}
            />
            <ReadField
              label={t("dispatches.field.driverIc")}
              value={data.driver_ic}
            />
          </FormSection>

          <FormSection title={t("dispatches.section.release")}>
            <ReadField
              label={t("dispatches.field.releasedAt")}
              value={
                data.released_at
                  ? df.dateTime(data.released_at)
                  : null
              }
            />
            <ReadField
              label={t("dispatches.field.releasedBy")}
              value={data.released_by_name}
            />
            <ReadField
              label={t("dispatches.field.location")}
              value={
                coordinates ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-success" />
                    <span className="tabular">{coordinates}</span>
                  </span>
                ) : null
              }
              className="md:col-span-2"
            />
          </FormSection>
          {(data.source_record_id || data.tasks.length > 0) && (
            <FormSection title={t("dispatches.section.execution")}>
              {tracking.isLoading && user?.portal !== "MSE_SCRAP" ? (
                <p className="md:col-span-2 text-sm text-muted-foreground">{t("common.loading")}</p>
              ) : execution ? (
                <>
                  <ReadField label={t("dispatches.field.collectionPlan")} value={data.confirmed_collection_at ? df.dateTime(data.confirmed_collection_at) : data.proposed_collection_at ? df.dateTime(data.proposed_collection_at) : null} />
                  <ReadField label={t("dispatches.field.driverName")} value={execution.driver_name} />
                  <ReadField label={t("dispatches.field.vehiclePlate")} value={execution.vehicle_plate} />
                  {execution.milestones.length > 0 && <ReadField label={t("dispatches.field.executionProgress")} value={`${execution.milestones.filter((row) => row.done).length}/${execution.milestones.length}`} />}
                  {(execution.tasks ?? []).map((task) =>
                    task.latest_position ? (
                      <ReadField
                        key={`${task.id}-position`}
                        label={t("dispatches.field.location")}
                        value={
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${task.latest_position.latitude},${task.latest_position.longitude}`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-primary hover:underline"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            <span className="tabular">
                              {task.latest_position.latitude}, {task.latest_position.longitude}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {df.dateTime(task.latest_position.occurred_at)}
                            </span>
                          </a>
                        }
                        className="md:col-span-2"
                      />
                    ) : null,
                  )}
                  {(execution.tasks ?? []).some((task) => task.photos.length > 0) && (
                    <div className="md:col-span-2">
                      <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><Camera className="size-4" />{t("dispatches.section.executionPhotos")}</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {(execution.tasks ?? []).flatMap((task) => task.photos).map((photo) => (
                          <a key={photo.id} href={photo.watermarked || photo.image} target="_blank" rel="noreferrer" className="overflow-hidden rounded-md border bg-muted/20">
                            <Image src={photo.watermarked || photo.image} alt={photo.caption || photo.kind} width={360} height={270} unoptimized className="aspect-[4/3] w-full object-cover" />
                            <p className="truncate px-2 py-1 text-xs">{photo.caption || photo.kind}</p>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </FormSection>
          )}
          {execution?.weighing && (
            <FormSection title={t("dispatches.section.weighing")}>
              <ReadField label={t("dispatches.field.weighingNo")} value={execution.weighing.session_no} />
              <ReadField label={t("dispatches.field.firstWeight")} value={execution.weighing.first_weight_kg ? `${execution.weighing.first_weight_kg} kg` : null} />
              <ReadField label={t("dispatches.field.secondWeight")} value={execution.weighing.second_weight_kg ? `${execution.weighing.second_weight_kg} kg` : null} />
              <ReadField label={t("dispatches.field.netWeight")} value={execution.weighing.net_weight_kg ? `${execution.weighing.net_weight_kg} kg` : null} />
              <div className="md:col-span-2"><PrintTicketButton sessionId={execution.weighing.session_id} sessionNo={execution.weighing.session_no} /></div>
            </FormSection>
          )}
          {execution?.settlement && (
            <FormSection title={t("dispatches.section.settlement")}>
              <ReadField label={t("dispatches.field.settlementNo")} value={execution.settlement.settlement_no ?? null} />
              <ReadField label={t("dispatches.field.settlementState")} value={execution.settlement.state ?? null} />
              <ReadField label={t("settlements.field.deductionWeight")} value={execution.settlement.deduction_weight_kg ? `${execution.settlement.deduction_weight_kg} kg` : "0 kg"} />
              <ReadField label={t("dispatches.field.settledWeight")} value={execution.settlement.settled_weight_kg ? `${execution.settlement.settled_weight_kg} kg` : null} />
              <ReadField label={t("dispatches.field.settlementAmount")} value={execution.settlement.total_amount ? `${execution.settlement.currency} ${execution.settlement.total_amount}` : null} />
              <ReadField label={t("settlements.field.amountPaid")} value={`${execution.settlement.currency} ${execution.settlement.amount_paid}`} />
              <ReadField label={t("settlements.field.outstanding")} value={execution.settlement.outstanding === null ? null : `${execution.settlement.currency} ${execution.settlement.outstanding}`} />
              {execution.settlement.deductions.length > 0 && (
                <div className="md:col-span-2 divide-y border-y">
                  {execution.settlement.deductions.map((deduction) => (
                    <div key={deduction.id} className="py-2 text-sm">
                      <p className="font-medium">{deduction.kind} · {t("companies.weightKg", { value: deduction.weight_kg })} · {deduction.state}</p>
                      <p className="mt-0.5 text-muted-foreground">{deduction.reason}</p>
                    </div>
                  ))}
                </div>
              )}
              {execution.settlement.payments.length > 0 && (
                <div className="md:col-span-2 divide-y border-y">
                  {execution.settlement.payments.map((payment) => (
                    <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span>{payment.method}{payment.reference ? ` · ${payment.reference}` : ""}</span>
                      <span className="font-medium tabular-nums">{execution.settlement!.currency} {payment.amount} · {df.date(payment.paid_on)}</span>
                    </div>
                  ))}
                </div>
              )}
            </FormSection>
          )}
          {data.events.length > 0 && (
            <section className="px-4 py-5 sm:px-6">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Clock3 className="h-4 w-4 text-primary" />
                {t("dispatches.section.timeline")}
              </h3>
              <ol>
                {data.events.map((event, index) => (
                  <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {index < data.events.length - 1 && (
                      <span className="absolute left-[7px] top-4 h-full w-px bg-border" />
                    )}
                    <span className="relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-primary bg-background" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {t.has(`dispatches.event.${event.event_type}`)
                          ? t(`dispatches.event.${event.event_type}`)
                          : event.event_label}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {df.dateTime(event.occurred_at)}
                        {event.actor_name ? ` · ${event.actor_name}` : ""}
                        {event.actor_company_name
                          ? ` · ${event.actor_company_name}`
                          : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>

      {!isRecycler && releasing && (
        <ReleaseDialog id={id} onClose={() => setReleasing(false)} />
      )}

      {!isRecycler && cancelling && (
        <ConfirmDialog
          open
          onOpenChange={() => {
            setCancelling(false);
            setReason("");
          }}
          title={t("dispatches.cancel.title")}
          description={t("dispatches.cancel.description")}
          confirmLabel={t("dispatches.cancel.confirm")}
          confirmIcon={Ban}
          isPending={cancellation.isPending}
          reason={reason}
          onReasonChange={setReason}
          reasonRequired
          onConfirm={() => cancellation.mutate()}
        />
      )}
    </div>
  );
}

/**
 * Release the load.
 *
 * Collects only who let it out. The time is the server's — a release time is
 * the start of a journey the weighbridge will be compared against, so it
 * cannot be something the sender picks.
 */
function ReleaseDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const release = useMutation({
    mutationFn: () => releaseDispatch(id, { released_by_name: name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dispatches"] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[440px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{t("dispatches.release.title")}</DialogTitle>
          <DialogDescription>
            {t("dispatches.release.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">
            {t("dispatches.release.byName")}
            <span className="ml-0.5 text-destructive">*</span>
          </Label>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            className="rounded-full px-4 shadow-sm"
            requires={[[name, t("dispatches.release.byName")]]}
            disabled={release.isPending}
            onClick={() => release.mutate()}
          >
            <Truck className="h-4 w-4" />
            {t("dispatches.release.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
