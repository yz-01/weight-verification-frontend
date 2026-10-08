import { ViewReceipt } from "@/components/receipts/view-receipt";

/**
 * `/receipts/<id>` opened from inside the app (T-243): the record-detail
 * popup over the list (E8, Q31 - 「以弹窗显示」).
 *
 * The same component as the page, in its dialog frame rather than wrapped
 * in a second dialog, so the header (number, status, 预览/打印 · 导出 PDF ·
 * 分享) is the popup's own and closing it goes back to the list. A direct
 * visit to the address does not come through here at all - it renders the
 * full page, which is how old links and notifications keep working.
 */
export default async function ModalReceiptDetail(
  props: PageProps<"/receipts/[id]">,
) {
  const { id } = await props.params;
  return <ViewReceipt id={id} presentation="dialog" />;
}
