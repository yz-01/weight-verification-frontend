"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { CreateCompany } from "@/components/companies/create-company";
import { CompanyOnboarding } from "@/components/companies/company-onboarding";
import { FormSkeleton, LoadErrorCard } from "@/components/shared/form-shell";
import { getCompany } from "@/services/companies.service";

/** Fetches the record, then hands it to the shared form. */
export function EditCompany({ id }: { id: string }) {
  const t = useTranslations();
  const { data, isLoading, isLoadingError } = useQuery({
    queryKey: ["companies", "detail", id],
    queryFn: () => getCompany(id),
  });

  if (isLoading) return <FormSkeleton sections={4} />;
  if (isLoadingError || !data) {
    return <LoadErrorCard backHref="/companies" backLabel={t("companies.title")} />;
  }
  // 入驻资料 rides in the form's `after`: in the edit dialog it scrolls with
  // the fields. Drawn beside the form, it made the dialog one block too tall
  // to scroll (Lucas 11-02: 「编辑公司我下滑不了」).
  return <CreateCompany company={data} after={<CompanyOnboarding company={data} />} />;
}
