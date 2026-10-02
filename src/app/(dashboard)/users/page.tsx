"use client";

import { ModuleHubRedirect } from "@/components/layout/module-hub-redirect";
import { useAuth } from "@/components/providers/auth-provider";
import { Users } from "@/components/users/users";

export default function UsersPage() {
  const { user } = useAuth();
  return user?.portal === "MSE_ADMIN" ? (
    <ModuleHubRedirect portal="MSE_ADMIN" feature="user_management" />
  ) : (
    <Users />
  );
}
