import { ViewUser } from "@/components/users/view-user";

export default async function ViewUserPage(props: PageProps<"/users/[id]">) {
  const { id } = await props.params;
  return <ViewUser id={id} />;
}
