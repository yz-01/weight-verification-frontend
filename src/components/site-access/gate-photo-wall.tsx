"use client";

/**
 * 日常拍照记录 · 照片墙 (I33, ID74).
 *
 * The client: 「增加『照片墙模式』，直接展示多张照片缩略图，方便快速查找。照片墙
 * 只显示照片，不需要显示详细资料。点击某张照片后，才放大照片并带出该照片的完整
 * 记录，包括日期、时间、拍摄人、项目、GPS等。放大后可直接左右切换上一张、下一张
 * 照片，详细记录同步切换，不需要反复关闭。支持按日期筛选后连续查看照片。」
 *
 * The wall is the list's own query - project, photographer, search and the
 * date + time range all apply - read as photos: tiles only, newest first,
 * the next page read when the bottom comes into view. A tile opens the
 * viewer: the whole photo (as I21's viewer opens it) beside its record's
 * facts (below it on a phone), stepped through with ← →, a swipe or the
 * buttons, a record's photos first, then the next record, then the next page
 * (`@/lib/gate-photo-wall`). From there 「打开这笔记录」 opens the record and
 * its 预览 · 打印 · 导出 · 发送 are one press away. Nothing is stored or
 * changed: one photo is still one record.
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink, Images, Loader2, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { LocationMap } from "@/components/shared/location-map";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { RecordExportButton } from "@/components/shared/record-export-button";
import { GateIssueStatusBadge } from "@/components/site-access/gate-records";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ListQuery } from "@/interfaces/api";
import { useDateFormat } from "@/lib/dates";
import { wallItems, wallStep, type WallItem } from "@/lib/gate-photo-wall";
import { getGateWall } from "@/services/site-access.service";

/** Rows per page of the wall: a few screens of tiles, one request. */
const WALL_PAGE_SIZE = 40;

/** How far a finger has to travel for a swipe to turn the photo. */
const SWIPE_PX = 48;

/**
 * The wall's pages for this list query (the table's filters and search; its
 * page and sort are the table's own and are left out - the wall is always
 * newest first).
 */
export function useGateWall(query: ListQuery, enabled: boolean) {
  const filters = useMemo(() => {
    const rest: ListQuery = { ...query };
    delete rest.page;
    delete rest.page_size;
    delete rest.sort_by;
    delete rest.sort_order;
    return rest;
  }, [query]);
  return useInfiniteQuery({
    queryKey: ["gate-incidents", "wall", filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getGateWall({
        ...filters,
        page: pageParam,
        page_size: WALL_PAGE_SIZE,
        sort_by: "occurred_at",
        sort_order: "desc",
      }),
    getNextPageParam: (last, pages) =>
      pages.reduce((sum, page) => sum + page.results.length, 0) < last.count
        ? pages.length + 1
        : undefined,
    enabled,
  });
}

export function GatePhotoWall({
  wall,
  suspended,
  onOpenRecord,
}: {
  wall: ReturnType<typeof useGateWall>;
  /** A record opened from the viewer is on screen: the viewer waits behind it. */
  suspended: boolean;
  onOpenRecord: (id: string) => void;
}) {
  const t = useTranslations("siteControl.gateRecords");
  const items = useMemo(() => wallItems(wall.data?.pages ?? []), [wall.data]);
  const [index, setIndex] = useState<number | null>(null);
  // 下一张 past the last loaded photo: the next page is being read, and this
  // is the photo to show once it is in.
  const [pending, setPending] = useState<number | null>(null);
  if (pending !== null) {
    if (pending < items.length) {
      setIndex(pending);
      setPending(null);
    } else if (!wall.isFetchingNextPage && !wall.hasNextPage) {
      setPending(null);
    }
  }

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = wall;
  const sentinel = useRef<HTMLDivElement>(null);
  // The bottom of the wall in view reads the next page (「连续查看照片」).
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

  const step = (by: 1 | -1) => {
    if (index === null) return;
    const next = wallStep(index, by, items.length, Boolean(hasNextPage));
    if (next.kind === "show") setIndex(next.index);
    else if (next.kind === "load" && !isFetchingNextPage) {
      setPending(next.index);
      void fetchNextPage();
    }
  };

  if (wall.isLoading) {
    return <WallNote text={t("loading")} />;
  }
  return (
    <div className="space-y-3" data-gate-photo-wall>
      <QueryFailedNote query={wall} what={t("what")} />
      {!wall.isError && items.length === 0 ? (
        <WallNote text={t("wall.empty")} />
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {items.map((item, position) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => setIndex(position)}
                title={item.record.incident_no}
                className="photo-hatch relative block aspect-4/3 w-full overflow-hidden rounded-lg border border-panel-border transition hover:border-primary/60 hover:shadow-glow-sm focus-visible:ring-2 focus-visible:ring-ring"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  loading="lazy"
                  decoding="async"
                  src={item.photo.thumbnail}
                  alt={t("wall.photoAlt", { reference: item.record.incident_no })}
                  className="size-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div ref={sentinel} aria-hidden="true" />
      {hasNextPage ? (
        <Button
          variant="outline"
          className="w-full"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? <Loader2 className="animate-spin" /> : <Images />}
          {t("loadMore")}
        </Button>
      ) : items.length > 0 ? (
        <p className="text-center text-xs text-muted-foreground">{t("wall.end")}</p>
      ) : null}

      {index !== null && items[index] && !suspended ? (
        <WallViewer
          item={items[index]}
          position={index}
          loaded={items.length}
          more={Boolean(hasNextPage)}
          loadingNext={pending !== null}
          onStep={step}
          onClose={() => {
            setIndex(null);
            setPending(null);
          }}
          onOpenRecord={onOpenRecord}
        />
      ) : null}
    </div>
  );
}

function WallNote({ text }: { text: string }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

/**
 * One photo large and whole, with its record's facts, stepped through
 * without closing (「不需要反复关闭」).
 */
export function WallViewer({
  item,
  position,
  loaded,
  more,
  loadingNext,
  onStep,
  onClose,
  onOpenRecord,
}: {
  item: WallItem;
  /** 0-based place among the photos loaded so far. */
  position: number;
  loaded: number;
  /** Whether there are pages still to read. */
  more: boolean;
  loadingNext: boolean;
  onStep: (by: 1 | -1) => void;
  onClose: () => void;
  onOpenRecord: (id: string) => void;
}) {
  const t = useTranslations("siteControl.gateRecords");
  const df = useDateFormat();
  const { record, photo } = item;
  const atFirst = position === 0;
  const atLast = position >= loaded - 1 && !more;

  // ← and → turn the photo, read through a ref so the listener is bound once.
  const stepRef = useRef(onStep);
  useEffect(() => {
    stepRef.current = onStep;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A PDF opened from here sits on top: its keys are its own.
      if (document.querySelectorAll('[data-slot="dialog-content"]').length > 1) return;
      if (event.key === "ArrowLeft") stepRef.current(-1);
      else if (event.key === "ArrowRight") stepRef.current(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const touchX = useRef<number | null>(null);

  const latitude = photo.latitude ?? record.latitude;
  const longitude = photo.longitude ?? record.longitude;
  const markers = useMemo(
    () =>
      latitude && longitude
        ? [
            {
              id: photo.id,
              latitude: Number(latitude),
              longitude: Number(longitude),
              label: record.incident_no,
              tone: "primary" as const,
              icon: "person" as const,
            },
          ]
        : [],
    [latitude, longitude, photo.id, record.incident_no],
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-gate-wall-viewer
        className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl xl:max-w-6xl"
      >
        <DialogHeader>
          <DialogTitle className="tabular">{record.incident_no}</DialogTitle>
          <DialogDescription>
            {df.dateTime(photo.captured_at)} · {photo.guard_name}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-3">
            <div
              className="photo-hatch flex h-[50dvh] items-center justify-center overflow-hidden rounded-xl border border-panel-border lg:h-[68dvh]"
              onTouchStart={(event) => {
                touchX.current = event.touches[0]?.clientX ?? null;
              }}
              onTouchEnd={(event) => {
                const start = touchX.current;
                touchX.current = null;
                const end = event.changedTouches[0]?.clientX;
                if (start === null || end === undefined) return;
                if (end - start <= -SWIPE_PX) onStep(1);
                else if (end - start >= SWIPE_PX) onStep(-1);
              }}
            >
              {/* The whole photo, fitted (I21): the stamped copy, the evidence. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={photo.id}
                src={photo.watermarked_image}
                alt={t("wall.photoAlt", { reference: record.incident_no })}
                className="max-h-full max-w-full object-contain"
                data-wall-photo
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                disabled={atFirst}
                disabledReason={t("wall.first")}
                onClick={() => onStep(-1)}
              >
                <ChevronLeft />
                {t("wall.previous")}
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                {t("wall.position", { number: position + 1, loaded })}
                {more ? "+" : ""}
              </span>
              <Button
                variant="outline"
                disabled={atLast || loadingNext}
                disabledReason={loadingNext ? t("loading") : t("wall.last")}
                onClick={() => onStep(1)}
              >
                {t("wall.next")}
                {loadingNext ? <Loader2 className="animate-spin" /> : <ChevronRight />}
              </Button>
            </div>
          </div>

          <aside className="min-w-0 space-y-4" data-wall-details>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Fact label={t("field.number")} wide>
                <span className="tabular">{record.incident_no}</span>
              </Fact>
              <Fact label={t("wall.date")}>{df.date(photo.captured_at)}</Fact>
              <Fact label={t("wall.time")}>
                <span className="tabular">{df.time(photo.captured_at)}</span>
              </Fact>
              <Fact label={t("field.photographer")}>{photo.guard_name}</Fact>
              <Fact label={t("field.project")}>{record.project_name}</Fact>
              {photo.gate_name ? <Fact label={t("field.gate")}>{photo.gate_name}</Fact> : null}
              {item.photoCount > 1 ? (
                <Fact label={t("field.photos")}>
                  {t("wall.photoOfRecord", { number: item.photoIndex + 1, count: item.photoCount })}
                </Fact>
              ) : null}
              {record.is_issue ? (
                <Fact label={t("field.status")}>
                  <GateIssueStatusBadge status={record.issue_status} />
                </Fact>
              ) : null}
              <Fact label={t("field.gps")} wide>
                {latitude && longitude ? (
                  <span className="flex items-center gap-1 tabular">
                    <MapPin className="size-3.5 text-muted-foreground" />
                    {latitude}, {longitude}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t("gpsUnavailable")}</span>
                )}
              </Fact>
            </dl>
            {markers.length ? (
              <LocationMap
                markers={markers}
                fitBoundsKey={photo.id}
                singlePointZoom={17}
                className="h-44 min-h-0! rounded-lg"
                ariaLabel={t("field.gps")}
              />
            ) : null}
            <div className="space-y-2 border-t border-panel-border pt-3">
              <Button
                variant="outline"
                className="w-full"
                data-wall-open-record
                onClick={() => onOpenRecord(record.id)}
              >
                <ExternalLink />
                {t("wall.openRecord")}
              </Button>
              {/* 预览 · 打印 · 导出 · 发送 of this one record (H16, I14). */}
              <div className="flex flex-wrap items-center gap-2">
                <RecordExportButton
                  kind="GATE_INCIDENT"
                  recordId={record.id}
                  reference={record.incident_no}
                  href={`/gate-records?gate_incident=${record.id}`}
                />
              </div>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words font-medium">{children}</dd>
    </div>
  );
}
