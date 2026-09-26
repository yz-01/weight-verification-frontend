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
 * Under every overlay (z-40): a dialog, sheet or confirm box opened on top of
 * the page must cover the cards, not the other way round - at z-[60] the stack
 * sat over a sheet's footer and hid the very buttons the task led to.
 *
 * An office account on a phone-sized screen gets one bar across the bottom
 * instead of a 22rem column of cards over the page: it opens on tap, and
 * closes again once a card is opened so the page it leads to is not covered.
 */

import { BellRing, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { useIsMobile } from "@/hooks/use-mobile";
import type { NotificationRow } from "@/interfaces/platform-ops";
import { cn } from "@/lib/utils";

const VISIBLE = 3;

export function ActionCardStack({
  rows,
  onOpen,
}: {
  rows: NotificationRow[];
  onOpen: (row: NotificationRow) => void;
}) {
  const t = useTranslations("notifications.actionCards");
  const isMobile = useIsMobile();
  const [collapsedAt, setCollapsedAt] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const cards = rows.filter((row) => row.card === "ACTION");
  if (cards.length === 0) return null;
  const newest = cards.reduce((latest, row) => (row.created_at > latest ? row.created_at : latest), "");
  // A phone starts closed and stays closed until tapped; the desktop starts
  // open and reopens for anything newer than the collapse.
  const collapsed = isMobile ? !mobileOpen : collapsedAt !== null && newest <= collapsedAt;
  const toggle = () => (isMobile ? setMobileOpen(!mobileOpen) : setCollapsedAt(collapsed ? null : newest));

  return (
    <aside
      aria-label={t("title")}
      className={cn(
        "fixed z-40 flex flex-col gap-2",
        isMobile
          ? "inset-x-3 bottom-[max(env(safe-area-inset-bottom),0.75rem)]"
          : "bottom-4 right-4 w-[min(22rem,calc(100vw-2rem))]",
      )}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        title={collapsed ? t("expand") : t("collapse")}
        onClick={toggle}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border bg-card px-3 text-left shadow-lg transition hover:border-primary/40",
          isMobile ? "min-h-11 py-2" : "py-1.5",
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
      {!collapsed && (
        <div
          className={cn(
            "flex flex-col gap-2 overflow-y-auto overscroll-contain",
            isMobile ? "max-h-[55dvh]" : "max-h-[calc(100dvh-8rem)]",
          )}
        >
          {cards.slice(0, VISIBLE).map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => {
                onOpen(row);
                if (isMobile) setMobileOpen(false);
              }}
              className="block w-full shrink-0 rounded-lg border border-primary/30 bg-card p-3 text-left shadow-lg transition hover:border-primary"
            >
              <p className="text-sm font-semibold">{row.title}</p>
              {typeof row.data.project_name === "string" && row.data.project_name ? (
                <p className="text-xs text-muted-foreground">{row.data.project_name}</p>
              ) : null}
              <p className="mt-1 line-clamp-2 text-xs">{row.message}</p>
              <p className="mt-1 text-[11px] font-medium text-primary">{t("open")}</p>
            </button>
          ))}
          {cards.length > VISIBLE && (
            <Link
              href="/notifications/my-tasks"
              onClick={() => isMobile && setMobileOpen(false)}
              className="block shrink-0 rounded-lg border bg-card px-3 py-2 text-center text-xs font-medium text-primary shadow-lg hover:underline"
            >
              {t("more", { count: cards.length - VISIBLE })}
            </Link>
          )}
        </div>
      )}
    </aside>
  );
}
