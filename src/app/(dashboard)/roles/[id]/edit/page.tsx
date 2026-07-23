import { EditRole } from "@/components/roles/edit-role";

export default async function EditRolePage(
  props: PageProps<"/roles/[id]/edit">,
) {
  const { id } = await props.params;
  return <EditRole id={id} />;
}
