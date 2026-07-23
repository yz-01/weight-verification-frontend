"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { FormSkeleton, LoadErrorCard } from "@/components/shared/form-shell";
import { CreateUser } from "@/components/users/create-user";
import { getUser } from "@/services/users.service";

/** Fetches the record, then hands it to the shared form. */
export function EditUser({ id }: { id: string }) {
  const t = useTranslations();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["users", "detail", id],
    queryFn: () => getUser(id),
  });

  if (isLoading) return <FormSkeleton sections={3} />;
  if (isError || !data) {
    return <LoadErrorCard backHref="/users" backLabel={t("users.title")} />;
  }
  return <CreateUser user={data} />;
}
