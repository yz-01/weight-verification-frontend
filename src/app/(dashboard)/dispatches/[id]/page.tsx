import { ViewDispatch } from "@/components/dispatches/view-dispatch";

export default async function ViewDispatchPage(
  props: PageProps<"/dispatches/[id]">,
) {
  const { id } = await props.params;
  return <ViewDispatch id={id} />;
}
