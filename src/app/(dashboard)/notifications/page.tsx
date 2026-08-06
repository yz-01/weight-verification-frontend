"use client";

import { AdminNotificationWorkspace } from "@/components/notifications/admin-notification-workspace";
import { Notifications } from "@/components/notifications/notifications";
import { useAuth } from "@/components/providers/auth-provider";

export default function NotificationsPage() {
  const { user } = useAuth();
  return user?.portal === "MSE_ADMIN" ? (
    <AdminNotificationWorkspace />
  ) : (
    <Notifications />
  );
}
