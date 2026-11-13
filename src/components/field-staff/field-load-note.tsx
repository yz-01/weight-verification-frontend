"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { usePhoneOffline } from "@/hooks/use-phone-offline";
import { cn } from "@/lib/utils";

type FailedQuery = { isError: boolean; refetch?: () => unknown };

/**
 * What did not load while the phone had no network is asked for again when
 * the network is back - the quiet line below says it will be, so it is.
 */
function useLoadAgainWhenBack(failed: boolean, offline: boolean, again?: () => unknown) {
  const wasOffline = useRef(false);
  const retry = useRef(again);
  useEffect(() => {
    retry.current = again;
  }, [again]);
  useEffect(() => {
    if (offline) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current && failed) retry.current?.();
    wasOffline.current = false;
  }, [failed, offline]);
}

/**
 * The phone's version of `QueryFailedNote`: one short line and a retry.
 *
 * The console's sentence explains that what is on screen is not the real
 * picture. On a site phone that is three lines of red under a select, read
 * with gloves on, so here it is only "the project list did not load" and a
 * link to try again. Renders nothing unless the query failed.
 *
 * No connection is not a failure (Lucas 2026-10-23: said once and calmly, by
 * the offline line at the top of the phone): then this is one grey line, and
 * the list is asked for again by itself when the network is back.
 */
export function FieldLoadNote({
  query,
  what,
  className,
}: {
  query: FailedQuery;
  what: string;
  className?: string;
}) {
  const t = useTranslations("fieldStaffPwa");
  const tc = useTranslations("common");
  const offline = usePhoneOffline();
  useLoadAgainWhenBack(query.isError, offline, query.refetch);
  if (!query.isError) return null;
  if (offline) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)} data-field-load-offline>
        {tc("loadOffline", { what })}
      </p>
    );
  }
  return (
    <p role="alert" className={cn("flex flex-wrap items-center gap-x-2 text-xs text-destructive", className)}>
      <span>{t("error.loadShort", { what })}</span>
      {query.refetch && (
        <button type="button" className="font-medium underline" onClick={() => query.refetch?.()}>
          {t("action.retry")}
        </button>
      )}
    </p>
  );
}

/** The same failure, in place of a list or a card, with a real retry button. */
export function FieldLoadFailed({
  what,
  onRetry,
  className,
}: {
  what: string;
  onRetry: () => unknown;
  className?: string;
}) {
  const t = useTranslations("fieldStaffPwa");
  const tc = useTranslations("common");
  const offline = usePhoneOffline();
  useLoadAgainWhenBack(true, offline, onRetry);
  if (offline) {
    return (
      <p className={cn("rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground", className)} data-field-load-offline>
        {tc("loadOffline", { what })}
      </p>
    );
  }
  return (
    <div role="alert" className={cn("flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3", className)}>
      <p className="text-sm text-destructive">{t("error.loadShort", { what })}</p>
      <Button type="button" size="sm" variant="outline" onClick={() => onRetry()}>
        <RefreshCw />
        {t("action.retry")}
      </Button>
    </div>
  );
}
