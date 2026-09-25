"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FailedQuery = { isError: boolean; refetch?: () => unknown };

/**
 * The phone's version of `QueryFailedNote`: one short line and a retry.
 *
 * The console's sentence explains that what is on screen is not the real
 * picture. On a site phone that is three lines of red under a select, read
 * with gloves on, so here it is only "the project list did not load" and a
 * link to try again. Renders nothing unless the query failed.
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
  if (!query.isError) return null;
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
