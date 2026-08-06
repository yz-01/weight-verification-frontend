"use client";

import { AdminModuleLanding } from "@/components/admin/admin-module-landing";
import { Notifications } from "@/components/notifications/notifications";
import { useAuth } from "@/components/providers/auth-provider";

export default function NotificationsPage() {
  const { user } = useAuth();
  return user?.portal === "MSE_ADMIN" ? (
    <AdminModuleLanding feature="notification_center" />
  ) : (
    <Notifications />
  );
}
