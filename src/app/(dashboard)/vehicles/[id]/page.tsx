import { VehicleDetail } from "@/components/fleet/fleet-detail";

export default async function VehicleDetailPage(props: PageProps<"/vehicles/[id]">) {
  const { id } = await props.params;
  return <VehicleDetail id={id} />;
}
