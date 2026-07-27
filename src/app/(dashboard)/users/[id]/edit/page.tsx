import { EditUser } from "@/components/users/edit-user";

export default async function EditUserPage(
  props: PageProps<"/users/[id]/edit">,
) {
  const { id } = await props.params;
  return <EditUser id={id} />;
}
