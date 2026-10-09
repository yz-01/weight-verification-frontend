import type { Metadata } from "next";

import { DriverTaskLink } from "@/components/driver/driver-task-link";

export const metadata: Metadata = {
  title: "MSE Trace",
  // The token is this page's address. Sending it on as a referrer to anything
  // the page loads - a map tile, directions - would hand the trip to them.
  referrer: "no-referrer",
};

export default async function DriverTaskLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <DriverTaskLink token={token} />;
}
