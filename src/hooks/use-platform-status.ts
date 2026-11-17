"use client";

import { useQuery } from "@tanstack/react-query";

import { getPlatformStatus } from "@/services/platform-status.service";

export const PLATFORM_STATUS_KEY = ["platform-status"] as const;

/**
 * The 维护 notice and MSE's 联络资料 (JB211), shared by the sign-in page, the
 * banners, the 系统维护 screen and the bill's 开票方 block.
 *
 * Asked again every five minutes and on coming back to the tab, so a window
 * MSE saves later still reaches an open page before it starts. A failed ask
 * changes nothing on screen: no banner is shown rather than a wrong one.
 */
export function usePlatformStatus() {
  return useQuery({
    queryKey: PLATFORM_STATUS_KEY,
    queryFn: getPlatformStatus,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
