import { CreateCompany } from "@/components/companies/create-company";
import type { CompanyType } from "@/interfaces/company";
import { redirect } from "next/navigation";

export default async function CreateCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const requestedType = (await searchParams).type;
  const defaultType: CompanyType | undefined =
    requestedType === "CONTRACTOR" || requestedType === "RECYCLER"
      ? requestedType
      : undefined;

  // Company onboarding is split between the two Admin workflows. Keep old
  // generic links useful by sending them to the contractor entry point.
  if (defaultType === undefined) {
    redirect("/contractor-partners");
  }

  return <CreateCompany defaultType={defaultType} />;
}
