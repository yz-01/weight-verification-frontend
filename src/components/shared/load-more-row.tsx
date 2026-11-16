"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { PagedRows } from "@/hooks/use-paged-list";
import { cn } from "@/lib/utils";

/**
 * Under a table read with `usePagedList`: how many rows are on screen out of
 * how many there are, and 「加载更多」 for the next hundred (JB209-14, Lucas
 * 11-16 audit X-2). Shows nothing once every row is loaded, so a short list
 * looks exactly as it did.
 */
export function LoadMoreRow({
  list,
  className,
}: {
  list: {
    data?: PagedRows<unknown>;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
  };
  className?: string;
}) {
  const t = useTranslations("pagedList");
  if (!list.hasNextPage) return null;
  return (
    <div
      data-load-more
      className={cn(
        "flex flex-wrap items-center justify-center gap-3 border-t border-panel-border px-4 py-3",
        className,
      )}
    >
      <span className="tabular text-xs text-muted-foreground">
        {t("shown", { shown: list.data?.results.length ?? 0, total: list.data?.count ?? 0 })}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={list.isFetchingNextPage}
        onClick={() => void list.fetchNextPage()}
      >
        {list.isFetchingNextPage && <Loader2 className="animate-spin" />}
        {t("loadMore")}
      </Button>
    </div>
  );
}
