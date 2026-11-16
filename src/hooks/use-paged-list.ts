"use client";

import { useInfiniteQuery, type InfiniteData, type QueryKey } from "@tanstack/react-query";

import type { Paginated } from "@/interfaces/api";

/**
 * The most rows one request can bring back: the server's `max_page_size`
 * (`core/pagination.py`). Asking for 200 or 500 is answered with 100 and no
 * word about the rest.
 */
export const PAGE_LIMIT = 100;

/** A type, not an interface, so it passes as a `ListQuery` (an interface has no index signature). */
export type PageRequest = {
  page: number;
  page_size: number;
};

/** A list read so far: the rows loaded and how many the server holds. */
export interface PagedRows<T> {
  results: T[];
  count: number;
}

function flattenPages<T>(data: InfiniteData<Paginated<T>, number>): PagedRows<T> {
  return {
    results: data.pages.flatMap((page) => page.results),
    count: data.pages[0]?.count ?? 0,
  };
}

/**
 * A list a hundred rows at a time, with the rest one 「加载更多」 away.
 *
 * JB209-14 (Lucas 11-16 audit, X-2): the sales, partner, customer-service,
 * technical-support, asset and cloud lists asked for 200 or 500 rows, got the
 * server's 100 and showed no sign of the rest - the 101st 领用 could never be
 * returned, the 101st ticket never opened. This reads page after page the way
 * the other long lists do (`gate-records.tsx`, `headquarters-tasks.tsx`) and
 * hands back `data` in the shape those panels already read
 * (`rows.data?.results`), so a panel changes one line and gains a
 * `<LoadMoreRow list={rows} />` under its table.
 *
 * `"paged"` closes the key so an infinite list never shares a cache entry
 * with a plain query of the same name; invalidating the name still reaches
 * it.
 */
export function usePagedList<T>({
  queryKey,
  queryFn,
  enabled = true,
}: {
  queryKey: QueryKey;
  queryFn: (paging: PageRequest) => Promise<Paginated<T>>;
  enabled?: boolean;
}) {
  const list = useInfiniteQuery({
    queryKey: [...queryKey, "paged"],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => queryFn({ page: pageParam, page_size: PAGE_LIMIT }),
    getNextPageParam: (last: Paginated<T>, pages: Paginated<T>[]) =>
      pages.reduce((sum, page) => sum + page.results.length, 0) < last.count
        ? pages.length + 1
        : undefined,
    select: flattenPages<T>,
    enabled,
  });
  return list;
}

/**
 * Every page of a list, for a picker.
 *
 * A dropdown cannot say 「加载更多」, so the 101st company would simply never
 * be offered (JB209-14, X-2). Reads page 1, then the others side by side, the
 * way `getAllNotifications` does, and returns one `Paginated` holding all of
 * them - the shape the picker already reads.
 */
export async function readAllPages<T>(
  read: (paging: PageRequest) => Promise<Paginated<T>>,
): Promise<Paginated<T>> {
  const first = await read({ page: 1, page_size: PAGE_LIMIT });
  if (first.total_pages <= 1) return first;
  const rest = await Promise.all(
    Array.from({ length: first.total_pages - 1 }, (_, index) =>
      read({ page: index + 2, page_size: PAGE_LIMIT }),
    ),
  );
  return {
    ...first,
    page: 1,
    page_size: PAGE_LIMIT,
    results: [first, ...rest].flatMap((page) => page.results),
  };
}
