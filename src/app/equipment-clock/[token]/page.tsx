import type { Metadata } from "next";

import { DriverClockLink } from "@/components/equipment-hours/driver-clock-link";

export const metadata: Metadata = {
  title: "MSE Trace",
  // The token is this page's address: never sent on as a referrer.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

/** A driver's own clock-in link (J26): no account, the token is the credential. */
export default async function EquipmentClockPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <DriverClockLink token={token} />;
}
