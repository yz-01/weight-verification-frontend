import { ExternalPortal } from "@/components/external-portal/external-portal";

export default async function ExternalPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ExternalPortal token={token} />;
}
