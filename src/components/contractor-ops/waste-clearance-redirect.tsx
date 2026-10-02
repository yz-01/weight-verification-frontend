"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * An old list address of the two kinds that 垃圾清运 now gathers (B08):
 * `/site-disposals` and, in the contractor's console, `/dispatches`.
 *
 * Forwarded to the same kind's tab with everything the link carried - a task
 * card's `?record=`, the dashboard's `?create=1`, a filter - so a bookmark or
 * an old notice still opens what it pointed at. Detail addresses
 * (`/dispatches/<id>`) are not touched and open as before.
 */
export function WasteClearanceRedirect({ kind }: { kind: "disposal" | "dispatch" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("kind", kind);
    router.replace(`/waste-clearance?${next.toString()}`);
  }, [kind, router, searchParams]);
  return null;
}
