"use client";

/**
 * Filters that stay (JB300, 客户 11-28d 事项 3): 「选择2026年9月后，切换其他页面再
 * 返回，原本设定的期数自动清空。请保留用户已选择的期数，除非用户主动修改或清除筛选」
 * and 「切换页面再返回时，开始日期又自动恢复为11月1日，导致金额消失……请同时修复两个
 * 页面的日期筛选保留问题，确保切换页面不会自动改变统计范围及金额」.
 *
 * A page's filters live in its address (`useListQuery`), so the back button
 * and a refresh keep them; a menu click opens the bare address, which used to
 * mean the defaults. Now each change is also kept for this person in this
 * browser (`localStorage`, per user so a second person on the same computer
 * does not inherit it), and a bare address puts the kept choice back. An
 * address that names any of the filters wins (a link from another page).
 * 【清除筛选】 empties the address, and so the kept choice too.
 *
 * Storage can be refused (a private window): every read and write is in
 * try / catch and the page then simply opens on its defaults.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { useAuth } from "@/components/providers/auth-provider";

export function keptFiltersKey(page: string, userId: string): string {
  return `mse.filters.${page}.${userId || "anon"}`;
}

/** The kept values of `keys` for this page and person, or `{}`. */
export function readKeptFilters(page: string, userId: string, keys: readonly string[]): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(keptFiltersKey(page, userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const kept: Record<string, string> = {};
    for (const key of keys) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "string" && value) kept[key] = value;
    }
    return kept;
  } catch {
    return {};
  }
}

/** Keep `values` (empty ones dropped); nothing left removes the entry. */
export function writeKeptFilters(page: string, userId: string, values: Record<string, string | null | undefined>): void {
  try {
    const kept = Object.fromEntries(Object.entries(values).filter(([, value]) => Boolean(value)));
    const key = keptFiltersKey(page, userId);
    const text = JSON.stringify(kept);
    if (Object.keys(kept).length) {
      if (window.localStorage.getItem(key) === text) return;
      window.localStorage.setItem(key, text);
    } else {
      if (window.localStorage.getItem(key) === null) return;
      window.localStorage.removeItem(key);
    }
    window.dispatchEvent(new Event(KEPT_EVENT));
  } catch {
    // No storage: the choice holds while the address does.
  }
}

/**
 * The query to restore to, or `null` to leave the address as it is: only a
 * bare address (none of `keys` in it) takes the kept values.
 */
export function restoredQuery(
  current: URLSearchParams,
  keys: readonly string[],
  kept: Record<string, string>,
): string | null {
  if (keys.some((key) => current.get(key))) return null;
  const entries = Object.entries(kept).filter(([key, value]) => keys.includes(key) && value);
  if (!entries.length) return null;
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of entries) next.set(key, value);
  return next.toString();
}

const KEPT_EVENT = "mse-kept-filters";

function subscribeKept(onChange: () => void): () => void {
  window.addEventListener(KEPT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(KEPT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function keptRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribeNothing(): () => void {
  return () => {};
}

/**
 * Keep `keys` of this page's address for this person. `page` null switches it
 * off (a shared screen keeping only some of its reports). `ready` is false
 * while a kept choice is still to be put back in the address - a page waits
 * for it before asking the server, so the default range never flashes its
 * amount.
 */
export function useKeptFilters(page: string | null, keys: readonly string[]): { ready: boolean } {
  const { user } = useAuth();
  const userId = user?.id ? String(user.id) : "";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const keysKey = keys.join(",");
  const storeKey = page ? keptFiltersKey(page, userId) : "";
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const raw = useSyncExternalStore(subscribeKept, () => (storeKey ? keptRaw(storeKey) : null), () => null);
  const values = useMemo(() => {
    const found: Record<string, string> = {};
    for (const key of keysKey ? keysKey.split(",") : []) {
      const value = searchParams.get(key);
      if (value) found[key] = value;
    }
    return found;
  }, [searchParams, keysKey]);
  const restoreTo = useMemo(() => {
    if (!page || !mounted || !raw) return null;
    const list = keysKey ? keysKey.split(",") : [];
    return restoredQuery(new URLSearchParams(searchParams.toString()), list, readKeptFilters(page, userId, list));
  }, [page, mounted, raw, keysKey, searchParams, userId]);
  // The page has just opened: a bare address takes the kept choice once.
  // Afterwards a bare address is the reader's own 【清除】, which is kept.
  const opening = useRef(true);

  useEffect(() => {
    if (!page || !mounted) return;
    if (opening.current) {
      opening.current = false;
      if (restoreTo !== null) {
        router.replace(restoreTo ? `${pathname}?${restoreTo}` : pathname, { scroll: false });
        return;
      }
    }
    writeKeptFilters(page, userId, values);
  }, [page, mounted, restoreTo, router, pathname, userId, values]);

  return { ready: !page || (mounted && restoreTo === null) };
}

/** Write some query parameters of this page's address (empty ones removed), no history entry. */
export function useWriteSearchParams(): (updates: Record<string, string | undefined>) => void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (updates) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
}
