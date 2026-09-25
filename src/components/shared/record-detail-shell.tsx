"use client";

/**
 * The one detail layout every contractor module uses (C-020, T-368/T-369).
 *
 * Lucas, 2026-09-23, with the material-receipt screenshots: 「全部模块都基本上
 * 都是这样的 layout 和设计…总而言之不要想到太复杂」. So there is one shell and
 * each module fills it, rather than each module drawing its own page and
 * drifting apart - which is how the receipt came to have a long read-only form
 * below its photographs that nobody wanted (「图 3 的那些 information 是完全
 * 不需要的」).
 *
 * The shape, top to bottom:
 *
 * * **summary** - the handful of facts a person checks first;
 * * **photographs**, left - 「照片需要很小很小」: small thumbnails, and a viewer
 *   that zooms in and out when one is opened;
 * * **the right column** - the module's own panel (a receipt's delivery-order
 *   reading, for instance), then **signatures if the module has any**
 *   (「没有签名就不需要放」), then **the action buttons** (「那些按钮放在图 2 的
 *   圈起来的位置」);
 * * **the record's conversation** underneath (C-014, D-233) - every module has
 *   one, like the hazard room.
 */

import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

import { EvidenceFileActions } from "@/components/shared/evidence-file-actions";
import { RecordConversationPanel } from "@/components/shared/record-conversation";
import { RecordExportButton } from "@/components/shared/record-export-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ArchiveRecordKind } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ExportableRecordKind } from "@/services/contractor-ops.service";

export interface ShellPhoto {
  id: string;
  url: string;
  /** What it is, e.g. "Delivery order". Shown under the thumbnail. */
  label: string;
  takenAt?: string | null;
  latitude?: string | null;
  longitude?: string | null;
}

export interface ShellFact {
  label: string;
  value: React.ReactNode;
  /** Spans the whole row, for a note or an address. */
  wide?: boolean;
}

export interface ShellSignature {
  label: string;
  url: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export function RecordDetailShell({
  reference,
  facts,
  photos,
  photoActions,
  panel,
  signatures = [],
  actions,
  notices,
  conversation,
}: {
  /** The record's own number, used on printed and downloaded copies. */
  reference: string;
  facts: ShellFact[];
  /**
   * Omitted for a record that never carries photographs (a machine on the
   * register), so it does not show an empty strip that reads as missing
   * evidence. An empty array still says 「没有照片」.
   */
  photos?: ShellPhoto[];
  /** Under the thumbnails, e.g. the office's 【上传文件】. */
  photoActions?: React.ReactNode;
  /** The module's own right-column panel. */
  panel?: React.ReactNode;
  /** Only rendered when there is at least one. */
  signatures?: ShellSignature[];
  /** The buttons, in the right column under the panel and signatures. */
  actions?: React.ReactNode;
  /** Banners above everything (superseded, overdue, closed...). */
  notices?: React.ReactNode;
  conversation?: { kind: ArchiveRecordKind; recordId: string } | null;
}) {
  const t = useTranslations("recordShell");
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {notices}
      <section className="grid gap-x-6 gap-y-2 rounded-lg border bg-muted/20 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
        {facts.map((fact) => (
          <div
            key={fact.label}
            className={cn(
              "min-w-0",
              fact.wide && "sm:col-span-2 lg:col-span-4",
            )}
          >
            <p className="text-[11px] text-muted-foreground">{fact.label}</p>
            <div className="break-words text-sm font-medium">
              {fact.value || "—"}
            </div>
          </div>
        ))}
      </section>

      <div
        className={cn(
          "grid gap-3",
          photos && "lg:grid-cols-[minmax(0,1fr)_20rem]",
        )}
      >
        {photos ? (
          <section className="min-w-0 rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("photos")}
              </h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {t("photoCount", { count: photos.length })}
              </span>
            </div>
            {photos.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                {t("noPhotos")}
              </p>
            ) : (
              // Small on purpose (「很小很小」). A thumbnail is a pointer; the
              // evidence is the full image, which the viewer shows at any size.
              <ul className="flex flex-wrap gap-2">
                {photos.map((photo, index) => (
                  <li key={photo.id} className="w-20">
                    <button
                      type="button"
                      title={photo.label}
                      onClick={() => setOpen(index)}
                      className="relative block size-20 overflow-hidden rounded-md border bg-muted/40 transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Image
                        src={photo.url}
                        alt={photo.label}
                        fill
                        sizes="80px"
                        className="object-cover"
                        unoptimized
                      />
                    </button>
                    <p className="mt-1 truncate text-[10px] text-muted-foreground">
                      {photo.label}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {photoActions ? <div className="mt-3">{photoActions}</div> : null}
          </section>
        ) : null}

        <aside className="space-y-3">
          {panel}
          {signatures.length > 0 && (
            <section className="rounded-lg border p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("signatures")}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {signatures.map((signature) => (
                  <figure key={signature.label} className="space-y-1">
                    <div className="relative aspect-3/1 overflow-hidden rounded-md border bg-white">
                      <Image
                        src={signature.url}
                        alt={signature.label}
                        fill
                        sizes="160px"
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                    <figcaption className="text-[11px] text-muted-foreground">
                      {signature.label}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}
          {actions ? (
            <section className="space-y-2 rounded-lg border p-3">
              {actions}
            </section>
          ) : null}
        </aside>
      </div>

      {conversation ? (
        <section className="rounded-lg border p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("conversation")}
          </h3>
          <RecordConversationPanel
            kind={conversation.kind}
            recordId={conversation.recordId}
          />
        </section>
      ) : null}

      {photos && open !== null && photos[open] ? (
        <PhotoViewer
          photos={photos}
          index={open}
          reference={reference}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * One photograph, zoomable (「点进去照片之后可以放大缩小」).
 *
 * Zoom with the buttons; once enlarged the frame scrolls, so the reader pans
 * by scrolling - no gesture library, nothing to learn. Neighbours
 * stay one press away because a delivery note is usually checked against the
 * one before it. Preview, print and download sit under the picture (D-236).
 */
function PhotoViewer({
  photos,
  index,
  reference,
  onIndex,
  onClose,
}: {
  photos: ShellPhoto[];
  index: number;
  reference: string;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("recordShell");
  const df = useDateFormat();
  const [zoom, setZoom] = useState(1);
  const photo = photos[index];
  const step = (by: number) =>
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + by)));
  const go = (by: number) => {
    setZoom(1);
    onIndex((index + by + photos.length) % photos.length);
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{photo.label}</DialogTitle>
          <DialogDescription>
            {[
              photo.takenAt ? df.dateTime(photo.takenAt) : t("noTime"),
              photo.latitude && photo.longitude
                ? `GPS ${photo.latitude}, ${photo.longitude}`
                : t("noLocation"),
            ].join(" · ")}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65dvh] min-h-[40dvh] overflow-auto rounded-md bg-muted/40">
          {/* A plain img so the zoom is a width, which scrolls; the stamped
              copy is shown, because it is the evidence. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt={photo.label}
            style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
            className="mx-auto block h-auto"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              title={t("zoomOut")}
              disabled={zoom <= MIN_ZOOM}
              disabledReason={t("zoomOut")}
              onClick={() => step(-0.5)}
            >
              <ZoomOut />
            </Button>
            <span className="w-12 text-center text-xs tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              size="sm"
              variant="outline"
              title={t("zoomIn")}
              disabled={zoom >= MAX_ZOOM}
              disabledReason={t("zoomIn")}
              onClick={() => step(0.5)}
            >
              <ZoomIn />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title={t("zoomReset")}
              onClick={() => setZoom(1)}
            >
              <RotateCcw />
            </Button>
          </div>
          <EvidenceFileActions
            url={photo.url}
            filename={`${reference}-${index + 1}.jpg`}
            title={`${reference} · ${photo.label}`}
          />
          {photos.length > 1 && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                title={t("previous")}
                onClick={() => go(-1)}
              >
                <ChevronLeft />
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                {index + 1} / {photos.length}
              </span>
              <Button
                size="sm"
                variant="outline"
                title={t("next")}
                onClick={() => go(1)}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The shell in a dialog, for the modules whose office list opens a record in
 * place rather than on a page of its own (T-369). Wide, because the shell has
 * two columns; scrolls inside itself, so the page behind never moves.
 */
export function RecordDetailDialog({
  title,
  description,
  exportRecord,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  /**
   * 「单独导出」 at the top right of the header (T-386, D-267): this one
   * record as a PDF. Every module passes its own kind, so the button is the
   * same on all of them; `pr-8` keeps it clear of the dialog's close X.
   */
  exportRecord?: {
    kind: ExportableRecordKind;
    recordId: string | null | undefined;
    reference: string;
  } | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader className="flex-row items-start justify-between gap-4 space-y-0 pr-8">
          <div className="min-w-0 space-y-2">
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </div>
          {exportRecord ? (
            <div className="shrink-0">
              <RecordExportButton
                kind={exportRecord.kind}
                recordId={exportRecord.recordId}
                reference={exportRecord.reference}
              />
            </div>
          ) : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
