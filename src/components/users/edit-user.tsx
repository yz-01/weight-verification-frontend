"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { FormSkeleton, LoadErrorCard } from "@/components/shared/form-shell";
import { CreateUser } from "@/components/users/create-user";
import {
  PermissionSwitches,
  type PermissionSwitchesHandle,
} from "@/components/users/permission-switches";
import { getUser } from "@/services/users.service";

/** Fetches the record, then hands it to the shared form. */
export function EditUser({ id }: { id: string }) {
  const t = useTranslations();
  const switches = useRef<PermissionSwitchesHandle>(null);
  const { data, isLoading, isLoadingError } = useQuery({
    queryKey: ["users", "detail", id],
    queryFn: () => getUser(id),
  });

  if (isLoading) return <FormSkeleton sections={3} />;
  if (isLoadingError || !data) {
    return <LoadErrorCard backHref="/users" backLabel={t("users.title")} />;
  }
  const switchable = data.permission_switches?.switchable;
  return (
    <CreateUser
      user={data}
      // 用户管理 → 编辑用户 → 权限 (J17): a contractor's back-office person.
      // One 「保存」 for both: the panel has no button of its own here.
      after={switchable ? <PermissionSwitches userId={data.id} handleRef={switches} /> : undefined}
      saveAfter={
        switchable ? async () => (switches.current ? switches.current.saveIfDirty() : true) : undefined
      }
    />
  );
}
