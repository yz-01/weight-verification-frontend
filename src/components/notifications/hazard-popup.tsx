"use client";

/**
 * The hazard pop-up card (C3): slides in at the bottom right when something
 * happens on an open hazard, and slides back out eight seconds later.
 *
 * The client, 4/10: 「还没确认闭环的卡片跳出来…是跳出来飘出来又收回去的那种。
 * 卡片就是说后台有人操作的时候他就跳出来，没有人操作的时候他就睡觉状态。如果可以，
 * 整个页面就很干净」. So unlike the task cards in the dock - which stay until
 * their record finishes - these float, briefly, and only because an event just
 * arrived on the shell's realtime stream. With no events nothing is drawn.
 *
 * Floating covers what is under it for at most eight seconds; each card can
 * also be closed at once. The bell still holds the notice afterwards, so a
 * card that slid away before it was read is not lost.
 *
 * Motion is a slide and a fade; with 「reduce motion」 set it simply appears
 * and disappears.
 */

import { ShieldAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  addHazardCard,
  hazardCardFromEvent,
  isLeaving,
  liveHazardCards,
  nextHazardTick,
  type HazardPopupCard,
  type RealtimeEvent,
} from "@/lib/hazard-popup";
import { cn } from "@/lib/utils";
import { openFieldHref } from "@/lib/field-notification";

/** The cards, the listener for the realtime hook, and a way to close one. */
export function useHazardPopup() {
  const [cards, setCards] = useState<HazardPopupCard[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const onEvent = useCallback((event: RealtimeEvent) => {
    const at = Date.now();
    const card = hazardCardFromEvent(event, at);
    if (!card) return;
    setNow(at);
    setCards((current) => addHazardCard(liveHazardCards(current, at), card));
  }, []);

  const dismiss = useCallback((id: string) => {
    setCards((current) => current.filter((card) => card.id !== id));
  }, []);

  // One timer, for whichever card changes next: it starts sliding out, or it
  // is removed. Nothing runs while there are no cards.
  useEffect(() => {
    const next = nextHazardTick(cards, now);
    if (next === null) return;
    const timer = window.setTimeout(() => {
      const at = Date.now();
      setNow(at);
      setCards((current) => liveHazardCards(current, at));
    }, Math.max(0, next - Date.now()));
    return () => window.clearTimeout(timer);
  }, [cards, now]);

  return { cards, now, onEvent, dismiss };
}

export function HazardPopupStack({
  cards,
  now,
  onDismiss,
}: {
  cards: readonly HazardPopupCard[];
  now: number;
  onDismiss: (id: string) => void;
}) {
  const t = useTranslations("hazard.popup");
  const router = useRouter();
  if (cards.length === 0) return null;
  return (
    <section
      aria-label={t("region")}
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-40 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {cards.map((card) => (
        <article
          key={card.id}
          data-leaving={isLeaving(card, now) || undefined}
          className={cn(
            "pointer-events-auto rounded-lg border border-warning/40 bg-card p-3 shadow-lg",
            "animate-in fade-in-0 slide-in-from-bottom-4 duration-300",
            "data-[leaving]:animate-out data-[leaving]:fade-out-0 data-[leaving]:slide-out-to-right-8 data-[leaving]:fill-mode-forwards",
            "motion-reduce:animate-none motion-reduce:data-[leaving]:animate-none",
          )}
        >
          <div className="flex items-start gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-warning/15 text-warning">
              <ShieldAlert className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold tabular">{card.incidentNo}</p>
              {card.incidentTitle && (
                <p className="truncate text-sm">{card.incidentTitle}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {[card.actor, card.what].filter(Boolean).join(" · ")}
              </p>
              {card.detail && (
                <p className="line-clamp-2 text-xs text-muted-foreground">{card.detail}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              aria-label={t("dismiss")}
              onClick={() => onDismiss(card.id)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                onDismiss(card.id);
                openFieldHref(card.href, router.push);
              }}
            >
              {t("open")}
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
