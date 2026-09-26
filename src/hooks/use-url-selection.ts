"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

/**
 * Remove one query parameter from the current URL without a navigation entry.
 */
export function useClearSearchParam(param: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return useCallback(() => {
    if (!searchParams.has(param)) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete(param);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [param, pathname, router, searchParams]);
}

/**
 * Which record a page has open, where a link can open one too.
 *
 * A task card or notification links to `/page?record=<id>` and expects that
 * record to open. Reading the parameter only as a `useState` seed opened it
 * once, on mount: a second card for the same page, or the same card again
 * after closing the dialog, changed nothing because the page never remounts
 * for a query change. Here the URL wins while it names a record, and closing
 * (or opening another row by hand) takes the parameter back out, so the next
 * link to the same record is a real change the page reacts to.
 */
export function useUrlSelection(param: string) {
  const searchParams = useSearchParams();
  const clear = useClearSearchParam(param);
  const [local, setLocal] = useState<string | null>(null);
  const selected = searchParams.get(param) || local;
  const select = useCallback(
    (id: string | null) => {
      setLocal(id);
      clear();
    },
    [clear],
  );
  return [selected, select] as const;
}
