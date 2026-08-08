import { ExternalDisposalWorkspace } from "@/components/contractor-ops/site-disposal-workspaces";

export default async function DisposalTaskPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ExternalDisposalWorkspace token={token} />;
}
