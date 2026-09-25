"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, FolderOpen, Pencil, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  FormSkeleton,
  LoadErrorCard,
} from "@/components/shared/form-shell";
import { RecordDetailShell } from "@/components/shared/record-detail-shell";
import { RecordExportButton } from "@/components/shared/record-export-button";
import { AddToPackageButton } from "@/components/contractor-ops/add-to-package";
import { FileIntoColumnDialog } from "@/components/contractor-ops/file-into-column";
import { Switch } from "@/components/ui/switch";
import {
  DetailHeader,
  FieldWrapper,
  TypeBadge,
} from "@/components/shared/page-primitives";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  MaterialReceiptDetail,
  PhotoKind,
} from "@/interfaces/contractor";
import {
  addReceiptPhoto,
  getReceipt,
  refileReceipt,
  reviewReceipt,
} from "@/services/contractor.service";
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
/**
 * Accept a delivery, or reject it with a reason.
 *
 * T-188 built the field, the endpoint, the audit trail and a home-page card
 * counting 待验收／不合格 material. It did not build this, so the field could
 * never leave PENDING and the card counted a number incapable of changing -
 * the 空壳 the customer keeps asking us not to ship. The reachability guard
 * named it: `/api/receipts/{}/review_receipt/ - no service function builds
 * this path`.
 *
 * Rejecting demands a reason and the button stays disabled without one. The
 * server refuses too; this is only so the refusal is not a surprise.
 */
function ReviewDelivery({
  receipt,
  onReviewed,
}: {
  receipt: MaterialReceiptDetail;
  onReviewed: () => void;
}) {
  const t = useTranslations();
  const [reason, setReason] = useState(receipt.rejection_reason ?? "");
  // Armed, not confirmed (D-208, C-018). Resets itself whenever the switch is
  // turned back off so a half-typed reason cannot survive into the next visit.
  const [rejectArmed, setRejectArmed] = useState(false);
  const status = receipt.acceptance_status ?? "PENDING";

  const review = useMutation({
    mutationFn: (decision: "ACCEPTED" | "REJECTED") =>
      reviewReceipt(receipt.id, {
        decision,
        rejection_reason: decision === "REJECTED" ? reason.trim() : "",
      }),
    onSuccess: onReviewed,
  });

  const tone =
    status === "ACCEPTED"
      ? "text-emerald-600"
      : status === "REJECTED"
        ? "text-destructive"
        : "text-amber-600";

  return (
    // In the shell's right column (图 2 圈起来的位置), so it is a compact
    // block rather than a full-width form section.
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("receipts.acceptance.title")}
      </h3>
      <div className="space-y-2">
        <p className={`text-sm font-medium ${tone}`}>
          {t(`receipts.acceptance.status.${status}`)}
          {receipt.accepted_by_name ? ` · ${receipt.accepted_by_name}` : ""}
        </p>

        {/* A rejection that survives on the record without its reason tells
            the next person on site nothing they can act on, so the reason is
            shown whenever there is one - not only while deciding. */}
        {status === "REJECTED" && receipt.rejection_reason && (
          <p className="text-xs">
            <span className="text-muted-foreground">{t("receipts.acceptance.reason")}：</span>
            {receipt.rejection_reason}
          </p>
        )}

        {/* One confirming action, and a rejection behind a switch (D-208,
            C-018). The customer's words for why: 「只保留一个开/关控制。开启后，
            才允许点击【材料不符规格退回】…避免操作太敏感，防止后台人员不小心
            误点退回」. Two equally-weighted buttons made退回 one slip away, on
            a screen whose other button is pressed all day.

            The same shape guards the driver ending a trip (D-229): arm, then
            act. Never a confirmation dialog — the customer asked for the
            switch in both places and for no second prompt after it. */}
        <Button
          size="sm"
          disabled={review.isPending || status === "ACCEPTED"}
          disabledReason={
            status === "ACCEPTED"
              ? t("receipts.acceptance.alreadyAccepted")
              : t("common.saving")
          }
          onClick={() => review.mutate("ACCEPTED")}
        >
          {t("receipts.acceptance.accept")}
        </Button>

        <label className="flex items-center gap-2 rounded-md border px-2 py-1.5">
          <Switch
            checked={rejectArmed}
            onCheckedChange={(next) => {
              setRejectArmed(next);
              if (!next) setReason("");
            }}
            aria-label={t("receipts.acceptance.armReject")}
          />
          <span className="text-xs text-muted-foreground">
            {t("receipts.acceptance.armRejectHelp")}
          </span>
        </label>

        {rejectArmed && (
          <div className="space-y-2">
            <FieldWrapper label={t("receipts.acceptance.reason")} required>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("receipts.acceptance.reasonPlaceholder")}
                className="h-8 text-sm"
              />
            </FieldWrapper>
            {/* `requires` rather than a bare `disabled`, so the list that decides
                whether it can be pressed is the same list that explains why it
                cannot: the reason is the whole point of a rejection.
                客户第 12 条: 规格不符要先在这条记录内沟通留痕，确认后才能退回 —
                the conversation lives further down this same page. */}
            <Button
              size="sm"
              variant="destructive"
              requires={[[reason.trim(), t("receipts.acceptance.reason")]]}
              disabled={review.isPending}
              disabledReason={t("common.saving")}
              onClick={() => review.mutate("REJECTED")}
            >
              {t("receipts.acceptance.reject")}
            </Button>
          </div>
        )}
        {/* Said plainly, because the alternative is a site assuming a
            rejection stopped the invoice when it did not (U-028). */}
        <p className="text-xs text-muted-foreground">
          {t("receipts.acceptance.moneyNote")}
        </p>
      </div>
    </div>
  );
}

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
    <div className="space-y-2 rounded-md border border-dashed p-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("receipts.addPhoto.title")}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <FieldWrapper label={t("receipts.addPhoto.choose")} required>
          <Input
            type="file"
            accept="image/*"
            className="h-8 max-w-xs text-xs"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </FieldWrapper>
        <FieldWrapper label={t("receipts.addPhoto.kind")}>
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as PhotoKind)}
          >
            {PHOTO_KINDS.map((option) => (
              <option key={option} value={option}>
                {t(`receipts.photoKind.${option}`)}
              </option>
            ))}
          </select>
        </FieldWrapper>
        <FieldWrapper label={t("receipts.addPhoto.caption")}>
          <Input
            className="h-8 max-w-xs text-sm"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </FieldWrapper>
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

/** First letters of the first two words, for an avatar with no picture. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ViewReceipt({ id }: { id: string }) {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [filing, setFiling] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["receipts", "detail", id],
    queryFn: () => getReceipt(id),
  });

  // No "seen" mark on opening (T-292, 客户第 14 条; D-206). Reading a
  // delivery is not a business event, and the receipts list no longer shows
  // one. The archive queue records its own per-person marks through its own
  // explicit action (D-063), so nothing there depends on this page any more.

  if (isLoading) return <FormSkeleton sections={4} />;
  if (isError || !data) {
    return <LoadErrorCard backHref="/receipts" backLabel={t("receipts.title")} />;
  }

  return (
    <div className="space-y-3">
      {/* 「单独导出」 top right (T-386): this delivery as its own PDF. */}
      <DetailHeader
        backHref="/receipts"
        backLabel={t("receipts.title")}
        action={
          <RecordExportButton
            kind="MATERIAL_RECEIPT"
            recordId={data.id}
            reference={data.receipt_no}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-3">
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
      </div>

      {/*
        The one layout every module uses (C-020): summary, small photographs,
        the delivery-order panel with signatures and the buttons on the right,
        the conversation underneath. The long read-only form that used to sit
        below the photographs (supplier / material / vehicle sections) is gone
        on Lucas's instruction - 「图 3 的那些 information 是完全不需要的」 -
        and the facts a reader actually checks are in the summary or the
        delivery-order panel.
      */}
      <RecordDetailShell
        reference={data.receipt_no}
        notices={
          <>
            {data.superseded_by && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
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
            {data.correction_reason && (
              <p className="rounded-lg border px-4 py-2 text-sm">
                <span className="text-muted-foreground">{t("receipts.correction.reason")}：</span>
                {data.correction_reason}
              </p>
            )}
          </>
        }
        facts={[
          { label: t("receipts.field.project"), value: data.project_name },
          { label: t("receipts.field.materialName"), value: data.material_name },
          { label: t("receipts.field.capturedAt"), value: df.dateTime(data.captured_at) },
          {
            label: t("receipts.field.recordedBy"),
            value: (
              <span className="inline-flex items-center gap-2">
                <Avatar className="size-5">
                  {data.created_by_avatar ? (
                    <AvatarImage src={data.created_by_avatar} alt="" />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-[9px] font-semibold text-primary">
                    {initials(data.created_by_name ?? "")}
                  </AvatarFallback>
                </Avatar>
                {data.created_by_name ?? t("receipts.recorderUnknown")}
                {/* The number to call about a disputed delivery (2026-09-05). */}
                {data.created_by_phone ? (
                  <a
                    href={`tel:${data.created_by_phone.replace(/[^+\d]/g, "")}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Phone className="h-3 w-3" />
                    <span className="tabular">{data.created_by_phone}</span>
                  </a>
                ) : null}
              </span>
            ),
          },
          ...(data.received_by_name
            ? [{ label: t("receipts.field.receivedBy"), value: data.received_by_name }]
            : []),
          ...(data.notes
            ? [{ label: t("receipts.field.notes"), value: data.notes, wide: true }]
            : []),
        ]}
        photos={data.photos.map((photo) => ({
          id: photo.id,
          url: photo.watermarked || photo.image,
          label: t(`receipts.photoKind.${photo.kind}`),
          takenAt: photo.taken_at,
          latitude: photo.latitude,
          longitude: photo.longitude,
        }))}
        photoActions={
          can("receipt.create") && !data.superseded_by ? (
            <AddPhoto
              receipt={data}
              onAdded={() =>
                void queryClient.invalidateQueries({
                  queryKey: ["receipts", "detail", id],
                })
              }
            />
          ) : null
        }
        panel={<DeliveryOrderPanel receipt={data} />}
        signatures={(
          [
            ["receiver", data.signature],
            ["supplier", data.supplier_signature],
          ] as const
        )
          .filter(([, source]) => Boolean(source))
          .map(([who, source]) => ({
            label: t(`receipts.signature.${who}`),
            url: source as string,
          }))}
        actions={
          <>
            {/* Superseded receipts are read-only: a correction has replaced
                this copy, and deciding on the replaced one would put a
                decision on a record nobody is working from. */}
            {can("receipt.update") && !data.superseded_by && (
              <ReviewDelivery receipt={data} onReviewed={() => void refetch()} />
            )}
            <div className="flex flex-wrap gap-2 border-t pt-2">
              <AddToPackageButton
                kind="MATERIAL_RECEIPT"
                recordId={data.id}
                projectId={data.project}
                reference={data.receipt_no}
              />
              {/* Moving a delivery to another material column. It lived on
                  the material-columns page, which is gone (D-263); without
                  it a column holding deliveries could never be emptied, and
                  the server's "move them first" would name an action nobody
                  could take (F-204). */}
              {can("receipt.update") && !data.superseded_by && (
                <Button size="sm" variant="outline" onClick={() => setFiling(true)}>
                  <FolderOpen className="h-4 w-4" />
                  {t("contractorOps.filing.action")}
                </Button>
              )}
              {can("receipt.update") && !data.superseded_by && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/receipts/${data.id}/edit`}>
                    <Pencil className="h-4 w-4" />
                    {t("receipts.correction.action")}
                  </Link>
                </Button>
              )}
            </div>
          </>
        }
        conversation={{ kind: "MATERIAL_RECEIPT", recordId: data.id }}
      />
      {filing && (
        <FileIntoColumnDialog
          projectId={data.project}
          kind="MATERIAL"
          current={data.category ?? null}
          reference={data.receipt_no}
          onFile={(category, reason) =>
            refileReceipt(data.id, { category, reason: reason || undefined })
          }
          onFiled={() => {
            void queryClient.invalidateQueries({ queryKey: ["receipts"] });
            // Both columns' budgets moved with the delivery.
            void queryClient.invalidateQueries({ queryKey: ["project-categories"] });
            void queryClient.invalidateQueries({ queryKey: ["category-management"] });
          }}
          onClose={() => setFiling(false)}
        />
      )}
    </div>
  );
}

/**
 * What was read off the delivery order, in the right column (图 1／图 2).
 *
 * Kept as the receipt's own panel inside the shared shell: this is the one
 * block that is specific to deliveries - the supplier, the quantity and the
 * lorry, next to the photograph they were read from.
 */
function DeliveryOrderPanel({ receipt }: { receipt: MaterialReceiptDetail }) {
  const t = useTranslations();
  const rows: Array<[string, React.ReactNode]> = [
    [t("receipts.field.deliveryNoteNo"), receipt.delivery_note_no],
    [t("receipts.field.supplier"), receipt.supplier_name],
    [t("receipts.field.materialName"), receipt.material_name],
    [t("receipts.field.quantity"), `${receipt.quantity} ${t(`receipts.unit.${receipt.unit}`)}`],
    [t("receipts.field.vehiclePlate"), receipt.vehicle_plate],
    [t("receipts.doPanelStatus"), t(`receipts.doStatus.${receipt.ocr_status}`)],
  ];
  return (
    <section className="rounded-lg border bg-card p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("receipts.doPanelTitle")}
      </h3>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        {rows.map(([label, value]) => (
          <div key={String(label)} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words font-medium">{value || "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
