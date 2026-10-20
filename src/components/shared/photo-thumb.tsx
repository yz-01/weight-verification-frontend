"use client";

/**
 * A list row's photograph (E3, 「整个系统用照片说话」).
 *
 * The client, circling the material receipt list: 「不要整页都是字」 - each row
 * shows the record's photograph between its text columns, and the whole system
 * works like that. This is that photograph: a 48×48 rounded thumbnail (the
 * backend's watermarked 240 px copy, `cover_photo_url`), the number of
 * photographs on the record over its bottom-right corner, and a click that
 * opens the same `PhotoViewer` the record's own page uses, on all of them.
 *
 * A record with no photograph shows its module's icon - never a blank square,
 * which reads as "the picture failed to load".
 *
 * The full set is passed when the row already carries it, or fetched the first
 * time the thumbnail is opened (`photos` as a function) - a list never reads
 * every photograph of every row just to show one.
 */

import type { ColumnDef } from "@tanstack/react-table";
import {
  ChartNoAxesCombined,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  FileText,
  HardHat,
  Image as ImageIcon,
  ListTodo,
  MapPin,
  PackageMinus,
  ReceiptText,
  Recycle,
  ShieldAlert,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useContext, useState } from "react";

import { InsideRowControl, StripFillsWidth } from "@/components/shared/inside-row-control";
import { PhotoViewer, type ShellPhoto } from "@/components/shared/record-detail-shell";
import { photoMeta, type PhotoMetaSource } from "@/lib/photo-meta";
import { cn } from "@/lib/utils";
import { getCategoryRecord } from "@/services/contractor-ops.service";
import type { CategoryRecordKind } from "@/interfaces/contractor-ops";

export type PhotoThumbPhotos = ShellPhoto[] | (() => Promise<ShellPhoto[]>);

export interface PhotoThumbProps {
  /** The row's `cover_photo_url`. */
  coverUrl: string | null | undefined;
  /** The row's `photo_count`. */
  count?: number | null;
  /** The module's icon, shown when there is no photograph. */
  icon: LucideIcon;
  /** The record's number, for the viewer's title, file names and the label. */
  reference: string;
  /**
   * Every photograph of the record, or how to fetch them on open. Without it
   * the thumbnail is a picture only: there is nothing of the record's to open,
   * and the viewer would only blow the 240 px thumbnail up (audit #4).
   */
  photos?: PhotoThumbPhotos;
  /** 48 px in a list (default); 40 px in the dashboard's compact rows. */
  size?: "md" | "sm";
  /**
   * False inside something that is itself a button (a phone card that opens
   * its record): the picture is shown, the card's own click opens the record.
   * Inside a `DataTable` row that opens its record this is the default
   * (`InsideRowControl`, audit #11).
   */
  openable?: boolean;
  className?: string;
}

const SIZE = { md: "size-12", sm: "size-10" } as const;

export function PhotoThumb({
  coverUrl,
  count,
  icon: Icon,
  reference,
  photos,
  size = "md",
  openable: openableProp,
  className,
}: PhotoThumbProps) {
  const t = useTranslations("photos");
  const insideRowControl = useContext(InsideRowControl);
  const openable = (openableProp ?? !insideRowControl) && photos !== undefined;
  const [opened, setOpened] = useState<{ photos: ShellPhoto[]; index: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const total = count ?? 0;

  if (!coverUrl) {
    return (
      <span
        role="img"
        aria-label={t("none")}
        title={t("none")}
        data-photo-thumb="none"
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg border border-panel-border bg-muted text-muted-foreground",
          SIZE[size],
          className,
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
    );
  }

  // The (stamped) thumbnail itself when the record's photographs cannot be
  // fetched, or none of them has a stamped copy - better than nothing.
  // Only the thumbnail is known here, not when or where it was taken: the
  // viewer then says nothing about either rather than 「未记录」.
  const fallback: ShellPhoto[] = [
    { id: "cover", url: coverUrl, label: reference, metaUnknown: true },
  ];

  const open = async (event: React.MouseEvent) => {
    // A list row opens its record on click; the photograph opens the viewer.
    event.stopPropagation();
    event.preventDefault();
    if (!photos) return;
    if (Array.isArray(photos)) {
      setOpened({ photos: photos.length ? photos : fallback, index: 0 });
      return;
    }
    setLoading(true);
    try {
      const loaded = await photos();
      setOpened({ photos: loaded.length ? loaded : fallback, index: 0 });
    } catch {
      setOpened({ photos: fallback, index: 0 });
    } finally {
      setLoading(false);
    }
  };

  const label = `${t("open", { reference })} · ${t("count", { count: total })}`;
  const picture = (
    <>
      <Image
        src={coverUrl}
        alt=""
        fill
        sizes={size === "md" ? "48px" : "40px"}
        className="object-cover"
        unoptimized
      />
      {total > 1 ? (
        <span
          aria-hidden
          className="absolute bottom-0.5 right-0.5 rounded-md bg-overlay px-1 text-2xs font-semibold leading-4 text-overlay-foreground tabular-nums"
        >
          {total}
        </span>
      ) : null}
    </>
  );
  if (!openable) {
    return (
      <span
        role="img"
        aria-label={t("count", { count: total })}
        data-photo-thumb="photo"
        className={cn(
          "photo-hatch relative block shrink-0 overflow-hidden rounded-lg border border-panel-border",
          SIZE[size],
          className,
        )}
      >
        {picture}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={label}
        title={label}
        aria-busy={loading || undefined}
        data-photo-thumb="photo"
        className={cn(
          "photo-hatch relative block shrink-0 overflow-hidden rounded-lg border border-panel-border transition hover:border-primary/60 hover:shadow-glow-sm focus-visible:ring-2 focus-visible:ring-ring",
          SIZE[size],
          loading && "opacity-60",
          className,
        )}
      >
        {picture}
      </button>
      {opened ? (
        <PhotoViewer
          photos={opened.photos}
          index={opened.index}
          reference={reference}
          onIndex={(index) => setOpened((current) => (current ? { ...current, index } : current))}
          onClose={() => setOpened(null)}
        />
      ) : null}
    </>
  );
}

/** The squares a list row's strip shows at most (J34-2: 「最少看到四张照片一排」). */
export const STRIP_SQUARES = 4;

export interface PhotoStripProps {
  /** The row's `photo_thumbs`, cover first. */
  thumbs: ReadonlyArray<string> | null | undefined;
  /** The row's `cover_photo_url`, for a row sent without `photo_thumbs`. */
  coverUrl?: string | null;
  /** The row's `photo_count`: the 「+N」 is counted from it. */
  count?: number | null;
  /** The module's icon, shown when there is no photograph. */
  icon: LucideIcon;
  /** The record's number, for the viewer's title, file names and labels. */
  reference: string;
  /** As `PhotoThumb`: every photograph of the record, or how to fetch them. */
  photos?: PhotoThumbPhotos;
  /** Squares at most; the last is 「+N」 when there are more photographs. */
  squares?: number;
  /** As `PhotoThumb`. */
  openable?: boolean;
  className?: string;
}

/**
 * A row's photographs, side by side (J34-2, 图 3 / 图 4).
 *
 * The client: 「不要看到一大串文字，系统是为照片为主，最少看到四张照片一排」.
 * Up to four equal squares cut to fill (`object-cover`) - a strip is for
 * finding the record, the viewer shows each photo whole (J34-1) - with the
 * last one 「+N」 when the record has more. Each opens the viewer at itself,
 * the 「+N」 at the first photo it stands for. No photograph: the module's
 * icon, as `PhotoThumb`.
 *
 * In a table the squares are 56 px, so a list with four of them still fits a
 * 1366 px screen without scrolling sideways (I39); on a phone card
 * (`StripFillsWidth`) the four share the card's width.
 */
export function PhotoStrip({
  thumbs,
  coverUrl,
  count,
  icon: Icon,
  reference,
  photos,
  squares = STRIP_SQUARES,
  openable: openableProp,
  className,
}: PhotoStripProps) {
  const t = useTranslations("photos");
  const insideRowControl = useContext(InsideRowControl);
  const fills = useContext(StripFillsWidth);
  const openable = (openableProp ?? !insideRowControl) && photos !== undefined;
  const [opened, setOpened] = useState<{ photos: ShellPhoto[]; index: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const list = thumbs && thumbs.length > 0 ? thumbs : coverUrl ? [coverUrl] : [];
  const total = Math.max(count ?? 0, list.length);
  const square = fills ? "aspect-square w-full" : "size-14";

  if (list.length === 0) {
    return (
      <span
        role="img"
        aria-label={t("none")}
        title={t("none")}
        data-photo-strip="none"
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-panel-border",
          square,
          className,
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
    );
  }

  // Every square a photograph while they fit; else the last says 「+N」.
  const shown = total > squares ? list.slice(0, squares - 1) : list.slice(0, squares);
  const more = total - shown.length;
  const behindMore = list[shown.length] ?? null;

  const open = async (index: number, event: React.MouseEvent) => {
    // A list row opens its record on click; a photograph opens the viewer.
    event.stopPropagation();
    event.preventDefault();
    if (!photos) return;
    const fallback: ShellPhoto[] = list.map((url, at) => ({
      id: `thumb-${at}`,
      url,
      label: reference,
      metaUnknown: true,
    }));
    const at = (all: ShellPhoto[]) => ({ photos: all, index: Math.min(index, all.length - 1) });
    if (Array.isArray(photos)) {
      setOpened(at(photos.length ? photos : fallback));
      return;
    }
    setLoading(true);
    try {
      const loaded = await photos();
      setOpened(at(loaded.length ? loaded : fallback));
    } catch {
      setOpened(at(fallback));
    } finally {
      setLoading(false);
    }
  };

  const cell = cn(
    "relative block shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-panel-border",
    square,
    openable && "transition hover:shadow-glow-sm hover:ring-primary/60 focus-visible:ring-2 focus-visible:ring-ring",
    loading && "opacity-60",
  );
  const picture = (url: string) => (
    <Image src={url} alt="" fill sizes="80px" className="object-cover" unoptimized />
  );
  const squaresDrawn = [
    ...shown.map((url, index) => ({ key: `photo-${index}`, index, url, label: null as string | null })),
    ...(more > 0 ? [{ key: "more", index: shown.length, url: behindMore, label: `+${more}` }] : []),
  ];
  return (
    <>
      <span
        role={openable ? "group" : "img"}
        aria-label={`${reference} · ${t("count", { count: total })}`}
        data-photo-strip="photos"
        className={cn(
          fills ? "grid w-full max-w-84 grid-cols-4 gap-1.5" : "inline-flex shrink-0 gap-1.5",
          className,
        )}
      >
        {squaresDrawn.map(({ key, index, url, label }) => {
          const inner = (
            <>
              {url ? picture(url) : null}
              {label ? (
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center bg-overlay/70 text-sm font-semibold text-overlay-foreground tabular-nums"
                >
                  {label}
                </span>
              ) : null}
            </>
          );
          return openable ? (
            <button
              key={key}
              type="button"
              onClick={(event) => void open(index, event)}
              aria-label={label ? t("more", { count: more }) : t("open", { reference })}
              title={label ? t("more", { count: more }) : t("open", { reference })}
              aria-busy={loading || undefined}
              data-photo-square={label ? "more" : "photo"}
              className={cell}
            >
              {inner}
            </button>
          ) : (
            <span key={key} data-photo-square={label ? "more" : "photo"} className={cell}>
              {inner}
            </span>
          );
        })}
      </span>
      {opened ? (
        <PhotoViewer
          photos={opened.photos}
          index={opened.index}
          reference={reference}
          onIndex={(index) => setOpened((current) => (current ? { ...current, index } : current))}
          onClose={() => setOpened(null)}
        />
      ) : null}
    </>
  );
}

/** One photograph as a record's page, the archive and a list row send it. */
export interface ListedPhoto extends PhotoMetaSource {
  id?: string | null;
  url?: string | null;
  thumbnail_url?: string | null;
  caption?: string | null;
}

/**
 * Photographs as a record's page and the archive send them, for the viewer:
 * each with its time and GPS (`photoMeta`), and the record's own fix
 * (`record`) for a photo that was sent without one.
 */
export function toShellPhotos(
  list: ReadonlyArray<ListedPhoto>,
  label: string,
  record?: PhotoMetaSource | null,
): ShellPhoto[] {
  return list
    .filter((photo): photo is ListedPhoto & { url: string } => Boolean(photo.url))
    .map((photo, index) => ({
      id: photo.id || `${index}`,
      url: photo.url,
      thumbnailUrl: photo.thumbnail_url ?? null,
      label: photo.caption || label,
      ...photoMeta(photo, record),
    }));
}

/**
 * The name a list row calls its kind by, as the record sheet knows it - the
 * dashboard and the record centre say the same thing several ways.
 */
const SHEET_KIND: Record<string, CategoryRecordKind> = {
  MATERIAL_RECEIPT: "MATERIAL_RECEIPT",
  DELIVERY_NOTE: "DELIVERY_NOTE",
  MATERIAL_OUTGOING: "MATERIAL_OUTGOING",
  SITE_RECORD: "SITE_RECORD",
  FIELD_TASK: "SITE_RECORD",
  HAZARD: "HAZARD",
  SAFETY_INCIDENT: "HAZARD",
  OVERDUE_RECTIFICATION: "HAZARD",
  SITE_EQUIPMENT: "SITE_EQUIPMENT",
  EQUIPMENT_MOVEMENT: "EQUIPMENT_MOVEMENT",
  PROGRESS: "PROGRESS",
  SITE_PROGRESS: "PROGRESS",
  DISPOSAL_REQUEST: "DISPOSAL_REQUEST",
  DISPOSAL: "DISPOSAL_REQUEST",
  WASTE_OUTGOING: "WASTE_OUTGOING",
  DOCUMENT: "DOCUMENT",
  SUNDRY_CLAIM: "SUNDRY_CLAIM",
};

/**
 * Every photograph of one record, fetched when its thumbnail is opened.
 *
 * Read through the record sheet's own door (`category-records/get_record`),
 * which serves the stamped copies and only what this reader may open. A kind
 * the sheet does not know gives `undefined`: the viewer then shows the
 * thumbnail itself.
 */
export function recordPhotos(kind: string, id: string, label: string) {
  const sheet = SHEET_KIND[kind];
  if (!sheet) return undefined;
  return async () => toShellPhotos((await getCategoryRecord(sheet, id)).photos ?? [], label);
}

/**
 * Photographs a list row already carries, as their stamped copies.
 *
 * `url` is a link the server already stamped (a record sheet's photo);
 * `watermarked` is a row's stamped copy. The original (`image`) is never
 * used: a photograph whose stamp could not be made is left out rather than
 * shown unstamped (audit #10, Q30.2) - with none left the viewer shows the
 * stamped thumbnail, and a record with no thumbnail shows its icon.
 */
export function rowPhotos(
  list: ReadonlyArray<
    PhotoMetaSource & {
      id?: string | number | null;
      url?: string | null;
      watermarked?: string | null;
      /** Accepted so a row's photographs can be passed as they are; never shown. */
      image?: string | null;
      caption?: string | null;
    }
  > | null | undefined,
  label: string,
  record?: PhotoMetaSource | null,
): ShellPhoto[] {
  return toShellPhotos(
    (list ?? []).map((photo) => ({
      id: photo.id == null ? null : String(photo.id),
      url: photo.url || photo.watermarked || null,
      caption: photo.caption,
      captured_at: photo.captured_at,
      taken_at: photo.taken_at,
      latitude: photo.latitude,
      longitude: photo.longitude,
    })),
    label,
    record,
  );
}

interface CoveredRow {
  cover_photo_url?: string | null;
  /** J34-2: the first photographs' thumbnails, cover first. */
  photo_thumbs?: string[] | null;
  photo_count?: number | null;
}

/**
 * The photograph column of an office list (E3), for `DataTable` /
 * `ModuleRecordsTable`. Not sortable and not hideable by accident: it is the
 * column the client asked for. A strip of four (J34-2) where the list has
 * room for it (`strip`).
 */
export function photoColumn<T extends CoveredRow>({
  label,
  icon,
  reference,
  photos,
  strip = false,
}: {
  label: string;
  icon: LucideIcon;
  reference: (row: T) => string;
  photos?: (row: T) => PhotoThumbPhotos | undefined;
  /**
   * Four photographs a row (J34-2) rather than one. Lists move over one by
   * one: each needs room for 242 px (`lib/list-fits`, kind `strip`).
   */
  strip?: boolean;
}): ColumnDef<T, unknown> {
  return {
    id: "cover_photo",
    meta: { label },
    enableSorting: false,
    header: () => (
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
    ),
    cell: ({ row }) =>
      strip ? (
        <PhotoStrip
          thumbs={row.original.photo_thumbs}
          coverUrl={row.original.cover_photo_url}
          count={row.original.photo_count}
          icon={icon}
          reference={reference(row.original)}
          photos={photos?.(row.original)}
        />
      ) : (
        <PhotoThumb
          coverUrl={row.original.cover_photo_url}
          count={row.original.photo_count}
          icon={icon}
          reference={reference(row.original)}
          photos={photos?.(row.original)}
        />
      ),
  };
}

/** The icon a record without a photograph shows, by the kind its row names. */
const KIND_ICON: Record<string, LucideIcon> = {
  MATERIAL_RECEIPT: ClipboardList,
  DELIVERY_NOTE: FileText,
  MATERIAL_OUTGOING: PackageMinus,
  EQUIPMENT_MOVEMENT: HardHat,
  SITE_EQUIPMENT: HardHat,
  HAZARD: ShieldAlert,
  SAFETY_INCIDENT: ShieldAlert,
  OVERDUE_RECTIFICATION: ShieldAlert,
  WASTE_OUTGOING: Recycle,
  WASTE_DISPATCH: Recycle,
  DISPOSAL_REQUEST: Trash2,
  DISPOSAL: Trash2,
  PROGRESS: ChartNoAxesCombined,
  SITE_PROGRESS: ChartNoAxesCombined,
  CONSULTANT_APPLICATION: ClipboardCheck,
  SUNDRY_CLAIM: ReceiptText,
  CLAIM: ReceiptText,
  MATERIAL_REQUEST: FilePlus2,
  FIELD_TASK: ListTodo,
  SITE_RECORD: ListTodo,
  ATTENDANCE_DAY: MapPin,
  GEOFENCE_FAILURE: MapPin,
  DOCUMENT: FileText,
};

export function recordKindIcon(kind: string | null | undefined): LucideIcon {
  return (kind && KIND_ICON[kind]) || ImageIcon;
}
