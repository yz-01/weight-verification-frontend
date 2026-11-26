"use client";

import { useSearchParams } from "next/navigation";

import { useAuth } from "@/components/providers/auth-provider";
import { FormSkeleton } from "@/components/shared/form-shell";
import { CreateUser } from "@/components/users/create-user";
import { InviteUser } from "@/components/users/invite-user";

/**
 * 「邀请用户」 (`/users/create`). A builder's own back office invites on one
 * page - name, e-mail, 总部 / 项目, projects and permissions (JB242, 客户
 * 11-23 事项 14). MSE Admin (its own staff, or a company's from its page) and a
 * recycler keep the form they had.
 */
export function UserCreateEntry() {
  const { user: me } = useAuth();
  const searchParams = useSearchParams();
  if (!me) return <FormSkeleton sections={3} />;
  if (me.portal === "MSE_TRACE" && !searchParams.get("company")) return <InviteUser />;
  return <CreateUser />;
}
