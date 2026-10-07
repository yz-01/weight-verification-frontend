"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/components/providers/auth-provider";
import type { PortalFeatureKey } from "@/lib/navigation";
import { getContractorDashboard } from "@/services/contractor-dashboard.service";

/**
 * What each sidebar badge counts, said in its label (2026-10 C4).
 *
 * The 材料进场 badge is `unread.receipts`: accepted deliveries waiting for
 * their 【确认归档】 (X10) - not deliveries nobody has opened, which is what
 * it counted before. So its label says 待确认. The approvals badge is work
 * waiting on this reader.
 */
export function badgeLabelKey(
  feature: PortalFeatureKey,
): "nav.waitingConfirm" | "nav.waitingForYou" {
  return feature === "material_receipts" ? "nav.waitingConfirm" : "nav.waitingForYou";
}

/**
 * How many things are waiting on *this reader*, per sidebar entry.
 *
 * The user asked for what is waiting to be obvious (2026-09-05); T-155 got as
 * far as sending the notification, and this is the badge beside the door.
 * Since X10 the 材料进场 number is the deliveries waiting for a confirm - it
 * drops when somebody confirms one on its page, for everybody, because
 * confirmed is a fact about the record (D-234).
 *
 * They get their own query key rather than sharing the dashboard's. Sharing
 * looked tempting - one request instead of two on the home page - but the two
 * callers ask for different `sections`, and whichever landed first would
 * decide what the other got. The dashboard would lose its activity feed to a
 * sidebar that only wanted a number.
 */
export function useUnreadBadges(): Partial<Record<PortalFeatureKey, number | null>> {
  const { can, user } = useAuth();
  // `dashboard.view` is the permission behind the endpoint, so asking without
  // it would be a guaranteed 403 on every page load for the roles that do not
  // have it - drivers and recyclers among them.
  //
  // It used to require `receipt.view` as well, and that was too strict in a
  // way that hit the person this badge exists for: an approver holding
  // `dashboard.view` and `approval.review` but no receipt permission asked
  // for nothing and saw nothing, so the approvals count - theirs to act on -
  // never appeared. The endpoint wants one permission; this asks for that
  // one, and the receipts badge is withheld separately below.
  //
  // The portal has to be checked too, and leaving it out is what the customer
  // reported: `dashboard.view` is not a contractor-only permission, so a
  // platform administrator holds it, fires this query, and is refused by an
  // endpoint that serves contractors - a "you do not have permission" toast
  // on every admin page load, for a badge the admin console does not show
  // (F-224). The permission says what the reader may do; the portal says
  // whether this endpoint is theirs to ask.
  const enabled = user?.portal === "MSE_TRACE" && can("dashboard.view");
  const maySeeReceipts = can("receipt.view");

  const query = useQuery({
    queryKey: ["contractor-dashboard", "unread-badges"],
    queryFn: () =>
      getContractorDashboard({ sections: ["unread"], silent: true }),
    enabled,
    // The sidebar is mounted on every page. Without this it would refetch on
    // each navigation to redraw a number that moves a few times a day.
    staleTime: 30_000,
  });

  const unread = query.data?.unread;
  // A failed first load must not look like "nothing waiting" - no badge at
  // all is exactly what an empty pile looks like (T-175). `null` tells the
  // sidebar to mark the entries as unknown instead. A failed *refresh* keeps
  // the last counts it had, which were true when they arrived.
  if (!unread) {
    if (!query.isError) return {};
    return {
      ...(maySeeReceipts ? { material_receipts: null } : {}),
      approvals: null,
    };
  }
  return {
    // Withheld rather than the whole query being skipped: a reader with no
    // receipt permission should not be shown a count of deliveries, but that
    // is no reason to deny them the approvals count as well.
    ...(maySeeReceipts ? { material_receipts: unread.receipts } : {}),
    approvals: unread.approvals,
  };
}
