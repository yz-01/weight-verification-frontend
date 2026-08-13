"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Camera, Info, MapPin, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

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
import { Label } from "@/components/ui/label";
import { useDateFormat } from "@/lib/dates";
import { getWasteTracking } from "@/services/waste-outgoing.service";
import { PrintTicketButton } from "@/components/weighing/print-ticket-button";
import {
  cancelDispatch,
  getDispatch,
  releaseDispatch,
} from "@/services/contractor.service";

export function ViewDispatch({ id }: { id: string }) {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [releasing, setReleasing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dispatches", "detail", id],
    queryFn: () => getDispatch(id),
  });
  const tracking = useQuery({
    queryKey: ["waste-outgoing", "tracking", data?.source_record_id],
    queryFn: () => getWasteTracking(data!.source_record_id!),
    enabled: Boolean(data?.source_record_id),
    refetchInterval: 30_000,
  });

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
    return (
      <LoadErrorCard backHref="/dispatches" backLabel={t("dispatches.title")} />
    );
  }

  const coordinates =
    data.latitude && data.longitude ? `${data.latitude}, ${data.longitude}` : null;
  const canCancel =
    can("dispatch.update") &&
    (data.state === "DRAFT" || data.state === "RELEASED");

  return (
    <div className="space-y-4">
      <DetailHeader
        backHref="/dispatches"
        backLabel={t("dispatches.title")}
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
            {can("dispatch.update") && data.state === "DRAFT" && (
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
          {data.source_record_id && (
            <FormSection title={t("dispatches.section.execution")}>
              {tracking.isLoading ? (
                <p className="md:col-span-2 text-sm text-muted-foreground">{t("common.loading")}</p>
              ) : tracking.data ? (
                <>
                  <ReadField label={t("dispatches.field.collectionPlan")} value={data.confirmed_collection_at ? df.dateTime(data.confirmed_collection_at) : data.proposed_collection_at ? df.dateTime(data.proposed_collection_at) : null} />
                  <ReadField label={t("dispatches.field.driverName")} value={tracking.data.driver_name} />
                  <ReadField label={t("dispatches.field.vehiclePlate")} value={tracking.data.vehicle_plate} />
                  <ReadField label={t("dispatches.field.executionProgress")} value={`${tracking.data.milestones.filter((row) => row.done).length}/${tracking.data.milestones.length}`} />
                  {(tracking.data.tasks ?? []).some((task) => task.photos.length > 0) && (
                    <div className="md:col-span-2">
                      <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><Camera className="size-4" />{t("dispatches.section.executionPhotos")}</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {(tracking.data.tasks ?? []).flatMap((task) => task.photos).map((photo) => (
                          <a key={photo.id} href={photo.image} target="_blank" rel="noreferrer" className="overflow-hidden rounded-md border bg-muted/20">
                            <Image src={photo.image} alt={photo.caption || photo.kind} width={360} height={270} unoptimized className="aspect-[4/3] w-full object-cover" />
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
          {tracking.data?.weighing && (
            <FormSection title={t("dispatches.section.weighing")}>
              <ReadField label={t("dispatches.field.weighingNo")} value={tracking.data.weighing.session_no} />
              <ReadField label={t("dispatches.field.firstWeight")} value={tracking.data.weighing.first_weight_kg ? `${tracking.data.weighing.first_weight_kg} kg` : null} />
              <ReadField label={t("dispatches.field.secondWeight")} value={tracking.data.weighing.second_weight_kg ? `${tracking.data.weighing.second_weight_kg} kg` : null} />
              <ReadField label={t("dispatches.field.netWeight")} value={tracking.data.weighing.net_weight_kg ? `${tracking.data.weighing.net_weight_kg} kg` : null} />
              <div className="md:col-span-2"><PrintTicketButton sessionId={tracking.data.weighing.session_id} sessionNo={tracking.data.weighing.session_no} /></div>
            </FormSection>
          )}
          {tracking.data?.settlement && (
            <FormSection title={t("dispatches.section.settlement")}>
              <ReadField label={t("dispatches.field.settlementNo")} value={tracking.data.settlement.settlement_no} />
              <ReadField label={t("dispatches.field.settlementState")} value={tracking.data.settlement.state} />
              <ReadField label={t("dispatches.field.settledWeight")} value={`${tracking.data.settlement.settled_weight_kg} kg`} />
              <ReadField label={t("dispatches.field.settlementAmount")} value={tracking.data.settlement.total_amount ? `${tracking.data.settlement.currency} ${tracking.data.settlement.total_amount}` : null} />
            </FormSection>
          )}
        </div>
      </div>

      {releasing && (
        <ReleaseDialog id={id} onClose={() => setReleasing(false)} />
      )}

      {cancelling && (
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
            disabled={name.trim() === "" || release.isPending}
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
