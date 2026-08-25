import { DriverDetail } from "@/components/fleet/fleet-detail";

export default async function DriverDetailPage(props: PageProps<"/drivers/[id]">) {
  const { id } = await props.params;
  return <DriverDetail id={id} />;
}
