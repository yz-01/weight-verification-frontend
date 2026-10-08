"use client";

import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { NotificationSummary } from "@/interfaces/platform-ops";

/**
 * The count as one comparable value: what is waiting, per kind, in a fixed
 * order (the server's per-kind breakdown comes in no particular order).
 * `null` while there is no answer.
 */
export function countSignature(count: NotificationSummary | undefined): string | null {
  if (!count) return null;
  const kinds = Object.entries(count.by_kind ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, total]) => `${kind}:${total}`)
    .join(",");
  return `${count.total}/${count.action}/${count.today}/${kinds}`;
}

/** Whether the count moved: both known, and different. */
export function countMoved(previous: string | null, next: string | null): boolean {
  return previous !== null && next !== null && previous !== next;
}

/**
 * Refetch `queryKey` when `signature` changes - not on the first value, and
 * not while it is unknown (`null`).
 *
 * The bell's list (the popover rows, the office's pop-up action cards and the
 * alert tone) used to poll every 30 s beside the count that already polls.
 * In the office the count is every outstanding notice, so the list only has
 * something new when the count moves, and it follows the count instead: one list request per change rather than two requests per
 * tick on every open tab (FABLE_PERF_1008 #10). The live stream's
 * invalidation still refreshes it as before.
 */
export function useRefetchWhenChanged(
  signature: string | null,
  queryKey: QueryKey,
): void {
  const queryClient = useQueryClient();
  const last = useRef<string | null>(null);
  // Held in a ref so a caller's inline key array does not re-run the effect.
  const key = useRef(queryKey);
  useEffect(() => {
    key.current = queryKey;
  });
  useEffect(() => {
    if (signature === null) return;
    if (countMoved(last.current, signature)) {
      void queryClient.invalidateQueries({ queryKey: key.current, exact: true });
    }
    last.current = signature;
  }, [queryClient, signature]);
}
