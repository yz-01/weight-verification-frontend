import type { Metadata } from "next";

import { PassportCapture } from "@/components/site-workers/passport-capture";

export const metadata: Metadata = {
  title: "MSE Trace",
  // The token is this page's address: never sent on as a referrer.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

/** A phone photographing passports into one 批量新增人员 batch (JB61-1). */
export default async function PassportCapturePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PassportCapture token={decodeURIComponent(token)} />;
}
