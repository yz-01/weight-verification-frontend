"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Camera, Clock3, Info, MapPin, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

import { DISPATCH_STATE_TONE } from "@/components/dispatches/dispatches";
import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  FormSkeleton,
  LoadErrorCard,
} from "@/components/shared/form-shell";
import {
  FieldWrapper,
  QueryFailedNote,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import {
  RecordDetailFrame,
  RecordDetailShell,
  ShellPanel,
  type ShellFact,
} from "@/components/shared/record-detail-shell";
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
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
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
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
      <FieldWrapper label={t("dispatches.addPhoto.choose")} required>
        <Input
          type="file"
          accept="image/*"
          className="h-8 max-w-xs text-xs"
          aria-label={t("dispatches.addPhoto.choose")}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </FieldWrapper>
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

/**
 * Label and value pairs inside one of the dispatch's own panels, drawn like
 * the shell's information grid so every panel of the popup reads the same.
 */
function PanelFacts({ facts }: { facts: ShellFact[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {facts.map((fact) => (
        <div key={fact.label} className={cn("min-w-0", fact.wide && "sm:col-span-2")}>
          <dt className="text-xs text-muted-foreground">{fact.label}</dt>
          <dd className="mt-1 break-words text-sm font-medium leading-snug">
            {fact.value || "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One dispatch, in the record-detail frame every module shares (E8, Q31).
 *
 * From inside the app `/dispatches/<id>` opens as the popup over the list;
 * typed, bookmarked or opened from a notification it is the same frame on a
 * page of its own (`presentation="page"`). A dispatch is raised in the
 * office, not submitted from a phone, so it has no 记录人 block.
 */
export function ViewDispatch({
  id,
  presentation = "page",
  onClose,
}: {
  id: string;
  presentation?: "page" | "dialog";
  /** The dialog's close; going back by default (an intercepted address). */
  onClose?: () => void;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const [releasing, setReleasing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const { data, isLoading, isLoadingError } = useQuery({
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
  const backHref = isRecycler ? "/waste-orders" : "/waste-clearance?kind=dispatch";
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

  const frame = { presentation, onClose, backHref, backLabel };
  if (isLoading) {
    return (
      <RecordDetailFrame {...frame} title={backLabel}>
        <FormSkeleton sections={4} />
      </RecordDetailFrame>
    );
  }
  if (isLoadingError || !data) {
    return (
      <RecordDetailFrame {...frame} title={backLabel}>
        <LoadErrorCard backHref={backHref} backLabel={backLabel} />
      </RecordDetailFrame>
    );
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
  const canRelease =
    !isRecycler && can("dispatch.update") && data.state === "DRAFT";
  const canCancel =
    !isRecycler &&
    can("dispatch.update") &&
    (data.state === "DRAFT" || data.state === "RELEASED");

  return (
    <RecordDetailFrame
      {...frame}
      title={data.dispatch_no}
      status={
        <>
          <StatusBadge
            label={t(`dispatches.state.${data.state}`)}
            tone={DISPATCH_STATE_TONE[data.state]}
          />
          <TypeBadge label={t(`dispatches.wasteType.${data.waste_type}`)} />
        </>
      }
    >
      <RecordDetailShell
        reference={data.dispatch_no}
        notices={
          !data.is_editable && data.state !== "CANCELLED" ? (
            <p className="flex items-start gap-2 rounded-xl border border-panel-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("dispatches.lockedNote")}
            </p>
          ) : null
        }
        facts={[
          // Destination
          {
            label: t("dispatches.field.project"),
            value: `${data.project_code} — ${data.project_name}`,
          },
          { label: t("dispatches.field.recycler"), value: data.recycler_name },
          // Load
          {
            label: t("dispatches.field.wasteType"),
            value: t(`dispatches.wasteType.${data.waste_type}`),
          },
          {
            label: t("dispatches.field.estimatedWeight"),
            value: data.estimated_weight_kg,
          },
          // Vehicle
          { label: t("dispatches.field.vehiclePlate"), value: data.vehicle_plate },
          { label: t("dispatches.field.driverName"), value: data.driver_name },
          { label: t("dispatches.field.driverPhone"), value: data.driver_phone },
          { label: t("dispatches.field.driverIc"), value: data.driver_ic },
          // Release
          {
            label: t("dispatches.field.releasedAt"),
            value: data.released_at ? df.dateTime(data.released_at) : null,
          },
          { label: t("dispatches.field.releasedBy"), value: data.released_by_name },
          {
            label: t("dispatches.field.description"),
            value: data.description,
            wide: true,
          },
          {
            label: t("dispatches.field.location"),
            value: coordinates ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-success" />
                <span className="tabular">{coordinates}</span>
              </span>
            ) : null,
            wide: true,
          },
        ]}
        /*
          The dispatch's own photographs, which had nowhere to be seen and no
          way to be added: only the application's photos and the driver's
          were on this page (F-101).
        */
        photos={data.photos.map((photo) => ({
          id: photo.id,
          url: photo.watermarked || photo.image,
          label: t(`dispatches.photoKind.${photo.kind}`),
        }))}
        photoActions={
          can("dispatch.create") ? (
            <AddDispatchPhoto
              dispatchId={data.id}
              onAdded={() =>
                void queryClient.invalidateQueries({
                  queryKey: ["dispatch", data.id],
                })
              }
            />
          ) : null
        }
        actions={
          canRelease || canCancel ? (
            <div className="flex flex-wrap items-center gap-2">
              {canRelease && (
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
          ) : null
        }
        panel={
          <div className="space-y-4">
            {data.source_record && (
              <ShellPanel title={t("dispatches.section.application")}>
                <PanelFacts
                  facts={[
                    { label: t("dispatches.field.applicationNo"), value: data.source_record.reference_no },
                    { label: t("dispatches.field.applicant"), value: data.source_record.submitted_by_name },
                    { label: t("dispatches.field.approvedBy"), value: data.source_record.reviewed_by_name },
                    { label: t("dispatches.field.approvedAt"), value: data.source_record.reviewed_at ? df.dateTime(data.source_record.reviewed_at) : null },
                    { label: t("dispatches.field.applicationNote"), value: data.source_record.note, wide: true },
                    { label: t("dispatches.field.approvalNote"), value: data.source_record.review_note, wide: true },
                  ]}
                />
                {data.source_record.photos.length > 0 && (
                  <div className="mt-4">
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
              </ShellPanel>
            )}
            {(data.source_record_id || data.tasks.length > 0) && (
              <ShellPanel title={t("dispatches.section.execution")}>
                <div className="space-y-4">
                  <QueryFailedNote query={tracking} what={t("dispatches.what.tracking")} />
                  {tracking.isLoading && user?.portal !== "MSE_SCRAP" ? (
                    <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
                  ) : execution ? (
                    <>
                      <PanelFacts
                        facts={[
                          { label: t("dispatches.field.collectionPlan"), value: data.confirmed_collection_at ? df.dateTime(data.confirmed_collection_at) : data.proposed_collection_at ? df.dateTime(data.proposed_collection_at) : null },
                          { label: t("dispatches.field.driverName"), value: execution.driver_name },
                          { label: t("dispatches.field.vehiclePlate"), value: execution.vehicle_plate },
                          ...(execution.milestones.length > 0
                            ? [{ label: t("dispatches.field.executionProgress"), value: `${execution.milestones.filter((row) => row.done).length}/${execution.milestones.length}` }]
                            : []),
                        ]}
                      />
                      {(execution.tasks ?? []).map((task) =>
                        task.latest_position ? (
                          <div key={`${task.id}-position`} className="min-w-0">
                            <p className="text-xs text-muted-foreground">{t("dispatches.field.location")}</p>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${task.latest_position.latitude},${task.latest_position.longitude}`)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                            >
                              <MapPin className="h-3.5 w-3.5" />
                              <span className="tabular">
                                {task.latest_position.latitude}, {task.latest_position.longitude}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {df.dateTime(task.latest_position.occurred_at)}
                              </span>
                            </a>
                          </div>
                        ) : null,
                      )}
                      {(execution.tasks ?? []).some((task) => task.photos.length > 0) && (
                        <div>
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
                </div>
              </ShellPanel>
            )}
            {execution?.weighing && (
              <ShellPanel title={t("dispatches.section.weighing")}>
                <PanelFacts
                  facts={[
                    { label: t("dispatches.field.weighingNo"), value: execution.weighing.session_no },
                    { label: t("dispatches.field.firstWeight"), value: execution.weighing.first_weight_kg ? `${execution.weighing.first_weight_kg} kg` : null },
                    { label: t("dispatches.field.secondWeight"), value: execution.weighing.second_weight_kg ? `${execution.weighing.second_weight_kg} kg` : null },
                    { label: t("dispatches.field.netWeight"), value: execution.weighing.net_weight_kg ? `${execution.weighing.net_weight_kg} kg` : null },
                  ]}
                />
                <div className="mt-3"><PrintTicketButton sessionId={execution.weighing.session_id} sessionNo={execution.weighing.session_no} /></div>
              </ShellPanel>
            )}
            {execution?.settlement && (
              <ShellPanel title={t("dispatches.section.settlement")}>
                <PanelFacts
                  facts={[
                    { label: t("dispatches.field.settlementNo"), value: execution.settlement.settlement_no ?? null },
                    { label: t("dispatches.field.settlementState"), value: execution.settlement.state ?? null },
                    { label: t("settlements.field.deductionWeight"), value: execution.settlement.deduction_weight_kg ? `${execution.settlement.deduction_weight_kg} kg` : "0 kg" },
                    { label: t("dispatches.field.settledWeight"), value: execution.settlement.settled_weight_kg ? `${execution.settlement.settled_weight_kg} kg` : null },
                    { label: t("dispatches.field.settlementAmount"), value: execution.settlement.total_amount ? `${execution.settlement.currency} ${execution.settlement.total_amount}` : null },
                    { label: t("settlements.field.amountPaid"), value: `${execution.settlement.currency} ${execution.settlement.amount_paid}` },
                    { label: t("settlements.field.outstanding"), value: execution.settlement.outstanding === null ? null : `${execution.settlement.currency} ${execution.settlement.outstanding}` },
                  ]}
                />
                {execution.settlement.deductions.length > 0 && (
                  <div className="mt-3 divide-y border-y">
                    {execution.settlement.deductions.map((deduction) => (
                      <div key={deduction.id} className="py-2 text-sm">
                        <p className="font-medium">{deduction.kind} · {t("companies.weightKg", { value: deduction.weight_kg })} · {deduction.state}</p>
                        <p className="mt-0.5 text-muted-foreground">{deduction.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
                {execution.settlement.payments.length > 0 && (
                  <div className="mt-3 divide-y border-y">
                    {execution.settlement.payments.map((payment) => (
                      <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <span>{payment.method}{payment.reference ? ` · ${payment.reference}` : ""}</span>
                        <span className="font-medium tabular-nums">{execution.settlement!.currency} {payment.amount} · {df.date(payment.paid_on)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </ShellPanel>
            )}
          </div>
        }
        aside={
          data.events.length > 0 ? (
            <ShellPanel
              title={t("dispatches.section.timeline")}
              aside={<Clock3 className="h-4 w-4 text-primary" />}
            >
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
            </ShellPanel>
          ) : null
        }
      />

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
    </RecordDetailFrame>
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

        <FieldWrapper label={t("dispatches.release.byName")} required>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </FieldWrapper>

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
