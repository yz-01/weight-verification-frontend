import { EditDispatch } from "@/components/dispatches/create-dispatch";

export default async function EditDispatchPage(
  props: PageProps<"/dispatches/[id]/edit">,
) {
  const { id } = await props.params;
  return <EditDispatch id={id} />;
}
