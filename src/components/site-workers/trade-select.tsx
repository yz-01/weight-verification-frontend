"use client";

/**
 * 「施工工种」 on 新增 / 编辑人员 (JB91, 客户 10-31 第 1 点): 「例如钢筋工、模板工、
 * 混凝土工、电工、普工等，支持自行新增工种」.
 *
 * A dropdown of the company's trades with 「新增工种」 right beside it: the
 * office types a name, it joins the list and is chosen at once - no trip to
 * another screen. A name already on the list is that trade, not a second one.
 * Optional: 「未填工种」 is a choice too.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/interfaces/api";
import type { SiteWorkerTrade } from "@/interfaces/site-workers";
import { tradeLabel } from "@/lib/site-workers";
import { createWorkerTrade, getWorkerTrades } from "@/services/site-workers.service";

const NONE = "__none__";

/** The company's trades, for the form and the summary's names. */
export function useWorkerTrades(project?: string) {
  // query-failure: TradeSelect shows the QueryFailedNote for this query
  return useQuery({
    queryKey: ["site-workers", "trades", project || "mine"],
    queryFn: () => getWorkerTrades(project || undefined),
    staleTime: 60_000,
  });
}

export function useTradeLabel() {
  const t = useTranslations("siteWorkers.trade");
  return (trade: { code?: string | null; name?: string | null }) =>
    tradeLabel(trade, (code) => t(`builtIn.${code}`));
}

export function TradeSelect({
  project,
  value,
  current,
  canAdd,
  onChange,
}: {
  /** Whose list: the project's company. */
  project?: string;
  value: string;
  /** The worker's trade as saved, shown even if it is no longer offered. */
  current?: { id: string; code: string; name: string } | null;
  canAdd: boolean;
  onChange: (trade: string) => void;
}) {
  const t = useTranslations("siteWorkers");
  const label = useTradeLabel();
  const queryClient = useQueryClient();
  const trades = useWorkerTrades(project);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [added, setAdded] = useState<SiteWorkerTrade | null>(null);

  const create = useMutation({
    mutationFn: () => createWorkerTrade(name.trim(), project || undefined),
    onMutate: () => setError(""),
    onSuccess: (trade) => {
      void queryClient.invalidateQueries({ queryKey: ["site-workers", "trades"] });
      void queryClient.invalidateQueries({ queryKey: ["site-workers", "trade-summary"] });
      setAdded(trade);
      setAdding(false);
      setName("");
      onChange(trade.id);
    },
    onError: (failure) =>
      setError(failure instanceof ApiError ? failure.message : t("trade.addFailed")),
  });

  const rows = [...(trades.data ?? [])];
  // Shown before the list refetches, and a trade switched off since.
  for (const extra of [added, current]) {
    if (extra && !rows.some((row) => row.id === extra.id)) {
      rows.push({ sort_order: 0, is_active: false, built_in: false, ...extra });
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Select value={value || NONE} onValueChange={(next) => onChange(next === NONE ? "" : next)}>
          <SelectTrigger className="w-full" aria-label={t("field.trade")}>
            <SelectValue placeholder={t("trade.none")} />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={NONE}>{t("trade.none")}</SelectItem>
            {rows.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {label(row)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canAdd && !adding && (
          <Button type="button" variant="outline" className="shrink-0" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            {t("trade.add")}
          </Button>
        )}
      </div>
      {adding && (
        <div className="flex items-end gap-2" data-testid="trade-creator">
          <FieldWrapper label={t("trade.newName")} required error={error || undefined} className="min-w-0 flex-1">
            <Input
              autoFocus
              placeholder={t("trade.newNamePlaceholder")}
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && name.trim()) {
                  event.preventDefault();
                  create.mutate();
                }
              }}
            />
          </FieldWrapper>
          <Button
            type="button"
            className="shrink-0"
            onClick={() => create.mutate()}
            disabled={create.isPending}
            requires={[[name.trim(), t("trade.newName")]]}
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("trade.addConfirm")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("trade.addCancel")}
            onClick={() => {
              setAdding(false);
              setName("");
              setError("");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <QueryFailedNote query={trades} what={t("what.trades")} />
    </div>
  );
}
