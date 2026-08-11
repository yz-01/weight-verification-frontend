"use client";

import { AdminModuleLanding } from "@/components/admin/admin-module-landing";
import { useAuth } from "@/components/providers/auth-provider";
import { Users } from "@/components/users/users";

export default function UsersPage() {
  const { user } = useAuth();
  return user?.portal === "MSE_ADMIN" ? (
    <AdminModuleLanding feature="user_management" />
  ) : (
    <Users />
  );
}
