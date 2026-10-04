"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/*
 * 照片审批 is now a tab of MR / Other Request (C01, D02). The old address -
 * a bookmark, an old notice - opens that tab with whatever the link carried.
 * The photo submissions themselves did not move.
 */
export default function PhotoApprovalsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", "photos");
    router.replace(`/material-requests?${next.toString()}`);
  }, [router, searchParams]);
  return null;
}
