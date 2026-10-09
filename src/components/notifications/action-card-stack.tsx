"use client";

/**
 * The back office's pop-up task cards (T-284 / T-308 / T-317; #6, #30, #39).
 *
 * The customer, three times over: 「新通知到达时在画面角落弹出卡片…点一下直接
 * 进去处理」 (#6); for waste and clearing orders 「必须持续弹出对应的任务卡片。
 * 点进去查看不会消失；处理完成一项只消失那一张卡片」 (#30); and for a recycler
 * receiving an order 「页面直接弹出订单卡片、必须有声音提醒」 (#39, the sound is
 * the bell's).
 *
 * So the cards are the outstanding ACTION notices themselves - the ones that
 * ask this person to do something (D-207) - read from the list the bell
 * already polls. Opening one navigates and leaves it standing; it goes when
 * its record finishes and the server closes the notice, which is the only way
 * a card leaves the list, one card at a time. Collapsing the stack is a
 * courtesy for a crowded screen, not a dismissal: anything newer than the
 * collapse opens it again.
 *
 * Not on the phone: a field worker is reminded on the home screen instead
 * (D-207), and a card over the camera would be in the way.
 *
 * Docked, not floating (B01 「桌面及手机无内容遮挡」). The stack used to be
 * `fixed` - bottom right on a desktop, across the bottom on a phone - and
 * covered whatever was under it: the 查看 button in a table's last column, a
 * form's submit. It now renders into a strip in the page layout under the
 * content column (`TaskCardDockSlot`); the content gets shorter by the
 * strip's height and scrolls as before, so nothing it holds is ever covered,
 * open cards or not. Dialogs, sheets and confirm boxes open over the whole
 * page, strip included, as they always did.
 *
 * Open, it is one row of every waiting card, newest first, each the same
 * width, scrolling sideways (Lucas, 2026-10-09: 「最新的通知在第一个，然后会
 * 显示所有待处理的事项，可是可以往右滑动查看」): a swipe on a phone, the
 * trackpad, shift + wheel or the arrow buttons on a desktop, with the
 * scrollbar showing. It used to show three and send the rest to My Tasks,
 * which made the count in its title disagree with what it showed. Collapsed,
 * it is one bar. A phone-sized screen starts collapsed and collapses again
 * once a card is opened, so the page it leads to gets the room.
 */

import { BellRing, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { pendingActionCards } from "@/components/notifications/action-cards";
import { useTaskCardDock } from "@/components/notifications/task-card-dock";
import { useIsMobile } from "@/hooks/use-mobile";
import type { NotificationRow } from "@/interfaces/platform-ops";
import { cn } from "@/lib/utils";

export function ActionCardStack({
  rows,
  onOpen,
}: {
  rows: NotificationRow[];
  onOpen: (row: NotificationRow) => void;
}) {
  const t = useTranslations("notifications.actionCards");
  const isMobile = useIsMobile();
  const dock = useTaskCardDock();
  const [collapsedAt, setCollapsedAt] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const cards = pendingActionCards(rows);
  const row = useRef<HTMLDivElement | null>(null);
  // Which way the row can still scroll; the arrow buttons show only for those.
  const [canScroll, setCanScroll] = useState({ back: false, forward: false });
  const measure = useCallback(() => {
    const element = row.current;
    if (!element) return;
    const back = element.scrollLeft > 1;
    const forward = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    setCanScroll((current) =>
      current.back === back && current.forward === forward ? current : { back, forward },
    );
  }, []);
  // Measured when the row appears, when it is resized, when it scrolls and
  // when the number of cards changes.
  const rowRef = useCallback(
    (element: HTMLDivElement | null) => {
      row.current = element;
      if (!element) return;
      measure();
      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => {
        observer.disconnect();
        row.current = null;
      };
    },
    [measure],
  );
  useEffect(measure, [measure, cards.length]);
  if (cards.length === 0 || !dock) return null;
  const newest = cards[0].created_at;
  // A phone starts closed and stays closed until tapped; the desktop starts
  // open and reopens for anything newer than the collapse.
  const collapsed = isMobile ? !mobileOpen : collapsedAt !== null && newest <= collapsedAt;
  const toggle = () => (isMobile ? setMobileOpen(!mobileOpen) : setCollapsedAt(collapsed ? null : newest));
  /** One card's width (and the gap) at a time, or most of a screenful. */
  const scrollBy = (direction: 1 | -1) => {
    const element = row.current;
    if (!element) return;
    const card = element.firstElementChild as HTMLElement | null;
    const step = Math.max((card?.offsetWidth ?? 0) + 8, element.clientWidth - 64);
    element.scrollBy({ left: direction * step, behavior: "smooth" });
  };
  const scrollable = canScroll.back || canScroll.forward;

  return createPortal(
    <aside
      aria-label={t("title")}
      className="flex min-w-0 flex-col gap-2 border-t bg-muted/40 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] lg:px-5"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={!collapsed}
          title={collapsed ? t("expand") : t("collapse")}
          onClick={toggle}
          className={cn(
            "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-1 text-left transition hover:text-primary",
            isMobile ? "min-h-11" : "min-h-7",
          )}
        >
          <span className="flex items-center gap-2 text-xs font-semibold">
            <BellRing className="size-4 shrink-0 text-primary" />
            {t("count", { count: cards.length })}
          </span>
          <span className="sr-only">{collapsed ? t("expand") : t("collapse")}</span>
          {collapsed ? (
            <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        {!collapsed && scrollable && !isMobile && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              title={t("scrollBack")}
              aria-label={t("scrollBack")}
              onClick={() => scrollBy(-1)}
              className={cn(
                "grid size-7 place-items-center rounded-md border bg-card text-muted-foreground transition hover:border-primary hover:text-primary",
                !canScroll.back && "invisible",
              )}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              title={t("scrollForward")}
              aria-label={t("scrollForward")}
              onClick={() => scrollBy(1)}
              className={cn(
                "grid size-7 place-items-center rounded-md border bg-card text-muted-foreground transition hover:border-primary hover:text-primary",
                !canScroll.forward && "invisible",
              )}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
      {!collapsed && (
        <div
          ref={rowRef}
          onScroll={measure}
          className="flex snap-x snap-mandatory scroll-px-1 gap-2 overflow-x-auto overscroll-x-contain px-1 pb-2 [scrollbar-width:thin]"
        >
          {cards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                onOpen(card);
                if (isMobile) setMobileOpen(false);
              }}
              className="block w-[min(17rem,calc(100vw-4rem))] shrink-0 snap-start rounded-lg border border-primary/30 bg-card px-3 py-2 text-left shadow-sm transition hover:border-primary"
            >
              <p className="truncate text-sm font-semibold">{card.title}</p>
              {typeof card.data.project_name === "string" && card.data.project_name ? (
                <p className="truncate text-xs text-muted-foreground">{card.data.project_name}</p>
              ) : null}
              <p className="mt-0.5 line-clamp-1 text-xs">{card.message}</p>
              <p className="mt-0.5 text-2xs font-medium text-primary">{t("open")}</p>
            </button>
          ))}
        </div>
      )}
    </aside>,
    dock,
  );
}
