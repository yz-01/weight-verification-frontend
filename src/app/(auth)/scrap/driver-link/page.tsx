import type { Metadata } from "next";
import { Suspense } from "react";

import { DriverLinkSignIn } from "@/components/driver/driver-link-sign-in";

export const metadata: Metadata = {
  title: "MSE Trace Driver",
  applicationName: "MSE Trace Driver",
  // The token is in this page's address. Sending it on as a referrer to
  // anything the page loads would hand the link to a third party.
  referrer: "no-referrer",
};

export default function DriverLinkPage() {
  return (
    <Suspense>
      <DriverLinkSignIn />
    </Suspense>
  );
}
