"use client";

/**
 * 人员名单 › 「按工种汇总」 (JB91, 客户 10-31 第 3–5 点).
 *
 * 「参考设备进退场「按供应商汇总」的设计」: the same folding card of small
 * cards (`CountCardsFold`), one per trade - 「登记 N 人 · 在场 M 人」 - and
 * 「未填工种」. 「点击工种，直接筛选下方现有人员名单」: a card sets the roster's
 * own `trade` filter (in the address, like the other filters); pressed again
 * it lets go.
 *
 * 在场 is the roster's own 在场 (an open stay by the fence, the server's
 * `presence.status_q`), so the cards and the 在场 pill under them always
 * agree. 「最后更新」 is the moment the server counted them; the cards and
 * the list ask again every minute.
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { useAuth } from "@/components/providers/auth-provider";
import { CountCardsFold, type CountCard } from "@/components/shared/count-cards-fold";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { useTradeLabel } from "@/components/site-workers/trade-select";
import type { useListQuery } from "@/hooks/use-list-query";
import type { TradeSummary } from "@/interfaces/site-workers";
import { useDateFormat } from "@/lib/dates";
import { NO_TRADE, clock24, nextTradeFilter, tradeSummaryQuery } from "@/lib/site-workers";
import { getTradeSummary } from "@/services/site-workers.service";

/** How often the roster and its cards ask again: 在场 follows the fence by itself (「自动更新」). */
export const ROSTER_REFRESH_MS = 60_000;

/** Whether 按工种汇总 is open: the reader's last choice on this browser, open at first. */
const FOLD_KEY = "site-worker-trade-summary-open";

/** The cards in order: the company's trades as listed, then 「未填工种」. */
export function tradeCards(
  data: TradeSummary,
  chosen: string | undefined,
  label: (trade: { code?: string; name?: string }) => string,
  noTradeLabel: string,
): Array<{ value: string; label: string; registered: number; onSite: number; active: boolean }> {
  return [
    ...data.results.map((row) => ({
      value: row.value,
      label: label(row),
      registered: row.registered,
      onSite: row.on_site,
      active: chosen === row.value,
    })),
    {
      value: NO_TRADE,
      label: noTradeLabel,
      registered: data.no_trade.registered,
      onSite: data.no_trade.on_site,
      active: chosen === NO_TRADE,
    },
  ];
}

export function TradeSummaryPanel({ list }: { list: ReturnType<typeof useListQuery> }) {
  const t = useTranslations("siteWorkers.tradeSummary");
  const trade = useTranslations("siteWorkers.trade");
  const label = useTradeLabel();
  const df = useDateFormat();
  const { user } = useAuth();
  const timeZone = user?.company_preferences?.timezone || user?.timezone || "Asia/Kuala_Lumpur";
  const query = tradeSummaryQuery(list.query);
  // query-failure: the QueryFailedNote below
  const summary = useQuery({
    queryKey: ["site-workers", "trade-summary", query],
    queryFn: () => getTradeSummary(query),
    refetchInterval: ROSTER_REFRESH_MS,
  });
  const data = summary.data;
  const chosen = list.filters.trade;
  const cards: CountCard[] = data
    ? tradeCards(data, chosen, label, trade("none")).map((card) => ({
        key: card.value,
        label: card.label,
        active: card.active,
        muted: card.registered === 0,
        onPress: () => list.setFilter("trade", nextTradeFilter(chosen, card.value)),
        numbers: (
          <>
            {t("registered", { count: card.registered })}
            {" · "}
            <span className={`font-semibold ${card.onSite > 0 ? "text-success" : "text-muted-foreground"}`}>
              {t("onSite", { count: card.onSite })}
            </span>
          </>
        ),
      }))
    : [];

  return (
    <div className="flex flex-col gap-2">
      <QueryFailedNote query={summary} what={t("what")} />
      {data && (
        <CountCardsFold
          storageKey={FOLD_KEY}
          title={t("title")}
          badge={t("headline", { registered: data.registered, onSite: data.on_site })}
          foldHint={t("foldHint")}
          unfoldHint={t("unfoldHint")}
          pickHint={t("pickHint")}
          aside={
            <span className="tabular-nums" data-testid="trade-summary-updated">
              {t("updatedAt", { at: `${df.date(data.updated_at)} ${clock24(data.updated_at, timeZone)}` })}
            </span>
          }
          cards={cards}
        />
      )}
    </div>
  );
}
