"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/components/providers/auth-provider";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import type { PortalFeatureKey } from "@/lib/navigation";
import { getSidebarBadges } from "@/services/contractor-dashboard.service";

/**
 * The module pages the backend may count for (`contractor_ops.sidebar_badges`),
 * keyed by feature. Used only for the unknown state: when the first load
 * fails these are the entries marked "?" rather than left looking empty.
 */
export const BADGE_FEATURES: readonly string[] = [
  "material_receipts",
  "material_outgoing",
  "material_requests",
  "field_tasks",
  "equipment",
  "progress",
  "waste_outgoing",
  "site_disposals",
  "consultant_applications",
  "approvals",
  "sundry_claims",
  "site_access",
  "safety",
];

/**
 * Any one of these opens the endpoint (its `permission_map` entry); which
 * numbers come back is decided per module on the server. Asking without any
 * of them would be a guaranteed 403 on every page load for a role that only
 * submits from the phone.
 */
export const BADGE_PERMISSIONS: readonly string[] = [
  "receipt.view",
  "material_outgoing.view",
  "material_outgoing.approve",
  "material_request.review",
  "field_task.manage",
  "equipment.view",
  "equipment.manage",
  "progress.view",
  "waste_outgoing.view",
  "waste_outgoing.approve",
  "disposal.view",
  "disposal.manage",
  "disposal.confirm",
  "approval.view",
  "approval.review",
  "approval.submit",
  "safety.view",
  "sundry_claim.view",
  "sundry_claim.review",
  "site_access.manage",
];

/** How often the sidebar asks again, besides on window focus. */
export const BADGE_POLL_MS = 30_000;

/**
 * What each sidebar badge counts, said in its label (2026-10 C4).
 *
 * The 材料管理 badge is deliveries and returns waiting for the office's
 * 【确认】 (X10), so its label says 待确认. Every other badge is work waiting
 * on this reader - an acceptance, an approval or a confirmation.
 */
export function badgeLabelKey(
  feature: PortalFeatureKey,
): "nav.waitingConfirm" | "nav.waitingForYou" {
  return feature === "material_receipts" ? "nav.waitingConfirm" : "nav.waitingForYou";
}

/** Per module page: a count, or `null` when the counts never loaded. */
export type BadgeCounts = Partial<Record<string, number | null>>;

/**
 * One entry's badge from the counts of the pages under it.
 *
 * A number when anything is waiting; `null` when the counts never loaded
 * and at least one of the entry's pages could carry a number - no badge at
 * all is exactly what an empty pile looks like (T-175); `0` otherwise.
 */
export function badgeFor(badges: BadgeCounts, keys: readonly string[]): number | null {
  let total = 0;
  let unknown = false;
  for (const key of keys) {
    const value = badges[key];
    if (value === null) unknown = true;
    else if (typeof value === "number") total += value;
  }
  if (total > 0) return total;
  return unknown ? null : 0;
}

/**
 * How many things are waiting on *this reader*, per module page.
 *
 * Lucas (2026-10-08): 「当有需要验收的东西的时候应该会像图1的sidebar材料管理有
 * 号码，每个模块都是这样才对。」 One request answers every module
 * (`GET /api/contractor-dashboard/get_badges/`), narrowed to the top bar's
 * current project the way every list is (B13), so a badge is the count of
 * the list the reader opens. Polled every `BADGE_POLL_MS` and when the
 * window regains focus: the numbers move when somebody on site sends
 * something in, not when this reader navigates.
 *
 * A failed first load must not look like "nothing waiting": every entry that
 * could carry a number is marked unknown instead, and the sidebar shows "?".
 * A failed *refresh* keeps the last counts it had, which were true when
 * they arrived.
 */
export function useUnreadBadges(): BadgeCounts {
  const { can, user } = useAuth();
  const current = useCurrentProject();
  // The portal says whether this endpoint is theirs to ask (F-224): a
  // platform administrator holds some of these codes and would otherwise
  // be refused on every admin page load.
  const enabled =
    user?.portal === "MSE_TRACE" && BADGE_PERMISSIONS.some((code) => can(code));
  const project = current.active ? current.projectId : "";

  const query = useQuery({
    queryKey: ["sidebar-badges", project],
    queryFn: () => getSidebarBadges({ project: project || undefined }),
    enabled,
    staleTime: BADGE_POLL_MS - 5_000,
    refetchInterval: BADGE_POLL_MS,
    refetchOnWindowFocus: true,
  });

  const counts = query.data?.badges;
  if (!counts) {
    if (!query.isError) return {};
    return Object.fromEntries(BADGE_FEATURES.map((key) => [key, null]));
  }
  return counts;
}
