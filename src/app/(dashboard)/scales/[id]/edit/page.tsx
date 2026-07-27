import { EditScale } from "@/components/scales/create-scale";

export default async function EditScalePage(
  props: PageProps<"/scales/[id]/edit">,
) {
  const { id } = await props.params;
  return <EditScale id={id} />;
}
