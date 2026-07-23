import { EditSite } from "@/components/sites/create-site";

export default async function EditSitePage(
  props: PageProps<"/sites/[id]/edit">,
) {
  const { id } = await props.params;
  return <EditSite id={id} />;
}
