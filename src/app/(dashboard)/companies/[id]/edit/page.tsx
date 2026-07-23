import { EditCompany } from "@/components/companies/edit-company";

export default async function EditCompanyPage(
  props: PageProps<"/companies/[id]/edit">,
) {
  const { id } = await props.params;
  return <EditCompany id={id} />;
}
