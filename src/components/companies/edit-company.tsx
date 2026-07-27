"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { CreateCompany } from "@/components/companies/create-company";
import { FormSkeleton, LoadErrorCard } from "@/components/shared/form-shell";
import { getCompany } from "@/services/companies.service";

/** Fetches the record, then hands it to the shared form. */
export function EditCompany({ id }: { id: string }) {
  const t = useTranslations();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["companies", "detail", id],
    queryFn: () => getCompany(id),
  });

  if (isLoading) return <FormSkeleton sections={4} />;
  if (isError || !data) {
    return <LoadErrorCard backHref="/companies" backLabel={t("companies.title")} />;
  }
  return <CreateCompany company={data} />;
}
