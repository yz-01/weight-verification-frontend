import { ViewTask } from "@/components/tasks/view-task";

export default async function ViewTaskPage(props: PageProps<"/tasks/[id]">) {
  const { id } = await props.params;
  return <ViewTask id={id} />;
}
