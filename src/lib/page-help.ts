import { PORTAL_NAVIGATION, navLeaves, type PortalFeatureKey } from "@/lib/navigation";
import type { Portal } from "@/interfaces/auth";

/**
 * Which module's help belongs on the screen the person is standing on.
 *
 * The help button used to open the same three sentences on all ninety-six
 * screens that have one - "look at what is there, do the thing, check the
 * result" - which is true of every screen ever built and therefore says
 * nothing about any of them. It looked like per-page help and was not, which
 * is the worst of both: the reader opens it, learns nothing, and stops opening
 * it.
 *
 * So help is keyed to the module the route belongs to, and the module is
 * resolved from the navigation registry rather than passed in by hand at each
 * of the ninety-six call sites, where it would drift the first time a page
 * moved.
 *
 * Resolution is most-specific-first: a child entry's route beats its parent
 * module's, because `/weighing` under the contractor's recycling module is a
 * different screen from `/weighing` as the recycler's own weighbridge desk,
 * and the reader needs the one they are actually looking at.
 */

/** A help entry that is not a module's own feature key (JB206-12). */
export type HelpKey = PortalFeatureKey | "company_settings_trace";

/**
 * Screens whose help is not their menu entry's (JB206-12, Lucas 11-16 audit,
 * U1 and U2). Checked before the menu, for one portal only.
 *
 * - 隐患整改 is declared under the `safety` feature (navigation.ts says why),
 *   whose help was written for the removed 安全事件 / 事故上报; the page has
 *   its own, `hazard_rectification`.
 * - The contractor's 公司设置 has had no external links or bank details
 *   since JB99, which `company_settings` - MSE Scrap's page, unchanged -
 *   talks about; it gets its own words.
 */
const HELP_OVERRIDES: Partial<Record<Portal, Readonly<Record<string, HelpKey>>>> = {
  MSE_TRACE: {
    "/hazard-rectifications": "hazard_rectification",
    "/company-settings": "company_settings_trace",
  },
};

/** A route matches when it is the page itself or something beneath it. */
function covers(href: string, pathname: string): boolean {
  const route = href.split("?", 1)[0];
  return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * The help key for a route, or null when no module claims it.
 *
 * Returning null rather than a generic fallback is deliberate: a screen with
 * no help of its own should show no help button at all, which is honest, and
 * `navigation.test.ts` fails when a module has no entry so the gap is caught
 * before anyone sees it.
 */
export function helpKeyFor(
  portal: Portal | undefined,
  pathname: string,
): HelpKey | null {
  if (!portal) return null;
  for (const [route, key] of Object.entries(HELP_OVERRIDES[portal] ?? {})) {
    if (covers(route, pathname)) return key;
  }
  const items = PORTAL_NAVIGATION[portal];
  if (!items) return null;

  let best: { key: PortalFeatureKey; length: number } | null = null;

  const consider = (key: PortalFeatureKey, href: string) => {
    if (!covers(href, pathname)) return;
    const length = href.split("?", 1)[0].length;
    if (!best || length > best.length) best = { key, length };
  };

  for (const item of items) {
    consider(item.feature, item.href);
    for (const prefix of item.routePrefixes ?? []) {
      consider(item.feature, prefix);
    }
    for (const child of navLeaves(item.children)) {
      // A child without its own feature is just a page of its parent module,
      // so it carries the parent's help rather than none.
      consider(child.feature ?? item.feature, child.href);
    }
  }

  return best === null ? null : (best as { key: PortalFeatureKey }).key;
}

/** Every module key that needs a help entry, across all three portals. */
export function helpKeys(): HelpKey[] {
  const keys = new Set<HelpKey>();
  for (const overrides of Object.values(HELP_OVERRIDES)) {
    for (const key of Object.values(overrides ?? {})) keys.add(key);
  }
  for (const items of Object.values(PORTAL_NAVIGATION)) {
    for (const item of items) {
      keys.add(item.feature);
      for (const child of navLeaves(item.children)) {
        if (child.feature) keys.add(child.feature);
      }
    }
  }
  return [...keys].sort();
}
