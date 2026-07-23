import { ViewSettlement } from "@/components/settlements/view-settlement";

export default async function ViewSettlementPage(
  props: PageProps<"/settlements/[id]">,
) {
  const { id } = await props.params;
  return <ViewSettlement id={id} />;
}
