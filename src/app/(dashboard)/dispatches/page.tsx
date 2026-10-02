"use client";

import { WasteClearanceRedirect } from "@/components/contractor-ops/waste-clearance-redirect";
import { Dispatches } from "@/components/dispatches/dispatches";
import { useAuth } from "@/components/providers/auth-provider";

/*
 * The contractor's 废料订单 lives in 垃圾清运 now (B08), and the old address
 * opens its tab there. The recycler's console keeps this list as it was: the
 * merge is the contractor's menu only.
 */
export default function DispatchesPage() {
  const { user } = useAuth();
  if (!user) return null;
  return user.portal === "MSE_TRACE" ? (
    <WasteClearanceRedirect kind="dispatch" />
  ) : (
    <Dispatches />
  );
}
