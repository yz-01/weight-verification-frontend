import { EditDriver } from "@/components/fleet/create-driver";

export default async function EditDriverPage(
  props: PageProps<"/drivers/[id]/edit">,
) {
  const { id } = await props.params;
  return <EditDriver id={id} />;
}
