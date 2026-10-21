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
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Phone,
  Shrink,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useDismissDialog } from "@/components/shared/dialog-navigation";
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
import { useArrowKeys } from "@/hooks/use-arrow-keys";
import type { ArchiveRecordKind } from "@/interfaces/contractor-ops";
import type { RecordedBy } from "@/interfaces/recorder";
import type { ChatRecordKind } from "@/lib/record-chat";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { RecordPdfKind } from "@/services/contractor-ops.service";

export interface ShellPhoto {
  id: string;
  /** The full (stamped) photograph: loaded only when it is opened. */
  url: string;
  /**
   * Its small thumbnail, when the server sent one: what the record's photo
   * strip draws, so opening a record costs a few ~20 KB pictures rather than
   * every full photo (client 2026-10-09 二.4, 五.3). Falls back to `url`.
   */
  thumbnailUrl?: string | null;
  /** What it is, e.g. "Delivery order". Shown under the thumbnail. */
  label: string;
  /** When and where it was taken: build them with `photoMeta` (`@/lib/photo-meta`). */
  takenAt?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  /**
   * Nothing but a list's thumbnail was available, so when and where it was
   * taken is not known here (it is on the record): the viewer says nothing
   * rather than 「未记录时间 · 未记录位置」, which is kept for a photo that
   * really has neither.
   */
  metaUnknown?: boolean;
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

/** 100% is the whole photo fitted in the frame (I21, ID44); 400% the most. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

interface Size {
  width: number;
  height: number;
}

/**
 * The size a photo is drawn at to show all of it in the frame (I21, ID44):
 * its shape kept, neither side over the frame, never blown up past its own
 * pixels. The viewer's 100%; zooming multiplies this.
 */
export function fitSize(photo: Size, frame: Size): Size {
  if (photo.width <= 0 || photo.height <= 0 || frame.width <= 0 || frame.height <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(frame.width / photo.width, frame.height / photo.height, 1);
  return { width: photo.width * scale, height: photo.height * scale };
}

/** The shape a frame takes before its photo has loaded: a phone's 4:3. */
const LOADING_SHAPE: Size = { width: 4, height: 3 };

/**
 * The viewer's room for the photograph (J34-1): the window's height less its
 * title, buttons and margins.
 */
const VIEWER_HEIGHT = "(100dvh - 15rem)";

/**
 * How wide a frame that just holds `photo` is (J34-1, Lucas 10-20: 「框刚好包住
 * 照片」): its own shape, as tall as `height` allows, never wider than the
 * space it is in (`100%`) nor than its own pixels. With `aspect-ratio` set to
 * the same shape, the frame is the photo - no side bands, no hatching.
 */
export function photoFrameWidth(photo: Size, height: string): string {
  const ratio = photo.width / photo.height;
  const pixels = photo === LOADING_SHAPE ? "" : `, ${Math.round(photo.width)}px`;
  return `min(100%, calc(${height} * ${ratio.toFixed(4)})${pixels})`;
}

function ShellThumbnail({ photo, onOpen }: { photo: ShellPhoto; onOpen: () => void }) {
  return (
    <li className="w-20">
      <button
        type="button"
        title={photo.label}
        onClick={onOpen}
        className="relative block size-20 overflow-hidden rounded-lg bg-muted ring-1 ring-panel-border transition hover:shadow-glow-sm hover:ring-primary/60 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Image
          src={photo.thumbnailUrl || photo.url}
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
 *
 * `fromThumbnail`: drawn from the thumbnail - the phone field app, where the
 * full photo loads only when it is opened (client 2026-10-09 二.4, 五.3). The
 * office keeps the full photo here: a 400 px picture across a desktop panel
 * would be softer than before.
 */
function ShellHeroPhoto({
  photo,
  onOpen,
  fromThumbnail,
}: {
  photo: ShellPhoto;
  onOpen: () => void;
  fromThumbnail: boolean;
}) {
  const df = useDateFormat();
  const src = (fromThumbnail && photo.thumbnailUrl) || photo.url;
  // Its own shape once loaded (J34-1 point 3, 图 2): a portrait photo is a
  // portrait frame up to 28rem tall, not a 16:9 crop with bands.
  const [shape, setShape] = useState<(Size & { src: string }) | null>(null);
  const size = shape && shape.src === src ? shape : LOADING_SHAPE;
  return (
    <button
      type="button"
      title={photo.label}
      onClick={onOpen}
      data-shell-hero
      style={{ aspectRatio: `${size.width} / ${size.height}`, width: photoFrameWidth(size, "28rem") }}
      className="relative mx-auto block max-w-full overflow-hidden rounded-xl bg-muted ring-1 ring-panel-border transition hover:shadow-glow-sm hover:ring-primary/60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Image
        src={src}
        alt={photo.label}
        fill
        sizes="(min-width: 1024px) 640px, 100vw"
        className="object-cover"
        unoptimized
        onLoad={(event) => {
          const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
          if (width > 0 && height > 0) setShape({ src, width, height });
        }}
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

/**
 * 记录人 for a record (E8, Q31): the `ShellRecorder` filled from the
 * record's own `created_by_*` fields, the same on every module. A record the
 * server knows no recorder for says so rather than leaving a blank.
 */
export function RecordRecorder({ record }: { record: RecordedBy }) {
  const t = useTranslations("recordShell");
  return (
    <ShellRecorder
      label={t("recorder")}
      name={record.created_by_name || t("recorderUnknown")}
      avatar={record.created_by_avatar}
      phone={record.created_by_phone}
    />
  );
}

/** A panel of the shell, in the canvas's panel surface. */
export function ShellPanel({
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
  aside,
  chat,
  heroFromThumbnail = false,
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
  closure?: { kind: ArchiveRecordKind; recordId: string; onConfirmed?: () => void } | null;
  /** 更正记录, when the record has been corrected. */
  corrections?: React.ReactNode;
  /** 记录人 - usually a `RecordRecorder`. */
  recorder?: React.ReactNode;
  /**
   * The module's own right-column panels, under the buttons and above 签名
   * (E8): a consultant application's approval progress, a hazard's
   * rectification, a task's result. Left of them stays the evidence.
   */
  aside?: React.ReactNode;
  /**
   * A conversation the module draws itself, in the 事项沟通 place - a
   * hazard's room (`HazardConversationPanel`), which is the hazard rather
   * than a panel beside it. Use `conversation` for every other kind.
   */
  chat?: React.ReactNode;
  /**
   * The phone field app: the large first photo is drawn from its thumbnail
   * too, so nothing full size loads until a photo is opened (client
   * 2026-10-09 二.4, 五.3). Off for the office, whose first photo stays
   * full size; the small strip uses thumbnails everywhere.
   */
  heroFromThumbnail?: boolean;
}) {
  const t = useTranslations("recordShell");
  const [open, setOpen] = useState<number | null>(null);
  const hasAside = Boolean(
    actions || closure || aside || signatures.length > 0 || conversation || chat,
  );
  // Which photograph sits in the large place (H8, HD16): pressing a
  // thumbnail swaps it there; pressing the large one opens the viewer from it.
  const [heroChoice, setHeroIndex] = useState(0);
  const heroIndex = photos && heroChoice < photos.length ? heroChoice : 0;
  const hero = photos?.[heroIndex];
  const rest = (photos ?? [])
    .map((photo, index) => ({ photo, index }))
    .filter(({ index }) => index !== heroIndex);

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
                  {hero ? (
                    <ShellHeroPhoto
                      photo={hero}
                      onOpen={() => setOpen(heroIndex)}
                      fromThumbnail={heroFromThumbnail}
                    />
                  ) : null}
                  {/* The rest small (「照片需要很小很小」): a thumbnail is a
                      pointer, the evidence is the full image in the viewer.
                      Pressing one brings it up large in place (HD16). */}
                  {rest.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {rest.map(({ photo, index }) => (
                        <ShellThumbnail key={photo.id} photo={photo} onOpen={() => setHeroIndex(index)} />
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
                  <RecordClosurePanel
                    kind={closure.kind}
                    recordId={closure.recordId}
                    onConfirmed={closure.onConfirmed}
                  />
                ) : null}
              </ShellPanel>
            ) : null}
            {aside ? <div className="order-6 min-w-0 space-y-4">{aside}</div> : null}
            {signatures.length > 0 && (
              <ShellPanel title={t("signatures")} className="order-7">
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
              <div className="order-8 min-w-0">
                <RecordAttachmentsPanel kind={conversation.kind} recordId={conversation.recordId} />
              </div>
            ) : null}
            {conversation ? (
              <ShellPanel title={t("conversation")} className="order-9">
                <RecordConversationPanel
                  kind={conversation.kind}
                  recordId={conversation.recordId}
                />
              </ShellPanel>
            ) : null}
            {chat ? (
              <ShellPanel title={t("conversation")} className="order-9">
                {chat}
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
 * It opens whole (I21, ID44 - 「点照片只显示完整照片，现有的照片太大了」): the
 * photo is fitted into the frame, its shape kept, with no scroll bar, and
 * that is 100%. Zooming is relative to that whole view - 150% to 400% - and
 * only then does the frame scroll, so the reader pans by scrolling: no
 * gesture library, nothing to learn. 「整张显示」 and turning to another photo
 * both go back to the whole photo. Neighbours stay one press away because a
 * delivery note is usually checked against the one before it. Preview,
 * print and download sit under the picture (D-236). One viewer for every
 * screen, so all of them changed together (ID22's rule).
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
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const photo = photos[index];
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<Size | null>(null);
  // The photo's own pixels, kept with the address they belong to so the
  // next photo is never sized by the last one's shape.
  const [natural, setNatural] = useState<(Size & { url: string }) | null>(null);
  const step = (by: number) =>
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + by)));
  const go = (by: number) => {
    setZoom(MIN_ZOOM);
    onIndex((index + by + photos.length) % photos.length);
  };
  // ← and → turn the photographs too (I9: over a daily report they are the photo's, not the report's).
  useArrowKeys(go, { enabled: photos.length > 1 });
  // On a phone a sideways swipe turns them (J34-1 point 5), while it is whole.
  const swipe = useRef<number | null>(null);

  useEffect(() => {
    const node = frameRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const watcher = new ResizeObserver(([entry]) => {
      if (entry) setFrame({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const whole = zoom <= MIN_ZOOM;
  const loaded = natural && natural.url === photo.url ? natural : null;
  const fitted = frame && loaded ? fitSize(loaded, frame) : null;
  // The last photo's shape while the next one loads, so the frame does not
  // jump to 4:3 and back between two portrait photos.
  const [lastShape, setLastShape] = useState<Size>(LOADING_SHAPE);
  const shape = loaded ?? lastShape;
  const frameWidth = photoFrameWidth(shape, VIEWER_HEIGHT);
  // Enlarged: the fitted size times the zoom, so 200% is twice the whole
  // photo. Until the frame has been measured, the frame's width stands in.
  const enlarged: React.CSSProperties = fitted
    ? {
        width: `${fitted.width * zoom}px`,
        height: `${fitted.height * zoom}px`,
        maxWidth: "none",
        maxHeight: "none",
      }
    : { width: `${zoom * 100}%`, height: "auto", maxWidth: "none", maxHeight: "none" };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      {/* As wide as the frame plus the dialog's own padding (J34-1 point 2):
          the title and buttons sit over and under the photo, no wider. Never
          narrower than its buttons need. */}
      <DialogContent
        data-photo-viewer
        className="transition-[width] duration-200 sm:w-(--viewer-width) sm:max-w-[min(calc(100vw-2rem),72rem)]"
        style={
          {
            "--viewer-width": `max(22rem, calc(${frameWidth.replace("100%", "100vw - 4rem")} + 2rem))`,
          } as React.CSSProperties
        }
      >
        <DialogHeader>
          <DialogTitle>{photo.label}</DialogTitle>
          <DialogDescription>
            {photo.metaUnknown
              ? reference
              : [
                  photo.takenAt ? df.dateTime(photo.takenAt) : t("noTime"),
                  photo.latitude && photo.longitude
                    ? `GPS ${photo.latitude}, ${photo.longitude}`
                    : t("noLocation"),
                ].join(" · ")}
          </DialogDescription>
        </DialogHeader>
        {/* The frame is the photograph (J34-1, Lucas 10-20): its shape, as
            large as the window allows, so a portrait photo stands in a
            portrait frame - no bands of hatching either side. It keeps that
            size while zoomed, and scrolls. */}
        <div
          ref={frameRef}
          data-photo-frame={whole ? "whole" : "zoomed"}
          style={{ aspectRatio: `${shape.width} / ${shape.height}`, width: frameWidth }}
          className={cn(
            "mx-auto flex max-w-full rounded-xl bg-muted ring-1 ring-panel-border transition-[width] duration-200",
            whole ? "items-center justify-center overflow-hidden" : "overflow-auto",
          )}
          onTouchStart={(event) => {
            swipe.current = whole && event.touches.length === 1 ? event.touches[0].clientX : null;
          }}
          onTouchEnd={(event) => {
            const from = swipe.current;
            swipe.current = null;
            const to = event.changedTouches[0]?.clientX;
            if (from === null || to === undefined || photos.length < 2) return;
            if (Math.abs(to - from) > 50) go(to < from ? 1 : -1);
          }}
        >
          {/* A plain img: whole, it fills the frame cut to its own shape;
              enlarged, it is a size, which scrolls. The stamped copy is
              shown, because it is the evidence. `m-auto` centres it while it
              is smaller than the frame and lets it scroll from its edge once
              it is larger. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={photo.url}
            src={photo.url}
            alt={photo.label}
            data-photo-zoom={Math.round(zoom * 100)}
            onLoad={(event) => {
              const size = {
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              };
              setNatural({ url: photo.url, ...size });
              if (size.width > 0 && size.height > 0) setLastShape(size);
            }}
            style={whole ? undefined : enlarged}
            className={cn(
              "block",
              whole ? "size-full max-h-full max-w-full object-contain" : "m-auto object-contain",
            )}
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
              title={t("fitWhole")}
              data-photo-fit-whole
              onClick={() => setZoom(MIN_ZOOM)}
            >
              <Shrink />
              {t("fitWhole")}
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

/** What the header of a record detail says, in a dialog or on a page. */
export interface RecordDetailHeaderProps {
  /** The record's short number, large (Q12), or the module's name for it. */
  title: string;
  description?: string;
  /** The record's status pill, beside the number. */
  status?: React.ReactNode;
  /** The line under it: full reference, module, date and time, recorder. */
  caption?: React.ReactNode;
  /**
   * Record No. (I6) of a record whose title is something else - a machine,
   * a phase - so the number is on the detail too.
   */
  recordNo?: string | null;
  /** 预览 / 打印, 分享 and the like, left of 「单独导出」. */
  headerActions?: React.ReactNode;
  /**
   * 「单独导出」 at the top right of the header (T-386, D-267): this one
   * record as a PDF. Every module passes its own kind, so the button is the
   * same on all of them; `pr-8` keeps it clear of the dialog's close X.
   */
  exportRecord?: {
    kind: RecordPdfKind;
    recordId: string | null | undefined;
    reference: string;
    /** Where the record opens, for a kind `recordTarget` does not route. */
    href?: string;
  } | null;
}

/**
 * The canvas's 记录详情 header (E8, Q31): the short number with its status,
 * the full reference line under it, and on the right 预览/打印 · 导出 PDF ·
 * 分享 - whichever the record has. One drawing for the dialog and the page,
 * so the two cannot drift; only the title element differs (a dialog's title
 * must be the dialog's own, for the screen reader).
 */
/**
 * 「记录编号」 under the heading (I6, ID21). One number per record (J15-1,
 * Q15): the 「旧编号」 from before I6 is no longer shown or searched.
 */
export function RecordNumbers({ recordNo }: { recordNo?: string | null }) {
  const t = useTranslations("recordNo");
  if (!recordNo) return null;
  return (
    <dl className="tabular flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
      {recordNo ? (
        <div className="flex gap-1">
          <dt>{t("column")}</dt>
          <dd className="font-medium text-foreground">{recordNo}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function RecordDetailHeading({
  title,
  description,
  status,
  caption,
  recordNo,
  headerActions,
  exportRecord,
  inDialog,
}: RecordDetailHeaderProps & { inDialog: boolean }) {
  const titleClass = "tabular text-xl font-bold leading-tight sm:text-2xl";
  const heading = (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        {inDialog ? (
          <DialogTitle className={titleClass}>{title}</DialogTitle>
        ) : (
          <h1 className={cn(titleClass, "text-foreground")}>{title}</h1>
        )}
        {status}
      </div>
      {description ? (
        inDialog ? (
          <DialogDescription>{description}</DialogDescription>
        ) : (
          <p className="text-sm text-muted-foreground">{description}</p>
        )
      ) : null}
      {caption ? (
        <div className="tabular text-xs text-muted-foreground">{caption}</div>
      ) : null}
      <RecordNumbers recordNo={recordNo} />
    </div>
  );
  const actions =
    headerActions || exportRecord ? (
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {headerActions}
        {exportRecord ? (
          <RecordExportButton
            kind={exportRecord.kind}
            recordId={exportRecord.recordId}
            reference={exportRecord.reference}
            href={exportRecord.href}
          />
        ) : null}
      </div>
    ) : null;
  const frame =
    "flex-row flex-wrap items-start justify-between gap-4 space-y-0 border-b border-panel-border pb-4";
  return inDialog ? (
    <DialogHeader className={cn(frame, "pr-8")} data-record-detail-header>
      {heading}
      {actions}
    </DialogHeader>
  ) : (
    <div className={cn("flex", frame)} data-record-detail-header>
      {heading}
      {actions}
    </div>
  );
}

/**
 * The shell in a dialog, for the modules whose office list opens a record in
 * place rather than on a page of its own (T-369). Wide, because the shell has
 * two columns; scrolls inside itself, so the page behind never moves.
 *
 * Since E8 (Q31) every business record opens here - 「以弹窗显示（跟改设计前
 * 一样）」 - the receipt and the consultant application included.
 */
export function RecordDetailDialog({
  onClose,
  children,
  ...header
}: RecordDetailHeaderProps & {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-record-detail="dialog"
        className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl xl:max-w-6xl"
      >
        <RecordDetailHeading {...header} inDialog />
        {children}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The same frame on a page of its own: a record's address typed, bookmarked
 * or opened from a notification (`/receipts/<id>`). The header and the shell
 * are the dialog's; the only addition is the way back to the list, which a
 * dialog does not need because the list is still behind it.
 */
export function RecordDetailPage({
  backHref,
  backLabel,
  children,
  ...header
}: RecordDetailHeaderProps & {
  backHref: string;
  backLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div data-record-detail="page" className="mx-auto max-w-6xl space-y-4 pb-8">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {backLabel}
      </Link>
      <RecordDetailHeading {...header} inDialog={false} />
      {children}
    </div>
  );
}

/**
 * Dialog or page, for a detail that can be either: a record with an address
 * of its own opens in the dialog from inside the app and on the page from a
 * link (T-243). `onClose` defaults to going back, which is how the dialog
 * of an intercepted address closes.
 */
export function RecordDetailFrame({
  presentation,
  onClose,
  backHref,
  backLabel,
  ...rest
}: RecordDetailHeaderProps & {
  presentation: "dialog" | "page";
  onClose?: () => void;
  backHref: string;
  backLabel: string;
  children: React.ReactNode;
}) {
  // Back when there is somewhere to go, `backHref` otherwise - the same rule
  // as every other intercepted dialog (`dialog-navigation.tsx`).
  const dismiss = useDismissDialog(backHref, presentation);
  return presentation === "dialog" ? (
    <RecordDetailDialog {...rest} onClose={onClose ?? dismiss} />
  ) : (
    <RecordDetailPage {...rest} backHref={backHref} backLabel={backLabel} />
  );
}
