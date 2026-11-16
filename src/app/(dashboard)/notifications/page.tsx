"use client";

import { useSearchParams } from "next/navigation";

import { ModuleHubRedirect } from "@/components/layout/module-hub-redirect";
import { Notifications } from "@/components/notifications/notifications";
import { useAuth } from "@/components/providers/auth-provider";

/**
 * `?mine=1` is MSE staff's own notices (JB205-8, Lucas 11-16 audit): the
 * bell's 「查看全部」 used to open 通知管理 - everybody's notifications - so a
 * notice they had confirmed (a subscription running out, a gateway gone
 * quiet, an announcement) was gone from their own view for good. Without it
 * the address still opens the module's first page, as before; the builder
 * and recycler portals always get their own list here, as before.
 */
export default function NotificationsPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  return user?.portal === "MSE_ADMIN" && searchParams.get("mine") !== "1" ? (
    <ModuleHubRedirect portal="MSE_ADMIN" feature="notification_center" />
  ) : (
    <Notifications />
  );
}
