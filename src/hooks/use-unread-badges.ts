"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/components/providers/auth-provider";
import type { PortalFeatureKey } from "@/lib/navigation";
import { getContractorDashboard } from "@/services/contractor-dashboard.service";

/**
 * How many things are waiting on *this reader*, per sidebar entry.
 *
 * The user asked for the unread pile to be obvious: "the contractor dashboard
 * should show all the unread columns, and opening one files it away"
 * (2026-09-05). The filing half already worked - the receipt screen marks a
 * delivery seen when it is opened - but nothing anywhere said something was
 * waiting, so there was nothing to open. T-155 got as far as sending the
 * notification; this is the badge beside the door.
 *
 * Two things to know about the numbers:
 *
 * They are per reader, never shared. Head office and the project manager wait
 * on the same delivery and clear it separately (D-063), so a shared count
 * would let whichever of them opened it first empty the other's pile.
 *
 * They get their own query key rather than sharing the dashboard's. Sharing
 * looked tempting - one request instead of two on the home page - but the two
 * callers ask for different `sections`, and whichever landed first would
 * decide what the other got. The dashboard would lose its activity feed to a
 * sidebar that only wanted a number.
 */
export function useUnreadBadges(): Partial<Record<PortalFeatureKey, number>> {
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
  if (!unread) return {};
  return {
    // Withheld rather than the whole query being skipped: a reader with no
    // receipt permission should not be shown a count of deliveries, but that
    // is no reason to deny them the approvals count as well.
    ...(maySeeReceipts ? { material_receipts: unread.receipts } : {}),
    approvals: unread.approvals,
  };
}
