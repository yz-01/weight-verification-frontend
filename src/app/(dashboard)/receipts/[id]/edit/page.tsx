import { EditReceipt } from "@/components/receipts/create-receipt";

export default async function EditReceiptPage(
  props: PageProps<"/receipts/[id]/edit">,
) {
  const { id } = await props.params;
  // 「补供应商」 beside 验收 opens this with `?fill=supplier` (2026-10-15 I23).
  const { fill } = await props.searchParams;
  return <EditReceipt id={id} fillSupplier={fill === "supplier"} />;
}
