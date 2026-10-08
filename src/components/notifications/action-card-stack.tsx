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
 * Open, it shows up to three cards side by side on a wide screen and one under
 * the other on a narrow one. Collapsed, it is one bar. A phone-sized screen
 * starts collapsed and collapses again once a card is opened, so the page it
 * leads to gets the room.
 */

import { BellRing, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";

import { useTaskCardDock } from "@/components/notifications/task-card-dock";
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
  const dock = useTaskCardDock();
  const [collapsedAt, setCollapsedAt] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const cards = rows.filter((row) => row.card === "ACTION");
  if (cards.length === 0 || !dock) return null;
  const newest = cards.reduce((latest, row) => (row.created_at > latest ? row.created_at : latest), "");
  // A phone starts closed and stays closed until tapped; the desktop starts
  // open and reopens for anything newer than the collapse.
  const collapsed = isMobile ? !mobileOpen : collapsedAt !== null && newest <= collapsedAt;
  const toggle = () => (isMobile ? setMobileOpen(!mobileOpen) : setCollapsedAt(collapsed ? null : newest));

  return createPortal(
    <aside
      aria-label={t("title")}
      className="flex flex-col gap-2 border-t bg-muted/40 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] lg:px-5"
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
        {!collapsed && cards.length > VISIBLE && (
          <Link
            href="/notifications/my-tasks"
            onClick={() => isMobile && setMobileOpen(false)}
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            {t("more", { count: cards.length - VISIBLE })}
          </Link>
        )}
      </div>
      {!collapsed && (
        <div className="grid max-h-[40dvh] gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2 xl:grid-cols-3">
          {cards.slice(0, VISIBLE).map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => {
                onOpen(row);
                if (isMobile) setMobileOpen(false);
              }}
              className="block w-full min-w-0 rounded-lg border border-primary/30 bg-card px-3 py-2 text-left shadow-sm transition hover:border-primary"
            >
              <p className="truncate text-sm font-semibold">{row.title}</p>
              {typeof row.data.project_name === "string" && row.data.project_name ? (
                <p className="truncate text-xs text-muted-foreground">{row.data.project_name}</p>
              ) : null}
              <p className="mt-0.5 line-clamp-1 text-xs">{row.message}</p>
              <p className="mt-0.5 text-2xs font-medium text-primary">{t("open")}</p>
            </button>
          ))}
        </div>
      )}
    </aside>,
    dock,
  );
}
