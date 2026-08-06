"use client";

import { AdminModuleLanding } from "@/components/admin/admin-module-landing";
import { useAuth } from "@/components/providers/auth-provider";
import { WeighSessions } from "@/components/weighing/weigh-sessions";

export default function WeighingPage() {
  const { user } = useAuth();
  return user?.portal === "MSE_ADMIN" ? (
    <AdminModuleLanding feature="cloud_weighing" />
  ) : (
    <WeighSessions />
  );
}
