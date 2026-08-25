import { CreateTask } from "@/components/tasks/create-task";

export default async function EditTaskPage(
  props: PageProps<"/tasks/[id]/edit">,
) {
  const { id } = await props.params;
  return <CreateTask id={id} />;
}
