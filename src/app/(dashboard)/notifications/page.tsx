"use client";

import { ModuleHubRedirect } from "@/components/layout/module-hub-redirect";
import { Notifications } from "@/components/notifications/notifications";
import { useAuth } from "@/components/providers/auth-provider";

export default function NotificationsPage() {
  const { user } = useAuth();
  return user?.portal === "MSE_ADMIN" ? (
    <ModuleHubRedirect portal="MSE_ADMIN" feature="notification_center" />
  ) : (
    <Notifications />
  );
}
