"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  navLeaves,
  visibleNavigation,
  type FeatureNavChild,
  type FeatureNavItem,
} from "@/lib/navigation";

export interface CurrentNav {
  /** The sidebar entry the page belongs to. */
  item: FeatureNavItem;
  /** The page itself, when the entry has pages under it. */
  leaf: FeatureNavChild | null;
  /** The level the page sits in: its siblings, itself included. */
  siblings: readonly FeatureNavChild[];
}

/**
 * Where the page being read sits in the menu, by the menu's own rules.
 *
 * The top bar names it (B02) and offers its sibling pages (B04). Both read
 * `visibleNavigation`, so neither can name or offer a page the sidebar would
 * not show this person. A detail page (`/receipts/<id>`) belongs to the
 * closest entry above it.
 */
export function useCurrentNav(): CurrentNav | null {
  const pathname = usePathname();
  const { user } = useAuth();

  return useMemo(() => {
    const items = visibleNavigation(
      user?.portal,
      user?.features,
      user?.permissions,
      user?.is_superuser,
    ).flatMap((group) => group.items);

    let best: { nav: CurrentNav; length: number } | null = null;
    const consider = (nav: CurrentNav, href: string) => {
      const route = href.split("?", 1)[0];
      if (pathname !== route && !pathname.startsWith(`${route}/`)) return;
      if (best && route.length <= best.length) return;
      best = { nav, length: route.length };
    };

    for (const item of items) {
      const children = item.children ?? [];
      if (!children.length) {
        consider({ item, leaf: null, siblings: [] }, item.href);
        continue;
      }
      const walk = (level: readonly FeatureNavChild[]) => {
        for (const child of level) {
          if (child.children?.length) walk(child.children);
          else consider({ item, leaf: child, siblings: level }, child.href);
        }
      };
      walk(children);
    }
    return (best as { nav: CurrentNav } | null)?.nav ?? null;
  }, [
    pathname,
    user?.features,
    user?.is_superuser,
    user?.permissions,
    user?.portal,
  ]);
}

/** Every page of an entry, for a switcher that lists them all. */
export function entryPages(item: FeatureNavItem): FeatureNavChild[] {
  return navLeaves(item.children);
}
