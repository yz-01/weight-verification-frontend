import { CreateCompany } from "@/components/companies/create-company";
import type { CompanyType } from "@/interfaces/company";

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

  return <CreateCompany defaultType={defaultType} />;
}
