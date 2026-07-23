import { EditReceipt } from "@/components/receipts/create-receipt";

export default async function EditReceiptPage(
  props: PageProps<"/receipts/[id]/edit">,
) {
  const { id } = await props.params;
  return <EditReceipt id={id} />;
}
