"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { awaitingFieldTasksAddress } from "@/lib/awaiting-field-tasks";

/*
 * The photo review is gone (I17, ID38). Its old address - a bookmark, an old
 * notice - opens the field-task list on 待验收 (`/field-tasks?stage=AWAITING`),
 * where a waiting submission is accepted or returned, with whatever else the
 * link carried.
 */
export default function FormerPhotoReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    router.replace(awaitingFieldTasksAddress(searchParams.toString()));
  }, [router, searchParams]);
  return null;
}
