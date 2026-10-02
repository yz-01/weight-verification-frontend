"use client";

import { ModuleHubRedirect } from "@/components/layout/module-hub-redirect";
import { useAuth } from "@/components/providers/auth-provider";
import { WeighSessions } from "@/components/weighing/weigh-sessions";

export default function WeighingPage() {
  const { user } = useAuth();
  return user?.portal === "MSE_ADMIN" ? (
    <ModuleHubRedirect portal="MSE_ADMIN" feature="cloud_weighing" />
  ) : (
    <WeighSessions />
  );
}
