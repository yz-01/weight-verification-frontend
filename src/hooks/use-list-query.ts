"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { useCurrentProject } from "@/components/providers/current-project-provider";
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
 * The one exception is `project`, when the list has it and the top bar's
 * 「当前项目」 is in force (B13): then the list is on the top bar's project
 * (none for 全部项目), and setting `project` moves the top bar. A `?project=`
 * in the address still decides - the top bar adopts it first.
 *
 * Anything that changes what is being looked at resets the page to 1.
 * Otherwise filtering a hundred rows down to three while sitting on page four
 * shows an empty table, which reads as "no results" rather than "wrong page".
 */
export function useListQuery(extraKeys: string[] = []) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = useCurrentProject();

  // Call sites pass a literal array, which is a new reference on every render.
  // Collapsing it to a string gives the memos below a stable dependency
  // without asking every caller to hoist or memoise its own list.
  //
  // `needs_action` is every list's: 「待处理 N」 in a page's header turns it
  // on (`NeedsActionChip`, Lucas 2026-10-09), and an endpoint that does not
  // know it ignores it.
  const filterKeys = [
    ...extraKeys.filter((key) => key !== "needs_action"),
    "needs_action",
  ].join(",");
  const keys = useMemo(
    () => (filterKeys ? filterKeys.split(",") : []),
    [filterKeys],
  );
  const topBarProject =
    current.active && keys.includes("project") ? current.projectId : null;
  const setTopBarProject = current.setProjectId;

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
    if (topBarProject !== null) {
      delete result.project;
      if (topBarProject) result.project = topBarProject;
    }
    return result;
  }, [searchParams, keys, topBarProject]);

  const write = useCallback(
    (updates: Record<string, string | number | undefined>, resetPage = true) => {
      const next = new URLSearchParams(searchParams.toString());
      if (topBarProject !== null && "project" in updates) {
        const { project, ...rest } = updates;
        setTopBarProject(project ? String(project) : "");
        next.delete("project");
        updates = rest;
      }
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
    [router, pathname, searchParams, topBarProject, setTopBarProject],
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
    for (const key of keys) {
      // The top bar's project is not one of this list's filters to clear.
      if (key === "project" && topBarProject !== null) continue;
      cleared[key] = undefined;
    }
    write(cleared);
  }, [write, keys, topBarProject]);

  const hasFilters =
    search !== "" ||
    keys.some(
      (key) =>
        !(key === "project" && topBarProject !== null) &&
        searchParams.get(key) !== null,
    );

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
