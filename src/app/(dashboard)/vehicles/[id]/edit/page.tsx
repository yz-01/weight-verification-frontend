import { EditVehicle } from "@/components/fleet/create-vehicle";

export default async function EditVehiclePage(
  props: PageProps<"/vehicles/[id]/edit">,
) {
  const { id } = await props.params;
  return <EditVehicle id={id} />;
}
