"use client";

/**
 * MSE Timeline 工程照片墙 (JB135, 客户 11-07 事项 10).
 *
 * The client: 「每个项目独立照片墙：自动汇集该项目所有业务照片，按照拍摄时间排列，
 * 从开工第一天一直保留到竣工。」「连续浏览：单击照片放大，可以左右连续翻看」
 * 「查看完整资料：双击照片，直接进入该照片对应的完整业务记录」「照片筛选：支持按
 * 项目、日期及时间范围筛选，例如上午8点至12点」「总部照片墙：总部可以选择单个
 * 项目或全部项目」「保留历史：项目竣工归档后，照片墙仍可查看」 and 「照片墙不是
 * 另外上传照片，而是自动汇集系统已有的照片实景」.
 *
 * So: no upload anywhere. The wall reads every photo the records already
 * hold (`get_headquarters_photos?timeline=1`), newest first, under a heading
 * per day so it reads as a timeline, the next page read when the bottom
 * comes into view. A project of any status - completed and archived ones
 * too - is in the project list. The viewer and the click rules are the
 * shared ones (`shared/photo-wall-viewer`), as on 今日现场照片.
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { CalendarDays, Images, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { usePhotoOpener } from "@/components/dashboard/headquarters-photos";
import { useProjectBoxShown, usePageProject } from "@/components/providers/current-project-provider";
import { useCompanyTimeZone } from "@/components/shared/date-time-range-filter";
import { FieldWrapper, FilterBar, ListHeader, LoadFailed } from "@/components/shared/page-primitives";
import {
  PhotoWallFilterFields,
  PhotoWallViewer,
  usePhotoKindLine,
  usePhotoTileClicks,
  usePhotoWallViewer,
} from "@/components/shared/photo-wall-viewer";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { HeadquartersPhoto } from "@/interfaces/headquarters";
import { useDateFormat } from "@/lib/dates";
import { wallClock } from "@/lib/gate-time-range";
import { photoTarget } from "@/lib/headquarters-links";
import {
  groupPhotosByDay,
  photoWallQuery,
  wallPhotos,
  type PhotoWallFilters,
} from "@/lib/photo-wall";
import { getHeadquartersPhotos } from "@/services/contractor-dashboard.service";

/** Photos per page: a few screens of tiles, one request. */
const PAGE_SIZE = 40;

export function PhotoTimeline() {
  const t = useTranslations("photoWall");
  const df = useDateFormat();
  const kindLine = usePhotoKindLine();
  const timeZone = useCompanyTimeZone();
  const today = wallClock(new Date(), timeZone).date;
  // The top bar's 「当前项目」 when it is in force (B13); 全部项目 otherwise.
  const [project, setProject] = usePageProject("", { all: "all" });
  const projectBoxShown = useProjectBoxShown("filter");
  const [range, setRange] = useState<PhotoWallFilters>({});
  const request = photoWallQuery({ ...range, project }, { timeline: true });
  const query = useInfiniteQuery({
    queryKey: ["contractor-dashboard", "photo-timeline", request],
    queryFn: ({ pageParam }) =>
      getHeadquartersPhotos({ ...request, page: pageParam, page_size: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
  });
  const photos = useMemo(() => wallPhotos(query.data?.pages ?? []), [query.data]);
  const days = useMemo(() => groupPhotosByDay(photos, timeZone), [photos, timeZone]);
  const total = query.data?.pages[0]?.count ?? 0;
  const filtered = Boolean(range.date_from || range.date_to || range.time_from || range.time_to);

  const opener = usePhotoOpener();
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const viewer = usePhotoWallViewer(photos.length, {
    hasNextPage: Boolean(hasNextPage),
    isFetchingNextPage,
    fetchNextPage,
  });
  const openRecord = (photo: HeadquartersPhoto) => {
    if (photoTarget(photo) !== null) opener.open(photo);
  };
  const tileClick = usePhotoTileClicks(viewer.open, (index) => {
    const photo = photos[index];
    if (photo && photoTarget(photo) !== null) opener.open(photo);
    else viewer.open(index);
  });

  // The bottom of the wall in view reads the next page (「连续浏览」).
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const watcher = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const shownPhoto = viewer.index !== null ? photos[viewer.index] : undefined;

  return (
    <div className="flex flex-col gap-4" data-photo-timeline>
      <ListHeader title={t("timeline.title")} subtitle={t("timeline.subtitle")} />
      <FilterBar>
        {projectBoxShown && (
          <FieldWrapper label={t("filter.project")} className="min-w-64 flex-1 sm:flex-none">
            <ProjectPicker
              value={project}
              onValueChange={setProject}
              placeholder={t("filter.chooseProject")}
              allowAll
              allLabel={t("filter.allProjects")}
            />
          </FieldWrapper>
        )}
        <PhotoWallFilterFields value={range} onChange={setRange} mode="range" today={today} />
      </FilterBar>

      <section className="surface-panel space-y-4 rounded-xl p-4" aria-label={t("timeline.title")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
          {query.data ? (
            <span className="text-xs text-muted-foreground" data-timeline-count>
              {t("timeline.shown", { shown: photos.length, total })}
            </span>
          ) : null}
        </div>
        {query.isError ? (
          <LoadFailed onRetry={() => void query.refetch()} />
        ) : query.isLoading ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="aspect-4/3 w-full rounded-lg" />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-panel-border py-8 text-center text-sm text-muted-foreground">
            {filtered ? t("emptyFiltered") : t("timeline.empty")}
          </p>
        ) : (
          <ol className="space-y-5">
            {days.map((day) => (
              <li key={day.day} data-timeline-day={day.day}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <CalendarDays className="size-4 text-primary" aria-hidden />
                  <span className="tabular">{day.day || t("timeline.noDate")}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {t("timeline.dayCount", { count: day.photos.length })}
                  </span>
                </h3>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
                  {day.photos.map(({ photo, index }) => {
                    const { kind } = kindLine(photo);
                    return (
                      <li key={photo.id} className="min-w-0">
                        <button
                          type="button"
                          data-photo-tile
                          title={`${photo.project} · ${kind}`}
                          onClick={(event) => tileClick(index, event)}
                          className="photo-hatch group relative block aspect-4/3 w-full overflow-hidden rounded-lg border border-panel-border text-left transition hover:border-primary/60 hover:shadow-glow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {photo.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              loading="lazy"
                              decoding="async"
                              src={photo.image}
                              alt={t("alt", { kind, project: photo.project })}
                              className="size-full object-cover"
                            />
                          ) : null}
                          <span className="absolute inset-x-0 bottom-0 block truncate bg-overlay px-1.5 py-0.5 text-2xs text-overlay-foreground">
                            <span className="tabular">{df.time(photo.captured_at)}</span> · {photo.project}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )}
        <div ref={sentinel} aria-hidden="true" />
        {hasNextPage ? (
          <Button
            variant="outline"
            className="w-full"
            disabled={isFetchingNextPage}
            disabledReason={t("loading")}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? <Loader2 className="animate-spin" /> : <Images />}
            {t("loadMore")}
          </Button>
        ) : photos.length > 0 ? (
          <p className="text-center text-xs text-muted-foreground">{t("timeline.end")}</p>
        ) : null}
      </section>

      {shownPhoto && viewer.index !== null && opener.sheet === null ? (
        <PhotoWallViewer
          photo={shownPhoto}
          position={viewer.index}
          loaded={photos.length}
          more={Boolean(hasNextPage)}
          loadingNext={viewer.loadingNext}
          onStep={viewer.step}
          onClose={viewer.close}
          onOpenRecord={openRecord}
        />
      ) : null}
      {opener.sheet}
    </div>
  );
}
