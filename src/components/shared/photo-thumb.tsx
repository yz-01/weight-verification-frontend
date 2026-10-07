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

import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

import { PhotoViewer, type ShellPhoto } from "@/components/shared/record-detail-shell";
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
  /** Every photograph of the record, or how to fetch them on open. */
  photos?: PhotoThumbPhotos;
  /** 48 px in a list (default); 40 px in the dashboard's compact rows. */
  size?: "md" | "sm";
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
  className,
}: PhotoThumbProps) {
  const t = useTranslations("photos");
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
          "inline-flex shrink-0 items-center justify-center rounded-md border border-dashed bg-muted/40 text-muted-foreground",
          SIZE[size],
          className,
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
    );
  }

  // The thumbnail itself, until the full set arrives - better than nothing
  // when a record's photographs cannot be fetched.
  const fallback: ShellPhoto[] = [{ id: "cover", url: coverUrl, label: reference }];

  const open = async (event: React.MouseEvent) => {
    // A list row opens its record on click; the photograph opens the viewer.
    event.stopPropagation();
    event.preventDefault();
    if (Array.isArray(photos)) {
      setOpened({ photos: photos.length ? photos : fallback, index: 0 });
      return;
    }
    if (!photos) {
      setOpened({ photos: fallback, index: 0 });
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
          "relative block shrink-0 overflow-hidden rounded-md border bg-muted/40 transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring",
          SIZE[size],
          loading && "opacity-60",
          className,
        )}
      >
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
            className="absolute bottom-0.5 right-0.5 rounded bg-black/65 px-1 text-[10px] font-semibold leading-4 text-white tabular-nums"
          >
            {total}
          </span>
        ) : null}
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

/** Photographs as a record's page and the archive send them, for the viewer. */
export function toShellPhotos(
  list: Array<{ id?: string | null; url?: string | null; caption?: string | null }>,
  label: string,
): ShellPhoto[] {
  return list
    .filter((photo): photo is { id?: string | null; url: string; caption?: string | null } =>
      Boolean(photo.url),
    )
    .map((photo, index) => ({
      id: photo.id || `${index}`,
      url: photo.url,
      label: photo.caption || label,
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
