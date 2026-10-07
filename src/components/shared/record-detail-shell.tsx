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
 *   reading, for instance), then the record's **general attachments** (B28 -
 *   every record that has a conversation has them), then **signatures if the
 *   module has any**
 *   (「没有签名就不需要放」), then **the action buttons** (「那些按钮放在图 2 的
 *   圈起来的位置」), then the record's **【确认归档】** once its own steps
 *   are done (2026-10 C4 - it used to live only in 现场记录中心);
 * * **the record's conversation** underneath (C-014, D-233) - every module has
 *   one, like the hazard room.
 */

import {
  ChevronLeft,
  ChevronRight,
  Phone,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

import { EvidenceFileActions } from "@/components/shared/evidence-file-actions";
import { RecordAttachmentsPanel } from "@/components/shared/record-attachments";
import { RecordClosurePanel } from "@/components/shared/record-closure";
import { RecordConversationPanel } from "@/components/shared/record-conversation";
import { RecordExportButton } from "@/components/shared/record-export-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ArchiveRecordKind } from "@/interfaces/contractor-ops";
import type { ChatRecordKind } from "@/lib/record-chat";
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
  /** Which of `photoGroups` it is shown under, when the record has stages. */
  group?: string;
}

/** One row of photographs, e.g. one stage of a disposal (B23). */
export interface ShellPhotoGroup {
  key: string;
  label: string;
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

function ShellThumbnail({ photo, onOpen }: { photo: ShellPhoto; onOpen: () => void }) {
  return (
    <li className="w-20">
      <button
        type="button"
        title={photo.label}
        onClick={onOpen}
        className="photo-hatch relative block size-20 overflow-hidden rounded-lg border border-panel-border transition hover:border-primary/60 hover:shadow-glow-sm focus-visible:ring-2 focus-visible:ring-ring"
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
      <p className="mt-1 truncate text-[11px] text-muted-foreground">
        {photo.label}
      </p>
    </li>
  );
}

/**
 * The first photograph, large (the canvas's 现场照片 panel): the picture a
 * reader checks first, with what it is and when it was taken over its corner.
 * The rest stay small beside it.
 */
function ShellHeroPhoto({ photo, onOpen }: { photo: ShellPhoto; onOpen: () => void }) {
  const df = useDateFormat();
  return (
    <button
      type="button"
      title={photo.label}
      onClick={onOpen}
      data-shell-hero
      className="photo-hatch relative block aspect-video w-full overflow-hidden rounded-xl border border-panel-border transition hover:border-primary/60 hover:shadow-glow-sm focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Image
        src={photo.url}
        alt={photo.label}
        fill
        sizes="(min-width: 1024px) 640px, 100vw"
        className="object-cover"
        unoptimized
      />
      <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-md bg-overlay px-2 py-1 text-xs text-overlay-foreground">
        {photo.label}
        {photo.takenAt ? ` · ${df.dateTime(photo.takenAt)}` : ""}
      </span>
    </button>
  );
}

/**
 * Who recorded it (the 记录人 block): avatar, name, and the number to call
 * about a disputed record, tap-to-call. The words are the caller's.
 */
export function ShellRecorder({
  label,
  name,
  avatar,
  phone,
}: {
  label: string;
  name: string;
  avatar?: string | null;
  phone?: string | null;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div data-shell-recorder className="flex min-w-0 items-center gap-3">
      <Avatar className="size-10">
        {avatar ? <AvatarImage src={avatar} alt="" /> : null}
        <AvatarFallback className="bg-primary/12 text-xs font-semibold text-primary">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{name}</p>
      </div>
      {phone ? (
        <a
          href={`tel:${phone.replace(/[^+\d]/g, "")}`}
          className="ml-auto inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-input px-3 text-sm text-primary hover:border-primary/50 hover:bg-accent pointer-coarse:h-11"
        >
          <Phone className="size-4" />
          <span className="tabular">{phone}</span>
        </a>
      ) : null}
    </div>
  );
}

/** A panel of the shell, in the canvas's panel surface. */
function ShellPanel({
  title,
  aside,
  className,
  children,
  ...rest
}: {
  title?: string;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
} & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <section className={cn("surface-panel min-w-0 rounded-xl p-4", className)} {...rest}>
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="panel-title">{title}</h3>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function RecordDetailShell({
  reference,
  facts,
  photos,
  photoGroups,
  emptyGroupLabel,
  photoActions,
  panel,
  signatures = [],
  actions,
  notices,
  conversation,
  closure,
  corrections,
  recorder,
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
  /**
   * Rows to sort the photographs into, in order, each under its own heading
   * (B23: 「同一清运 ID 按申请、装车／工地出场、最终处理证明分区查看」). A
   * group with nothing in it still shows, saying so, because "no final proof
   * yet" is exactly what a reader of that row is checking.
   */
  photoGroups?: ShellPhotoGroup[];
  emptyGroupLabel?: string;
  /** Under the thumbnails, e.g. the office's 【上传文件】. */
  photoActions?: React.ReactNode;
  /** The module's own information panel (a receipt's delivery-order reading). */
  panel?: React.ReactNode;
  /** Only rendered when there is at least one. */
  signatures?: ShellSignature[];
  /** The decision buttons: 验收 / 确认 / approve, with their arming switch. */
  actions?: React.ReactNode;
  /** Banners above everything (superseded, overdue, closed...). */
  notices?: React.ReactNode;
  conversation?: { kind: ChatRecordKind; recordId: string } | null;
  /**
   * The record's 【确认归档】 (2026-10 C4): under the buttons, offered once
   * the record's own steps are done. Left out for a record that closes
   * another way - a hazard closes by its raiser's 确认完成.
   */
  closure?: { kind: ArchiveRecordKind; recordId: string } | null;
  /** 更正记录, when the record has been corrected. */
  corrections?: React.ReactNode;
  /** 记录人 - usually a `ShellRecorder`. */
  recorder?: React.ReactNode;
}) {
  const t = useTranslations("recordShell");
  const [open, setOpen] = useState<number | null>(null);
  const hasAside = Boolean(
    actions || closure || signatures.length > 0 || conversation,
  );
  const [hero, ...rest] = photos ?? [];

  /*
   * The canvas's 记录详情 frame (ReceiptDetail artboard), the same for every
   * module; only what is in it differs.
   *
   * Wide screen: two columns. Left, the evidence and the facts - 现场照片,
   * the information grid, the module's own panel, 更正记录. Right, what a
   * reader does about it - the decision buttons, 签名, attachments and the
   * record's conversation.
   *
   * Phone: one column, in reading order - photographs first, then the
   * decision buttons (so the one thing to press is never below a long list of
   * facts), then the facts, then the rest. The two column wrappers dissolve
   * (`contents`) and each panel takes its place by `order`.
   */
  return (
    <div className="space-y-4">
      {notices}
      <div
        className={cn(
          "flex flex-col gap-4",
          hasAside && "lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start",
        )}
      >
        <div className="min-w-0 max-lg:contents lg:space-y-4">
          {photos ? (
            <ShellPanel
              title={t("photos")}
              className="order-1"
              aside={
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t("photoCount", { count: photos.length })}
                </span>
              }
            >
              {photoGroups ? (
                <div className="space-y-4">
                  {photoGroups.map((group) => {
                    const inGroup = photos
                      .map((photo, index) => ({ photo, index }))
                      .filter(({ photo }) => photo.group === group.key);
                    return (
                      <div key={group.key} data-photo-group={group.key}>
                        <p className="mb-2 text-xs font-medium text-foreground">
                          {group.label}
                          <span className="ml-1 tabular-nums text-muted-foreground">({inGroup.length})</span>
                        </p>
                        {inGroup.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{emptyGroupLabel ?? t("noPhotos")}</p>
                        ) : (
                          <ul className="flex flex-wrap gap-2">
                            {inGroup.map(({ photo, index }) => (
                              <ShellThumbnail key={photo.id} photo={photo} onOpen={() => setOpen(index)} />
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : photos.length === 0 ? (
                <p className="rounded-lg border border-dashed border-panel-border px-3 py-4 text-sm text-muted-foreground">
                  {t("noPhotos")}
                </p>
              ) : (
                <div className="space-y-3">
                  <ShellHeroPhoto photo={hero} onOpen={() => setOpen(0)} />
                  {/* The rest small (「照片需要很小很小」): a thumbnail is a
                      pointer, the evidence is the full image in the viewer. */}
                  {rest.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {rest.map((photo, index) => (
                        <ShellThumbnail key={photo.id} photo={photo} onOpen={() => setOpen(index + 1)} />
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
              {photoActions ? <div className="mt-3">{photoActions}</div> : null}
            </ShellPanel>
          ) : null}

          {facts.length > 0 || recorder ? (
            <ShellPanel className="order-3" data-shell-facts>
              {facts.length > 0 ? (
                <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                  {facts.map((fact) => (
                    <div
                      key={fact.label}
                      className={cn("min-w-0", fact.wide && "sm:col-span-2 xl:col-span-3")}
                    >
                      <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                      <dd className="mt-1 break-words text-[0.9375rem] font-medium leading-snug">
                        {fact.value || "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {recorder ? (
                <div className={cn(facts.length > 0 && "mt-4 border-t border-panel-border pt-4")}>
                  {recorder}
                </div>
              ) : null}
            </ShellPanel>
          ) : null}

          {panel ? <div className="order-4 min-w-0">{panel}</div> : null}
          {corrections ? <div className="order-5 min-w-0">{corrections}</div> : null}
        </div>

        {hasAside ? (
          <aside className="min-w-0 max-lg:contents lg:space-y-4">
            {actions || closure ? (
              <ShellPanel
                className="order-2 space-y-3 border-primary/40 shadow-glow-sm"
                data-shell-actions
              >
                {actions}
                {closure ? (
                  <RecordClosurePanel kind={closure.kind} recordId={closure.recordId} />
                ) : null}
              </ShellPanel>
            ) : null}
            {signatures.length > 0 && (
              <ShellPanel title={t("signatures")} className="order-6">
                <div className="grid grid-cols-2 gap-3">
                  {signatures.map((signature) => (
                    <figure key={signature.label} className="space-y-1">
                      {/* Ink on paper in both modes: a signature is a
                          document, not a theme surface. */}
                      <div className="relative aspect-3/1 overflow-hidden rounded-lg border border-panel-border bg-switch-thumb">
                        <Image
                          src={signature.url}
                          alt={signature.label}
                          fill
                          sizes="160px"
                          className="object-contain"
                          unoptimized
                        />
                      </div>
                      <figcaption className="text-xs text-muted-foreground">
                        {signature.label}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </ShellPanel>
            )}
            {conversation ? (
              <div className="order-7 min-w-0">
                <RecordAttachmentsPanel kind={conversation.kind} recordId={conversation.recordId} />
              </div>
            ) : null}
            {conversation ? (
              <ShellPanel title={t("conversation")} className="order-8">
                <RecordConversationPanel
                  kind={conversation.kind}
                  recordId={conversation.recordId}
                />
              </ShellPanel>
            ) : null}
          </aside>
        ) : null}
      </div>

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
export function PhotoViewer({
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
        <div className="photo-hatch max-h-[65dvh] min-h-[40dvh] overflow-auto rounded-xl border border-panel-border">
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
  status,
  caption,
  headerActions,
  exportRecord,
  onClose,
  children,
}: {
  /** The record's short number, large (Q12), or the module's name for it. */
  title: string;
  description?: string;
  /** The record's status pill, beside the number. */
  status?: React.ReactNode;
  /** The line under it: full reference, module, date and time, recorder. */
  caption?: React.ReactNode;
  /** 预览 / 打印, 分享 and the like, left of 「单独导出」. */
  headerActions?: React.ReactNode;
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
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl xl:max-w-6xl">
        <DialogHeader className="flex-row flex-wrap items-start justify-between gap-4 space-y-0 border-b border-panel-border pb-4 pr-8">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <DialogTitle className="tabular text-xl font-bold leading-tight sm:text-2xl">{title}</DialogTitle>
              {status}
            </div>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
            {caption ? (
              <div className="tabular text-xs text-muted-foreground">{caption}</div>
            ) : null}
          </div>
          {headerActions || exportRecord ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {headerActions}
              {exportRecord ? (
                <RecordExportButton
                  kind={exportRecord.kind}
                  recordId={exportRecord.recordId}
                  reference={exportRecord.reference}
                />
              ) : null}
            </div>
          ) : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
