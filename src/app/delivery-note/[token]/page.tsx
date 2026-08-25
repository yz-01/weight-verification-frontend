import { PublicDeliveryNote } from "@/components/delivery-notes/public-delivery-note";

export default async function DeliveryNotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicDeliveryNote token={token} />;
}
