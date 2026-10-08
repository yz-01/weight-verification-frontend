"use client";

/**
 * The progress photographs, as the progress page's tabs show them (B17):
 * a tile, a picker that ticks some of them, and the viewer they open in.
 *
 * Every photograph here is one the site already took with a progress record
 * (`SiteProgressPhoto`). A daily report and a summary's photo group only
 * point at them; nothing is uploaded twice.
 */

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

import { QueryFailedNote } from "@/components/shared/page-primitives";
import { PhotoViewer, type ShellPhoto } from "@/components/shared/record-detail-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProgressPhoto } from "@/interfaces/progress-reports";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getProgressPhotos } from "@/services/progress-reports.service";

/** The day a photograph was taken, in the reader's time zone, as YYYY-MM-DD. */
export function localDay(value: string | null | undefined): string {
  const when = value ? new Date(value) : new Date();
  if (Number.isNaN(when.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

export function photoUrl(photo: ProgressPhoto): string {
  return photo.watermarked || photo.image;
}

/** What the shared viewer needs from a progress photograph. */
export function toShellPhotos(photos: ProgressPhoto[]): ShellPhoto[] {
  return photos.map((photo) => ({
    id: photo.id,
    url: photoUrl(photo),
    label: `${photo.phase_name} · ${photo.percent_complete}%${photo.caption ? ` · ${photo.caption}` : ""}`,
    takenAt: photo.captured_at,
    latitude: photo.latitude,
    longitude: photo.longitude,
  }));
}

/** A set of photographs and the viewer they open in, one at a time. */
export function usePhotoViewer(photos: ProgressPhoto[], reference: string) {
  const [index, setIndex] = useState<number | null>(null);
  const viewer =
    index !== null && photos[index] ? (
      <PhotoViewer
        photos={toShellPhotos(photos)}
        index={index}
        reference={reference}
        onIndex={setIndex}
        onClose={() => setIndex(null)}
      />
    ) : null;
  return { open: setIndex, viewer };
}

/** One photograph: the picture, its 施工分类 and percentage, when it was taken. */
export function PhotoTile({
  photo,
  onOpen,
  selected,
  onToggle,
  toggleLabel,
}: {
  photo: ProgressPhoto;
  onOpen?: () => void;
  /** Present when the tile can be ticked. */
  selected?: boolean;
  onToggle?: () => void;
  toggleLabel?: string;
}) {
  const df = useDateFormat();
  return (
    <li
      className={cn(
        "relative overflow-hidden surface-panel rounded-xl",
        selected && "ring-2 ring-primary",
      )}
    >
      <button
        type="button"
        onClick={onOpen ?? onToggle}
        className="relative block aspect-[4/3] w-full bg-muted/40"
        title={photo.caption || photo.phase_name}
      >
        <Image
          src={photoUrl(photo)}
          alt={photo.caption || photo.phase_name}
          fill
          sizes="(max-width: 640px) 50vw, 220px"
          className="object-cover"
          unoptimized
        />
      </button>
      {onToggle && (
        <button
          type="button"
          role="checkbox"
          aria-checked={!!selected}
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={onToggle}
          className={cn(
            "absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-md border-2 border-overlay-foreground shadow",
            selected ? "bg-primary text-primary-foreground" : "bg-overlay/40 text-transparent",
          )}
        >
          <Check className="size-4" />
        </button>
      )}
      <div className="space-y-0.5 px-2 py-1.5 text-xs">
        <p className="truncate font-medium text-foreground">
          {photo.phase_name} · <span className="tabular">{photo.percent_complete}%</span>
        </p>
        <p className="tabular truncate text-muted-foreground">
          {photo.captured_at ? df.dateTime(photo.captured_at) : "—"}
        </p>
      </div>
    </li>
  );
}

export function PhotoGrid({ children }: { children: React.ReactNode }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
      {children}
    </ul>
  );
}

/** Two dates, from and to; either may be left empty. */
export function DayRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (next: { date_from?: string; date_to?: string }) => void;
}) {
  const t = useTranslations("progressPage");
  return (
    <div className="flex items-center gap-1">
      <Input
        type="date"
        aria-label={t("dateFrom")}
        title={t("dateFrom")}
        className="h-8 w-35"
        value={from}
        onChange={(event) => onChange({ date_from: event.target.value || undefined, date_to: to || undefined })}
      />
      <span className="text-xs text-muted-foreground">–</span>
      <Input
        type="date"
        aria-label={t("dateTo")}
        title={t("dateTo")}
        className="h-8 w-35"
        value={to}
        onChange={(event) => onChange({ date_from: from || undefined, date_to: event.target.value || undefined })}
      />
    </div>
  );
}

const PICKER_PAGE = 48;

/**
 * Tick photographs of one project, looked up by day.
 *
 * Opened on a day (a daily report's date); the reader can widen it. The
 * photographs already ticked stay listed above the day's, so changing the
 * day never hides a choice already made.
 */
export function ProgressPhotoPicker({
  project,
  day,
  selected,
  onChange,
}: {
  project: string;
  day?: string;
  selected: ProgressPhoto[];
  onChange: (photos: ProgressPhoto[]) => void;
}) {
  const t = useTranslations("progressPage");
  const [from, setFrom] = useState(day ?? "");
  const [to, setTo] = useState(day ?? "");
  const [page, setPage] = useState(1);
  const photos = useQuery({
    queryKey: ["progress-photos", "picker", project, from, to, page],
    queryFn: () =>
      getProgressPhotos({
        project,
        date_from: from || undefined,
        date_to: to || undefined,
        page,
        page_size: PICKER_PAGE,
      }),
    enabled: Boolean(project),
  });
  const chosen = new Set(selected.map((photo) => photo.id));
  const toggle = (photo: ProgressPhoto) =>
    onChange(
      chosen.has(photo.id)
        ? selected.filter((row) => row.id !== photo.id)
        : [...selected, photo],
    );
  const rows = (photos.data?.results ?? []).filter((photo) => !chosen.has(photo.id));
  const total = photos.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PICKER_PAGE));

  if (!project) {
    return <p className="text-sm text-muted-foreground">{t("chooseProjectFirst")}</p>;
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DayRange
          from={from}
          to={to}
          onChange={(next) => {
            setFrom(next.date_from ?? "");
            setTo(next.date_to ?? "");
            setPage(1);
          }}
        />
        <span className="text-xs text-muted-foreground">
          {t("photos.selected", { count: selected.length })}
        </span>
      </div>
      <QueryFailedNote query={photos} what={t("tabs.photos")} />
      {selected.length > 0 && (
        <PhotoGrid>
          {selected.map((photo) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              selected
              onToggle={() => toggle(photo)}
              toggleLabel={t("photos.unselect")}
            />
          ))}
        </PhotoGrid>
      )}
      {photos.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : rows.length === 0 && !photos.isError ? (
        <p className="text-sm text-muted-foreground">{t("photos.emptyDay")}</p>
      ) : (
        <PhotoGrid>
          {rows.map((photo) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              selected={false}
              onToggle={() => toggle(photo)}
              toggleLabel={t("photos.select")}
            />
          ))}
        </PhotoGrid>
      )}
      {pages > 1 && (
        <Pager page={page} pages={pages} onPage={setPage} />
      )}
    </div>
  );
}

export function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations("progressPage");
  return (
    <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
      {/* At either end the button is not there rather than grey. */}
      {page > 1 ? (
        <Button
          variant="outline"
          size="icon"
          className="size-7"
          aria-label={t("previous")}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft />
        </Button>
      ) : (
        <span className="size-7" />
      )}
      <span className="tabular">
        {page} / {pages}
      </span>
      {page < pages ? (
        <Button
          variant="outline"
          size="icon"
          className="size-7"
          aria-label={t("next")}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight />
        </Button>
      ) : (
        <span className="size-7" />
      )}
    </div>
  );
}
