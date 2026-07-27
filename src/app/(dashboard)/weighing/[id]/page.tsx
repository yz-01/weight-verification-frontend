import { ViewWeighSession } from "@/components/weighing/view-weigh-session";

export default async function ViewWeighSessionPage(
  props: PageProps<"/weighing/[id]">,
) {
  const { id } = await props.params;
  return <ViewWeighSession id={id} />;
}
