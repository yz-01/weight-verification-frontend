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
      className="space-y-2 rounded-lg border bg-card p-3 shadow-sm"
      data-headquarters-photos
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-1.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[4/3] w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
            {rows.map((photo) => {
              const opens = photoTarget(photo) !== null;
              const card = (
                <>
                  <span className="relative block aspect-[4/3] bg-muted">
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
                    <span className="absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white">
                      {kinds(photo.record_kind)}
                    </span>
                  </span>
                  <span className="block space-y-0.5 p-1.5">
                    <span className="block truncate text-xs font-semibold">{photo.project}</span>
                    <span className="flex items-center gap-0.5 truncate text-[11px] text-muted-foreground">
                      <UserRound className="size-3 shrink-0" aria-hidden />
                      {photo.photographer || t("unknownPhotographer")}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {df.dateTime(photo.captured_at)}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={photo.id} className="min-w-0">
                  {opens ? (
                    <button
                      type="button"
                      onClick={() => onOpen(photo)}
                      className="group block w-full overflow-hidden rounded-lg border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {card}
                    </button>
                  ) : (
                    // A photo whose record could not be found: shown, not linked.
                    <div className="block overflow-hidden rounded-lg border">{card}</div>
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
