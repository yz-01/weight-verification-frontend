import type { Metadata } from "next";

import { WorkerLocationLink } from "@/components/site-workers/worker-location-link";

export const metadata: Metadata = {
  title: "MSE Trace",
  // The token is this page's address: never sent on as a referrer.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function WorkerLocationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <WorkerLocationLink token={token} />;
}
