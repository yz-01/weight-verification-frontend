"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface PageTitleOverride {
  title: string | null;
  setTitle: (title: string | null) => void;
}

const PageTitleOverrideContext = createContext<PageTitleOverride | null>(null);

/**
 * Lets a page name itself more precisely than its menu entry does (B14).
 *
 * The top bar names the page from the menu (`useCurrentNav`), which reads the
 * path only - so `/site-equipment?direction=EXIT` was still 「设备进退场」
 * while the list showed nothing but exits. A page that knows better says so
 * with `usePageTitle`, and `PageTitle` in the top bar prefers it.
 */
export function PageTitleOverrideProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  const value = useMemo(() => ({ title, setTitle }), [title]);
  return (
    <PageTitleOverrideContext.Provider value={value}>
      {children}
    </PageTitleOverrideContext.Provider>
  );
}

/** The page's own name for itself, when it has set one. */
export function usePageTitleOverride(): string | null {
  return useContext(PageTitleOverrideContext)?.title ?? null;
}

/**
 * Names the current page in the top bar while the calling component is
 * mounted. `null` leaves the menu's name in place. Cleared on unmount, so the
 * next page never inherits it.
 */
export function usePageTitle(title: string | null) {
  const setTitle = useContext(PageTitleOverrideContext)?.setTitle;
  useEffect(() => {
    if (!setTitle) return;
    setTitle(title);
    return () => setTitle(null);
  }, [setTitle, title]);
}
