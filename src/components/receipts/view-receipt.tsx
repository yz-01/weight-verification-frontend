"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { MapPin, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
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
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { getReceipt } from "@/services/contractor.service";

export function ViewReceipt({ id }: { id: string }) {
  const t = useTranslations();
  const { can } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["receipts", "detail", id],
    queryFn: () => getReceipt(id),
  });

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
          can("receipt.update") ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href={`/receipts/${data.id}/edit`}>
                <Pencil className="h-4 w-4" />
                {t("common.edit")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <h2 className="tabular text-base font-semibold text-foreground">
            {data.receipt_no}
          </h2>
          <TypeBadge label={t(`receipts.unit.${data.unit}`)} />
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
              value={format(new Date(data.captured_at), "dd MMM yyyy HH:mm")}
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
                {data.photos.map((photo) => (
                  <figure key={photo.id} className="space-y-1.5">
                    <div className="relative aspect-4/3 overflow-hidden rounded-md border bg-muted/40">
                      <Image
                        src={photo.image}
                        alt={t(`receipts.photoKind.${photo.kind}`)}
                        fill
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <figcaption className="text-xs text-muted-foreground">
                      {t(`receipts.photoKind.${photo.kind}`)}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
