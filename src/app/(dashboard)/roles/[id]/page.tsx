import { ViewRole } from "@/components/roles/view-role";

export default async function ViewRolePage(props: PageProps<"/roles/[id]">) {
  const { id } = await props.params;
  return <ViewRole id={id} />;
}
