"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { CreateRole } from "@/components/roles/create-role";
import { FormSkeleton, LoadErrorCard } from "@/components/shared/form-shell";
import { getRole } from "@/services/users.service";

/** Fetches the record, then hands it to the shared form. */
export function EditRole({ id }: { id: string }) {
  const t = useTranslations();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["roles", "detail", id],
    queryFn: () => getRole(id),
  });

  if (isLoading) return <FormSkeleton sections={2} />;
  if (isError || !data) {
    return <LoadErrorCard backHref="/roles" backLabel={t("roles.title")} />;
  }
  return <CreateRole role={data} />;
}
