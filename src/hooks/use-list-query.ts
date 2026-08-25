"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import type { ListQuery } from "@/interfaces/api";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Table state, held in the URL.
 *
 * Page, size, search, sort and filters all live in the query string so a
 * filtered view is a link someone can paste into a message, and so the back
 * button restores the list a user came from rather than its default.
 *
 * Anything that changes what is being looked at resets the page to 1.
 * Otherwise filtering a hundred rows down to three while sitting on page four
 * shows an empty table, which reads as "no results" rather than "wrong page".
 */
export function useListQuery(extraKeys: string[] = []) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Call sites pass a literal array, which is a new reference on every render.
  // Collapsing it to a string gives the memos below a stable dependency
  // without asking every caller to hoist or memoise its own list.
  const filterKeys = extraKeys.join(",");
  const keys = useMemo(
    () => (filterKeys ? filterKeys.split(",") : []),
    [filterKeys],
  );

  const page = Number(searchParams.get("page") ?? "1") || 1;
  const pageSize =
    Number(searchParams.get("page_size") ?? String(DEFAULT_PAGE_SIZE)) ||
    DEFAULT_PAGE_SIZE;
  const search = searchParams.get("search") ?? "";
  const sortBy = searchParams.get("sort_by") ?? "";
  const sortOrder = (searchParams.get("sort_order") ?? "asc") as "asc" | "desc";

  const filters = useMemo(() => {
    const result: Record<string, string> = {};
    for (const key of keys) {
      const value = searchParams.get(key);
      if (value) result[key] = value;
    }
    return result;
  }, [searchParams, keys]);

  const write = useCallback(
    (updates: Record<string, string | number | undefined>, resetPage = true) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }
      if (resetPage && !("page" in updates)) {
        next.delete("page");
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setPage = useCallback(
    (value: number) => write({ page: value === 1 ? undefined : value }, false),
    [write],
  );

  const setPageSize = useCallback(
    (value: number) =>
      write({ page_size: value === DEFAULT_PAGE_SIZE ? undefined : value }),
    [write],
  );

  const setSearch = useCallback(
    (value: string) => write({ search: value || undefined }),
    [write],
  );

  const setSort = useCallback(
    (field: string, order: "asc" | "desc") =>
      write({ sort_by: field || undefined, sort_order: field ? order : undefined }),
    [write],
  );

  const setFilter = useCallback(
    (key: string, value: string | undefined) => write({ [key]: value }),
    [write],
  );

  const setFilters = useCallback(
    (updates: Record<string, string | undefined>) => write(updates),
    [write],
  );

  const clearFilters = useCallback(() => {
    const cleared: Record<string, undefined> = { search: undefined };
    for (const key of keys) cleared[key] = undefined;
    write(cleared);
  }, [write, keys]);

  const hasFilters =
    search !== "" || keys.some((key) => searchParams.get(key) !== null);

  /** The shape the service layer sends to the API. */
  const query: ListQuery = useMemo(
    () => ({
      page,
      page_size: pageSize,
      search: search || undefined,
      sort_by: sortBy || undefined,
      sort_order: sortBy ? sortOrder : undefined,
      ...filters,
    }),
    [page, pageSize, search, sortBy, sortOrder, filters],
  );

  return {
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
    filters,
    hasFilters,
    query,
    setPage,
    setPageSize,
    setSearch,
    setSort,
    setFilter,
    setFilters,
    clearFilters,
  };
}
