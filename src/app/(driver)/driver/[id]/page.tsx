import { DriverTask } from "@/components/driver/driver-task";

export default async function DriverTaskPage(
  props: PageProps<"/driver/[id]">,
) {
  const { id } = await props.params;
  return <DriverTask id={id} />;
}
