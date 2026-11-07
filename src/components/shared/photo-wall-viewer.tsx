"use client";

/**
 * 照片墙 viewer, shared by 今日现场照片 (JB134 事项 9) and MSE Timeline 工程
 * 照片墙 (JB135 事项 10).
 *
 * The client: 「参考现有门岗照片墙功能。单击照片：放大照片，可以左右连续翻看。
 * 双击照片：进入该照片对应的完整业务记录。」 and 「复用现有功能：参考门岗现有
 * 照片墙，不需要重复开发相同的浏览功能。」 So this is the gate wall's viewer
 * (`site-access/gate-photo-wall.tsx`) for the head-office photo rows: the
 * whole photo beside its facts, ← → keys, a swipe or the buttons step
 * through every loaded photo and read the next page at the end, and
 * 「打开完整记录」 opens the record. One click on a tile waits a moment for a
 * second click (`createClickSorter`), so a double click opens the record
 * and never the viewer as well; Enter opens the viewer at once.
 */

import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { ClockInput } from "@/components/shared/date-time-range-filter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { HeadquartersPhoto } from "@/interfaces/headquarters";
import { useDateFormat } from "@/lib/dates";
import { normalizeClock } from "@/lib/gate-time-range";
import { wallStep } from "@/lib/gate-photo-wall";
import { photoTarget } from "@/lib/headquarters-links";
import { createClickSorter, type PhotoWallFilters } from "@/lib/photo-wall";

/** How far a finger has to travel for a swipe to turn the photo. */
const SWIPE_PX = 48;

/** The pages a wall reads, as `useInfiniteQuery` hands them over. */
export interface PhotoWallPages {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
}

/**
 * Which photo the viewer shows, and 上一张 / 下一张 across pages: past the
 * last loaded photo the next page is read and the viewer moves on once it
 * is in (as the gate wall does).
 */
export function usePhotoWallViewer(count: number, pages: PhotoWallPages) {
  const [index, setIndex] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  if (pending !== null) {
    if (pending < count) {
      setIndex(pending);
      setPending(null);
    } else if (!pages.isFetchingNextPage && !pages.hasNextPage) {
      setPending(null);
    }
  }
  const step = (by: 1 | -1) => {
    if (index === null) return;
    const next = wallStep(index, by, count, pages.hasNextPage);
    if (next.kind === "show") setIndex(next.index);
    else if (next.kind === "load" && !pages.isFetchingNextPage) {
      setPending(next.index);
      void pages.fetchNextPage();
    }
  };
  return {
    index,
    loadingNext: pending !== null,
    open: (at: number) => setIndex(at),
    close: () => {
      setIndex(null);
      setPending(null);
    },
    step,
  };
}

/**
 * A tile's click: one click opens the viewer after a short wait, two open
 * the record, the keyboard opens the viewer at once.
 */
export function usePhotoTileClicks(
  onSingle: (index: number) => void,
  onDouble: (index: number) => void,
) {
  const latest = useRef({ onSingle, onDouble });
  useEffect(() => {
    latest.current = { onSingle, onDouble };
  });
  const sorter = useRef<ReturnType<typeof createClickSorter<number>> | null>(null);
  useEffect(() => {
    const made = createClickSorter<number>({
      onSingle: (index) => latest.current.onSingle(index),
      onDouble: (index) => latest.current.onDouble(index),
    });
    sorter.current = made;
    return () => made.dispose();
  }, []);
  return (index: number, event: { detail: number }) => {
    sorter.current?.click(index, event.detail);
  };
}

/** The record kind and what it is, e.g. 「材料进场 · 水泥 20 包」. */
export function usePhotoKindLine() {
  const kinds = useTranslations("headquarters.recordKind");
  return (photo: HeadquartersPhoto) => {
    const kind = kinds.has(photo.record_kind) ? kinds(photo.record_kind) : photo.record_kind;
    const headline = photo.headline;
    if (!headline?.title) return { kind, content: "" };
    const amount = [headline.quantity, headline.unit].filter(Boolean).join(" ");
    return { kind, content: amount ? `${headline.title} ${amount}` : headline.title };
  };
}

/**
 * One photo large and whole, with its facts, stepped through without
 * closing (「可以左右连续翻看，像看故事一样，不需要逐条打开记录」).
 */
export function PhotoWallViewer({
  photo,
  position,
  loaded,
  more,
  loadingNext,
  onStep,
  onClose,
  onOpenRecord,
}: {
  photo: HeadquartersPhoto;
  /** 0-based place among the photos loaded so far. */
  position: number;
  loaded: number;
  /** Whether there are pages still to read. */
  more: boolean;
  loadingNext: boolean;
  onStep: (by: 1 | -1) => void;
  onClose: () => void;
  onOpenRecord: (photo: HeadquartersPhoto) => void;
}) {
  const t = useTranslations("photoWall");
  const df = useDateFormat();
  const kindLine = usePhotoKindLine();
  const { kind, content } = kindLine(photo);
  const atFirst = position === 0;
  const atLast = position >= loaded - 1 && !more;
  const opens = photoTarget(photo) !== null;

  // ← and → turn the photo, read through a ref so the listener is bound once.
  const stepRef = useRef(onStep);
  useEffect(() => {
    stepRef.current = onStep;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A record opened from here sits on top: its keys are its own.
      if (document.querySelectorAll('[data-slot="dialog-content"]').length > 1) return;
      if (event.key === "ArrowLeft") stepRef.current(-1);
      else if (event.key === "ArrowRight") stepRef.current(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const touchX = useRef<number | null>(null);
  const photographer = photo.photographer || t("unknownPhotographer");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-photo-wall-viewer
        className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl xl:max-w-6xl"
      >
        <DialogHeader>
          <DialogTitle>{photo.project}</DialogTitle>
          <DialogDescription>
            {kind} · {df.dateTime(photo.captured_at)} · {photographer}
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
              {photo.image ? (
                // The stamped photo as the record holds it, whole and fitted.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={photo.id}
                  src={photo.image}
                  alt={t("alt", { kind, project: photo.project })}
                  className="max-h-full max-w-full object-contain"
                  data-wall-photo
                />
              ) : (
                <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <ImageOff className="size-6" aria-hidden />
                  {t("noPhoto")}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                disabled={atFirst}
                disabledReason={t("first")}
                onClick={() => onStep(-1)}
              >
                <ChevronLeft />
                {t("previous")}
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                {/* More still to load: the count so far would mislead, so only the place. */}
                {more ? t("positionOpen", { number: position + 1 }) : t("position", { number: position + 1, loaded })}
              </span>
              <Button
                variant="outline"
                disabled={atLast || loadingNext}
                disabledReason={loadingNext ? t("loading") : t("last")}
                onClick={() => onStep(1)}
              >
                {t("next")}
                {loadingNext ? <Loader2 className="animate-spin" /> : <ChevronRight />}
              </Button>
            </div>
          </div>

          <aside className="min-w-0 space-y-4" data-wall-details>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Fact label={t("field.project")} wide>
                {photo.project}
              </Fact>
              <Fact label={t("field.kind")}>{kind}</Fact>
              <Fact label={t("field.photographer")}>{photographer}</Fact>
              {content ? (
                <Fact label={t("field.content")} wide>
                  {content}
                </Fact>
              ) : null}
              <Fact label={t("field.date")}>{df.date(photo.captured_at)}</Fact>
              <Fact label={t("field.time")}>
                <span className="tabular">{df.time(photo.captured_at)}</span>
              </Fact>
            </dl>
            <div className="border-t border-panel-border pt-3">
              <Button
                variant="outline"
                className="w-full"
                data-wall-open-record
                disabled={!opens}
                disabledReason={t("noRecord")}
                onClick={() => onOpenRecord(photo)}
              >
                <ExternalLink />
                {t("openRecord")}
              </Button>
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

/**
 * 日期 and 时间 for a wall: one day (今日现场照片, empty = today) or a range
 * (MSE Timeline), and a time of day typed on a 24-hour clock, e.g. 08:00 至
 * 12:00 (「例如上午8点至12点」). A time is applied when its box is left or
 * Enter is pressed, never on every key.
 */
export function PhotoWallFilterFields({
  value,
  onChange,
  mode,
  today,
}: {
  value: PhotoWallFilters;
  onChange: (next: PhotoWallFilters) => void;
  mode: "day" | "range";
  /** `YYYY-MM-DD` on the company's clock: what an empty day box shows. */
  today: string;
}) {
  const t = useTranslations("photoWall.filter");
  const [draft, setDraft] = useState({ from: value.time_from ?? "", to: value.time_to ?? "" });
  const [bad, setBad] = useState(false);
  const shown = `${value.time_from ?? ""}|${value.time_to ?? ""}`;
  const [seen, setSeen] = useState(shown);
  if (seen !== shown) {
    setSeen(shown);
    setDraft({ from: value.time_from ?? "", to: value.time_to ?? "" });
    setBad(false);
  }

  const commitTime = (end: "from" | "to", text: string) => {
    const key = end === "from" ? "time_from" : "time_to";
    if (!text.trim()) {
      setBad(false);
      if (value[key]) onChange({ ...value, [key]: undefined });
      return;
    }
    const clock = normalizeClock(text);
    if (!clock) {
      setBad(true);
      return;
    }
    setBad(false);
    setDraft((now) => ({ ...now, [end]: clock }));
    if (value[key] !== clock) onChange({ ...value, [key]: clock });
  };

  const filtered = Boolean(value.date_from || value.date_to || value.time_from || value.time_to);

  return (
    <div className="flex w-full flex-wrap items-end gap-2" data-photo-wall-filters>
      {mode === "day" ? (
        <label className="grid gap-1 text-xs text-muted-foreground">
          {t("date")}
          <Input
            type="date"
            className="w-40"
            value={value.date_from || today}
            onChange={(event) => {
              const day = event.target.value;
              onChange({
                ...value,
                date_from: day && day !== today ? day : undefined,
                date_to: day && day !== today ? day : undefined,
              });
            }}
          />
        </label>
      ) : (
        <>
          <label className="grid gap-1 text-xs text-muted-foreground">
            {t("dateFrom")}
            <Input
              type="date"
              className="w-40"
              value={value.date_from ?? ""}
              onChange={(event) => onChange({ ...value, date_from: event.target.value || undefined })}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            {t("dateTo")}
            <Input
              type="date"
              className="w-40"
              value={value.date_to ?? ""}
              onChange={(event) => onChange({ ...value, date_to: event.target.value || undefined })}
            />
          </label>
        </>
      )}
      <div className="grid gap-1 text-xs text-muted-foreground">
        <span>{t("time")}</span>
        <span className="flex items-center gap-1">
          <ClockInput
            label={t("timeFrom")}
            placeholder={t("timePlaceholder")}
            value={draft.from}
            invalid={bad}
            onDraft={(text) => setDraft((now) => ({ ...now, from: text }))}
            onCommit={(text) => commitTime("from", text)}
          />
          <span>{t("to")}</span>
          <ClockInput
            label={t("timeTo")}
            placeholder={t("timePlaceholder")}
            value={draft.to}
            invalid={bad}
            onDraft={(text) => setDraft((now) => ({ ...now, to: text }))}
            onCommit={(text) => commitTime("to", text)}
          />
        </span>
      </div>
      {filtered ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() =>
            onChange({
              project: value.project,
            })
          }
        >
          <X />
          {mode === "day" && value.date_from ? t("backToToday") : t("clear")}
        </Button>
      ) : null}
      {bad ? (
        <p role="alert" className="w-full text-xs text-destructive">
          {t("badTime")}
        </p>
      ) : null}
    </div>
  );
}
