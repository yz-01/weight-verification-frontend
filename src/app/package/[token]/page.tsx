import type { Metadata } from "next";

import { PackageLinkView } from "@/components/package-link/package-link";

export const metadata: Metadata = {
  title: "MSE Trace",
  // H17 六 5: not indexed, no address passed on to another site. The token
  // is this page's address.
  referrer: "no-referrer",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default async function PackageLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PackageLinkView token={token} />;
}
