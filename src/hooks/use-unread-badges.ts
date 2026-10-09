"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/components/providers/auth-provider";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import {
  menuBadgeKeys,
  type FeatureNavChild,
  type FeatureNavItem,
  type PortalFeatureKey,
} from "@/lib/navigation";
import { getSidebarBadges } from "@/services/contractor-dashboard.service";

/**
 * The module pages the backend may count for (`contractor_ops.sidebar_badges`),
 * keyed by feature. Mirrors the backend's list (its test
 * `test_sidebar_badges` reads this array) so every count it can send has an
 * entry to appear on.
 *
 * Lucas (2026-10-09): 「只有待验收的才需要加进去号码」 - a number is what
 * waits for an approval or acceptance (材料进场's 待验收 included), plus the
 * hazards waiting on this reader. No 【确认】 pile, no next step. 进度 has
 * no approval step, so it has no number and is not here.
 */
export const BADGE_FEATURES: readonly string[] = [
  "material_receipts",
  "material_outgoing",
  "material_requests",
  "field_tasks",
  "equipment",
  "waste_outgoing",
  "site_disposals",
  "consultant_applications",
  "approvals",
  "sundry_claims",
  "site_access",
  "safety",
];

/**
 * Any one of these opens the endpoint (`contractor_ops.sidebar_badges.
 * BADGE_PERMISSIONS`): the permission that opens one of the counted lists.
 * The server gives no number for a list its reader cannot open, so asking
 * without any of them would be a guaranteed 403 on every page load for a
 * role that only submits from the phone. The backend test
 * `test_the_frontend_asks_with_the_same_permissions_and_keys` reads this.
 */
export const BADGE_PERMISSIONS: readonly string[] = [
  "approval.view",
  "disposal.view",
  "equipment.view",
  "field_task.view",
  "material_outgoing.view",
  "material_request.view",
  "receipt.view",
  "safety.view",
  "site_access.view",
  "sundry_claim.view",
  "waste_outgoing.view",
];

/**
 * How long a count is fresh. There is no interval of this hook's own: the
 * signed-in shell's live stream refreshes every query when something
 * happens on site, a window coming back into focus asks again, and the
 * app-wide safety poll (fix/perf-realtime) covers what the stream misses.
 */
export const BADGE_STALE_MS = 30_000;

/**
 * What each sidebar badge counts, said in its label.
 *
 * Since Lucas's 2026-10-09 decision no badge counts a 【确认】 any more, so
 * none says 待确认: every number is something waiting for this reader's
 * approval or acceptance (待审批/验收) - except 隐患整改's, which is the
 * open hazards this reader moves on next, whatever the step (等你处理).
 */
export function badgeLabelKey(
  feature: PortalFeatureKey,
): "nav.waitingApproval" | "nav.waitingForYou" {
  return feature === "hazard_rectification" || feature === "safety"
    ? "nav.waitingForYou"
    : "nav.waitingApproval";
}

/** Per module page: how many are waiting. Absent means nothing to show. */
export type BadgeCounts = Partial<Record<string, number>>;

/**
 * One entry's number from the counts of the pages under it: their sum.
 *
 * A badge shows only when this is above zero (Lucas 2026-10-09: 「如果是0的话
 * 就不用显示」) - zero and counts that never loaded both show nothing.
 */
export function badgeFor(badges: BadgeCounts, keys: readonly string[]): number {
  let total = 0;
  for (const key of keys) {
    const value = badges[key];
    if (typeof value === "number" && value > 0) total += value;
  }
  return total;
}

/**
 * The number on each row of an entry's menu, by the row's `key` (the hover
 * flyout and the phone's expanded menu, Lucas 2026-10-09).
 *
 * A page shows its own keys from `menuBadgeKeys`; a heading with a further
 * level shows the sum of the pages under it. Every key is on one page only,
 * so the rows add up to `badgeFor(badges, badgeKeysFor(item))`.
 */
export function menuWaiting(item: FeatureNavItem, badges: BadgeCounts): Record<string, number> {
  const byPage = menuBadgeKeys(item);
  const waiting: Record<string, number> = {};
  const walk = (level: readonly FeatureNavChild[] | undefined): number => {
    let total = 0;
    for (const child of level ?? []) {
      const count = child.children?.length
        ? walk(child.children)
        : badgeFor(badges, byPage[child.key] ?? []);
      waiting[child.key] = count;
      total += count;
    }
    return total;
  };
  walk(item.children);
  return waiting;
}

/**
 * How many things are waiting on *this reader*, per module page.
 *
 * Lucas (2026-10-08): 「当有需要验收的东西的时候应该会像图1的sidebar材料管理有
 * 号码，每个模块都是这样才对。」 One request answers every module
 * (`GET /api/contractor-dashboard/get_badges/`), narrowed to the top bar's
 * current project the way every list is (B13), so a badge is the count of
 * the list the reader opens. Refreshed by the live stream when somebody on
 * site sends something in and when the window regains focus - never on a
 * timer of its own, because the sidebar is on every page of every office
 * user and the app already has one safety poll.
 *
 * Counts that never loaded show nothing, the same as nothing waiting (Lucas
 * 2026-10-09: 「如果是0的话就不用显示」; the "?" an unloaded entry used to
 * carry is gone). A failed *refresh* keeps the last counts it had - TanStack
 * keeps `data` - which were true when they arrived.
 */
export function useUnreadBadges(): BadgeCounts {
  const { can, user } = useAuth();
  const current = useCurrentProject();
  // The portal says whether this endpoint is theirs to ask (F-224): a
  // platform administrator holds some of these codes and would otherwise
  // be refused on every admin page load. So does the account type: a
  // consultant signs in to the same portal with `approval.view`, but the
  // counts are the contractor's office's (the consultant's own 待处理 is on
  // 顾问 Dashboard), and the endpoint refuses them.
  const enabled =
    user?.portal === "MSE_TRACE" &&
    user.account_type === "TENANT" &&
    BADGE_PERMISSIONS.some((code) => can(code));
  const project = current.active ? current.projectId : "";

  // query-failure: a badge shows only above zero (Lucas 2026-10-09), so a failed load shows none and a failed refresh keeps the last counts.
  const query = useQuery({
    queryKey: ["sidebar-badges", project],
    queryFn: () => getSidebarBadges({ project: project || undefined }),
    enabled,
    staleTime: BADGE_STALE_MS,
    refetchOnWindowFocus: true,
  });

  return query.data?.badges ?? {};
}
