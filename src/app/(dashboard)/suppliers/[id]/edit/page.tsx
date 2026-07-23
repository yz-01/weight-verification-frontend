import { EditSupplier } from "@/components/suppliers/create-supplier";

export default async function EditSupplierPage(
  props: PageProps<"/suppliers/[id]/edit">,
) {
  const { id } = await props.params;
  return <EditSupplier id={id} />;
}
