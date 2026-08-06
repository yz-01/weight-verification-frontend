"use client";

import { AdminCWEWorkspace } from "@/components/weighing/admin-cwe-workspace";
import { useAuth } from "@/components/providers/auth-provider";
import { WeighSessions } from "@/components/weighing/weigh-sessions";

export default function WeighingPage() {
  const { user } = useAuth();
  return user?.portal === "MSE_ADMIN" ? <AdminCWEWorkspace /> : <WeighSessions />;
}
