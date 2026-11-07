import type { Metadata } from "next";

import { SharedFileView } from "@/components/share-link/shared-file";

export const metadata: Metadata = {
  title: "MSE Trace",
  // The token is this page's address: not indexed, never passed on as a referrer.
  referrer: "no-referrer",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

/**
 * A file sent by WhatsApp / email as a private link (客户 11-08). No sign-in,
 * outside every portal's layout; the view runs in the browser only, so a link
 * preview never fetches the file.
 */
export default async function SharedFilePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedFileView token={token} />;
}
