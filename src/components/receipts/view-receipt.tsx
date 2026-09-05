"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ChevronLeft, ChevronRight, MapPin, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  FormSection,
  FormSkeleton,
  LoadErrorCard,
} from "@/components/shared/form-shell";
import {
  DetailHeader,
  ReadField,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type {
  MaterialReceiptDetail,
  PhotoKind,
} from "@/interfaces/contractor";
import { addReceiptPhoto, getReceipt, markReceiptsSeen } from "@/services/contractor.service";
import { useDateFormat } from "@/lib/dates";

const PHOTO_KINDS: PhotoKind[] = [
  "VEHICLE",
  "UNLOADING",
  "DELIVERY_NOTE",
  "OTHER",
];

/**
 * The browser's fix, or nothing.
 *
 * Never rejects: a photo arriving without a fix is not a failure here, because
 * the backend falls back to the receipt's own location. It refuses only when
 * neither has one, and says so.
 */
function currentPosition(): Promise<GeolocationPosition | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      resolve,
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    ),
  );
}

/**
 * Attach a photograph to a receipt that is already filed.
 *
 * The backend has taken these one at a time since the module was written - a
 * site on a weak signal files the receipt immediately and sends photos as they
 * can - but no screen ever offered it, so a shot taken two minutes late could
 * not be attached at all (F-101).
 */
function AddPhoto({
  receipt,
  onAdded,
}: {
  receipt: MaterialReceiptDetail;
  onAdded: () => void;
}) {
  const t = useTranslations();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<PhotoKind>("VEHICLE");
  const [caption, setCaption] = useState("");

  const upload = useMutation({
    mutationFn: async (image: File) => {
      const fix = await currentPosition();
      return addReceiptPhoto(receipt.id, {
        image,
        kind,
        caption: caption.trim(),
        latitude: fix?.coords.latitude.toFixed(7),
        longitude: fix?.coords.longitude.toFixed(7),
      });
    },
    onSuccess: () => {
      setFile(null);
      setCaption("");
      onAdded();
    },
  });

  const receiptHasNoFix = !receipt.latitude || !receipt.longitude;

  return (
    <div className="mt-4 space-y-2 rounded-md border border-dashed p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("receipts.addPhoto.title")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="file"
          accept="image/*"
          className="h-8 max-w-xs text-xs"
          aria-label={t("receipts.addPhoto.choose")}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          aria-label={t("receipts.addPhoto.kind")}
          value={kind}
          onChange={(e) => setKind(e.target.value as PhotoKind)}
        >
          {PHOTO_KINDS.map((option) => (
            <option key={option} value={option}>
              {t(`receipts.photoKind.${option}`)}
            </option>
          ))}
        </select>
        <Input
          className="h-8 max-w-xs text-sm"
          placeholder={t("receipts.addPhoto.caption")}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          requires={[[file, t("receipts.addPhoto.choose")]]}
          disabled={upload.isPending}
          onClick={() => file && upload.mutate(file)}
        >
          <Camera className="h-4 w-4" />
          {t("receipts.addPhoto.upload")}
        </Button>
      </div>
      {receiptHasNoFix && (
        <p className="text-xs text-muted-foreground">
          {t("receipts.addPhoto.needLocation")}
        </p>
      )}
    </div>
  );
}

export function ViewReceipt({ id }: { id: string }) {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  // Which photograph is open full size, by index, or null for none.
  const [openPhoto, setOpenPhoto] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["receipts", "detail", id],
    queryFn: () => getReceipt(id),
  });

  // Opening the record is what "seen" means, so it is marked here rather than
  // behind a button nobody would press. The ref guards React's development
  // double-invoke and any refetch: one open is one read.
  const marked = useRef(false);
  useEffect(() => {
    if (!data || marked.current) return;
    marked.current = true;
    void markReceiptsSeen([id])
      .then(() => {
        // The list's waiting/archived split is now stale for this reader.
        void queryClient.invalidateQueries({ queryKey: ["receipts"] });
      })
      // A failed read-mark must never break the page the reader came for.
      .catch(() => undefined);
  }, [data, id, queryClient]);

  if (isLoading) return <FormSkeleton sections={4} />;
  if (isError || !data) {
    return <LoadErrorCard backHref="/receipts" backLabel={t("receipts.title")} />;
  }

  const coordinates =
    data.latitude && data.longitude ? `${data.latitude}, ${data.longitude}` : null;

  return (
    <div className="space-y-4">
      <DetailHeader
        backHref="/receipts"
        backLabel={t("receipts.title")}
        action={
          can("receipt.update") && !data.superseded_by ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href={`/receipts/${data.id}/edit`}>
                <Pencil className="h-4 w-4" />
                {t("receipts.correction.action")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      {data.superseded_by && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <p className="font-medium">{t("receipts.correction.supersededTitle")}</p>
          <p className="mt-1 text-muted-foreground">
            {t("receipts.correction.supersededBody")}
          </p>
          <Link
            href={`/receipts/${data.superseded_by.id}`}
            className="mt-1 inline-block font-medium text-primary underline-offset-2 hover:underline"
          >
            {t("receipts.correction.supersededLink", {
              name: data.superseded_by.receipt_no,
            })}
          </Link>
        </div>
      )}

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <h2 className="tabular text-base font-semibold text-foreground">
            {data.receipt_no}
          </h2>
          <TypeBadge label={t(`receipts.unit.${data.unit}`)} />
          {data.supersedes && (
            <Link
              href={`/receipts/${data.supersedes}`}
              className="text-xs font-medium text-info underline-offset-2 hover:underline"
            >
              {t("receipts.correction.supersedes")}
            </Link>
          )}
          <span className="ml-auto text-sm text-muted-foreground">
            {data.project_name}
          </span>
        </div>

        <div className="divide-y border-t">
          <FormSection title={t("receipts.section.delivery")}>
            <ReadField
              label={t("receipts.field.project")}
              value={`${data.project_code} — ${data.project_name}`}
            />
            <ReadField
              label={t("receipts.field.supplier")}
              value={data.supplier_name}
            />
          </FormSection>

          <FormSection title={t("receipts.section.material")}>
            <ReadField
              label={t("receipts.field.materialName")}
              value={data.material_name}
              className="md:col-span-2"
            />
            <ReadField
              label={t("receipts.field.quantity")}
              value={`${data.quantity} ${t(`receipts.unit.${data.unit}`)}`}
            />
            <ReadField
              label={t("receipts.field.unitPrice")}
              value={data.unit_price}
            />
            <ReadField
              label={t("receipts.field.totalValue")}
              value={data.total_value}
            />
          </FormSection>

          <FormSection title={t("receipts.section.vehicle")}>
            <ReadField
              label={t("receipts.field.vehiclePlate")}
              value={data.vehicle_plate}
            />
            <ReadField
              label={t("receipts.field.deliveryNoteNo")}
              value={data.delivery_note_no}
            />
            <ReadField
              label={t("receipts.field.notes")}
              value={data.notes}
              className="md:col-span-2"
            />
          </FormSection>

          {/*
            Kept in its own section, and labelled as the platform's own record,
            because that is exactly what makes it worth anything in a dispute:
            nobody at the gate typed these in.
          */}
          {data.correction_reason && (
            <FormSection title={t("receipts.correction.title")}>
              <ReadField
                label={t("receipts.correction.reason")}
                value={data.correction_reason}
                className="md:col-span-2"
              />
            </FormSection>
          )}

          <FormSection title={t("receipts.section.stamp")}>
            <ReadField
              label={t("receipts.field.receivedBy")}
              value={data.received_by_name}
            />
            <ReadField
              label={t("receipts.field.recordedBy")}
              value={data.created_by_name}
            />
            <ReadField
              label={t("receipts.field.capturedAt")}
              value={df.dateTime(data.captured_at)}
            />
            <ReadField
              label={t("receipts.field.location")}
              value={
                coordinates ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-success" />
                    <span className="tabular">{coordinates}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {t("receipts.locationMissing")}
                  </span>
                )
              }
            />
          </FormSection>

          <section className="px-6 py-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("receipts.section.photos")}
            </h3>
            {data.photos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("receipts.noPhotos")}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {data.photos.map((photo, index) => (
                  <figure key={photo.id} className="space-y-1.5">
                    {/* A thumbnail cropped to 4:3 is not the evidence, it is a
                        pointer to it. Until this was clickable there was no
                        way to see a delivery note well enough to read it. */}
                    <button
                      type="button"
                      title={t("receipts.photoViewer.open")}
                      onClick={() => setOpenPhoto(index)}
                      className="relative block aspect-4/3 w-full overflow-hidden rounded-md border bg-muted/40 transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {/* The original, not the stamped copy. A project manager
                          reuses these photographs elsewhere, and a location and
                          time burnt into the corner travels with them into
                          documents where it means nothing. The stamped version
                          still exists and is still what the evidence trail
                          shows. */}
                      <Image
                        src={photo.image}
                        alt={t(`receipts.photoKind.${photo.kind}`)}
                        fill
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className="object-cover"
                        unoptimized
                      />
                    </button>
                    <figcaption className="text-xs text-muted-foreground">
                      {t(`receipts.photoKind.${photo.kind}`)}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
            {can("receipt.create") && !data.superseded_by && (
              <AddPhoto
                receipt={data}
                onAdded={() =>
                  void queryClient.invalidateQueries({
                    queryKey: ["receipts", "detail", id],
                  })
                }
              />
            )}
          </section>

          {/* The signatures belong with the delivery they were given for.
              They were captured on site and stored on this record all along,
              and this screen simply never drew them - so the one place a
              project manager looks to check a delivery was the one place that
              could not show who signed for it. */}
          <section className="rounded-lg border bg-card p-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("receipts.section.signatures")}
            </h3>
            {data.signature || data.supplier_signature ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {(
                  [
                    ["receiver", data.signature],
                    ["supplier", data.supplier_signature],
                  ] as const
                ).map(([who, source]) =>
                  source ? (
                    <figure key={who} className="space-y-1.5">
                      <div className="relative aspect-3/1 overflow-hidden rounded-md border bg-white">
                        <Image
                          src={source}
                          alt={t(`receipts.signature.${who}`)}
                          fill
                          sizes="(max-width: 640px) 100vw, 50vw"
                          className="object-contain"
                          unoptimized
                        />
                      </div>
                      <figcaption className="text-xs text-muted-foreground">
                        {t(`receipts.signature.${who}`)}
                      </figcaption>
                    </figure>
                  ) : null,
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("receipts.signature.none")}
              </p>
            )}
          </section>
        </div>
      </div>

      {/* Full size, with the neighbours one key away: a delivery note is
          usually checked against the one before it. */}
      <Dialog
        open={openPhoto !== null}
        onOpenChange={(open) => !open && setOpenPhoto(null)}
      >
        <DialogContent className="sm:max-w-4xl">
          {openPhoto !== null && data.photos[openPhoto] ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {t(`receipts.photoKind.${data.photos[openPhoto].kind}`)}
                </DialogTitle>
                <DialogDescription>
                  {t("receipts.photoViewer.clean")}
                </DialogDescription>
              </DialogHeader>
              <div className="relative max-h-[70dvh] min-h-[40dvh] overflow-hidden rounded-md bg-muted/40">
                <Image
                  src={data.photos[openPhoto].image}
                  alt={t(`receipts.photoKind.${data.photos[openPhoto].kind}`)}
                  width={1600}
                  height={1200}
                  className="max-h-[70dvh] w-full object-contain"
                  unoptimized
                />
              </div>
              {data.photos.length > 1 && (
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    title={t("receipts.photoViewer.previous")}
                    onClick={() =>
                      setOpenPhoto(
                        (openPhoto + data.photos.length - 1) %
                          data.photos.length,
                      )
                    }
                  >
                    <ChevronLeft />
                    {t("receipts.photoViewer.previous")}
                  </Button>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {openPhoto + 1} / {data.photos.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    title={t("receipts.photoViewer.next")}
                    onClick={() =>
                      setOpenPhoto((openPhoto + 1) % data.photos.length)
                    }
                  >
                    {t("receipts.photoViewer.next")}
                    <ChevronRight />
                  </Button>
                </div>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
