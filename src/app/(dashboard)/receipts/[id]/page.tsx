import { ViewReceipt } from "@/components/receipts/view-receipt";

export default async function ViewReceiptPage(
  props: PageProps<"/receipts/[id]">,
) {
  const { id } = await props.params;
  return <ViewReceipt id={id} />;
}
