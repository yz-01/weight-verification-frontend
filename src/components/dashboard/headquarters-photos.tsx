"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Camera, Loader2, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRecordOpener } from "@/components/shared/record-opener";
import { LoadFailed } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { HeadquartersPhoto } from "@/interfaces/headquarters";
import { useDateFormat } from "@/lib/dates";
import { photoTarget } from "@/lib/headquarters-links";
import { getHeadquartersPhotos } from "@/services/contractor-dashboard.service";

const PAGE_SIZE = 12;

/**
 * Opens a photo's record on its own business page (F9): a delivery opens as
 * the accepted receipt with both signatures, not the record centre's 确认归档
 * sheet. A module with no detail page of its own opens the shared record
 * sheet read-only. One route function for every place that opens a record
 * (`lib/record-routes`).
 */
export function usePhotoOpener() {
  const kinds = useTranslations("headquarters.recordKind");
  const opener = useRecordOpener();
  const open = (photo: HeadquartersPhoto) => {
    opener.open(photo.record_kind, photo.record_id, {
      reference: kinds(photo.record_kind),
      project_id: photo.project_id,
      project_name: photo.project,
      submitted_at: photo.captured_at,
      photo: photo.image,
    });
  };
  return { open, sheet: opener.sheet };
}

/**
 * 今日现场照片 (C14): what every project actually photographed today, newest
 * first, a page at a time with 【载入更多】 - never a fixed handful. Each
 * names its project, the kind of record, the time and who took it, and opens
 * the record it belongs to. A day without photos says so; nothing is made up.
 */
export function HeadquartersPhotos({
  onOpen,
}: {
  onOpen: (photo: HeadquartersPhoto) => void;
}) {
  const t = useTranslations("headquarters.photos");
  const kinds = useTranslations("headquarters.recordKind");
  const df = useDateFormat();
  const query = useInfiniteQuery({
    queryKey: ["contractor-dashboard", "headquarters-photos"],
    queryFn: ({ pageParam }) =>
      getHeadquartersPhotos({ page: pageParam, page_size: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.results) ?? [];
  const total = query.data?.pages[0]?.count ?? 0;

  return (
    <section
      aria-label={t("title")}
      className="surface-panel space-y-4 rounded-xl p-4"
      data-headquarters-photos
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="panel-title">
          <Camera className="size-4 text-primary" aria-hidden />
          {t("title")}
        </h2>
        {query.data && (
          <span className="text-xs text-muted-foreground">
            {t("shown", { shown: rows.length, total })}
          </span>
        )}
      </div>
      {query.isError ? (
        <LoadFailed onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[4/3] w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-panel-border py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          {/* 照片说话 (E1, E3): a photo wall, the newest one large. */}
          <ul className="grid grid-flow-row-dense grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
            {rows.map((photo, index) => {
              const opens = photoTarget(photo) !== null;
              const card = (
                <>
                  <span className="photo-hatch relative block aspect-[4/3]">
                    {photo.image && (
                      <img
                        src={photo.image}
                        alt={t("alt", {
                          kind: kinds(photo.record_kind),
                          project: photo.project,
                        })}
                        className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                    )}
                    <span className="absolute left-2 top-2 rounded-full bg-overlay px-2 py-0.5 text-[11px] font-medium text-overlay-foreground">
                      {kinds(photo.record_kind)}
                    </span>
                    <span className="absolute inset-x-0 bottom-0 block space-y-0.5 bg-overlay px-2 py-1.5 text-overlay-foreground">
                      <span className="block truncate text-xs font-semibold">{photo.project}</span>
                      <span className="flex items-center gap-1 truncate text-[11px] opacity-90">
                        <UserRound className="size-3 shrink-0" aria-hidden />
                        {photo.photographer || t("unknownPhotographer")}
                        <span aria-hidden>·</span>
                        <span className="truncate">{df.dateTime(photo.captured_at)}</span>
                      </span>
                    </span>
                  </span>
                </>
              );
              const hero = index === 0 ? "sm:col-span-2 sm:row-span-2" : "";
              return (
                <li key={photo.id} className={`min-w-0 ${hero}`}>
                  {opens ? (
                    <button
                      type="button"
                      onClick={() => onOpen(photo)}
                      className="group block w-full overflow-hidden rounded-xl border border-panel-border text-left transition hover:border-primary/60 hover:shadow-glow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {card}
                    </button>
                  ) : (
                    // A photo whose record could not be found: shown, not linked.
                    <div className="block overflow-hidden rounded-xl border border-panel-border">{card}</div>
                  )}
                </li>
              );
            })}
          </ul>
          {query.hasNextPage && (
            <div className="flex justify-center">
              <Button
                size="sm"
                variant="outline"
                disabled={query.isFetchingNextPage}
                disabledReason={t("loading")}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage && <Loader2 className="animate-spin" />}
                {t("loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
