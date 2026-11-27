import type { Metadata } from "next";

import { WallLinkScreen } from "@/components/dashboard/headquarters-wall";

export const metadata: Metadata = {
  title: "MSE Trace",
  // The token is this page's address: not indexed, never passed on.
  referrer: "no-referrer",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

/** 总部大屏 on a screen nobody signs in on (JB291): the link is the credential. */
export default async function WallLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <WallLinkScreen token={token} />;
}
