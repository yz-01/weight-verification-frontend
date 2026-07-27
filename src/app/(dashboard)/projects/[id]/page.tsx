import { ViewProject } from "@/components/projects/view-project";

export default async function ViewProjectPage(
  props: PageProps<"/projects/[id]">,
) {
  const { id } = await props.params;
  return <ViewProject id={id} />;
}
