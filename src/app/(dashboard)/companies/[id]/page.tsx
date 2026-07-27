import { ViewCompany } from "@/components/companies/view-company";

export default async function ViewCompanyPage(
  props: PageProps<"/companies/[id]">,
) {
  const { id } = await props.params;
  return <ViewCompany id={id} />;
}
