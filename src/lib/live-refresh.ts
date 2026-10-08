import type { Query, QueryClient } from "@tanstack/react-query";

/**
 * How the realtime layer refreshes what is on screen (audit S1, 2026-10-08).
 *
 * Two different questions, two different answers:
 *
 * - **Something changed** (a stream event, the stream-down fallback, an
 *   offline upload): mark every live query stale and refetch the ones on
 *   screen. An event means the data moved, so a list fetched ten seconds ago
 *   still has to reload.
 * - **The one-minute safety poll**: nothing is known to have changed; it only
 *   bounds how stale a screen can get. It refetches what is on screen *and*
 *   already stale by its own `staleTime`, so an hour-fresh permission matrix
 *   or a five-minute option list is left alone, and a card that polls itself
 *   (`refetchInterval`) is not fetched twice.
 *
 * Neither re-runs a query tagged `meta: NOT_LIVE` - report aggregations, the
 * expensive reads a person asked for with a filter. Those refresh when the
 * person comes back to the tab (`refetchOnWindowFocus`, honouring
 * `staleTime`), changes a filter or reopens the page, not 60 times an hour on
 * top of whatever else the page does.
 */
export const NOT_LIVE = { live: false } as const;

function isLive(query: Query): boolean {
  return query.meta?.live !== false;
}

function pollsItself(query: Query): boolean {
  return query.observers.some((observer) => Boolean(observer.options.refetchInterval));
}

/** Something changed: every live query is out of date; refetch those on screen. */
export function refreshChanged(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ predicate: isLive });
}

/** The safety poll: refetch only what is on screen, stale, live and not polling itself. */
export function refreshStale(queryClient: QueryClient): Promise<void> {
  return queryClient.refetchQueries({
    type: "active",
    stale: true,
    predicate: (query) => isLive(query) && !pollsItself(query),
  });
}
