import { EditProject } from "@/components/projects/create-project";

export default async function EditProjectPage(
  props: PageProps<"/projects/[id]/edit">,
) {
  const { id } = await props.params;
  return <EditProject id={id} />;
}
