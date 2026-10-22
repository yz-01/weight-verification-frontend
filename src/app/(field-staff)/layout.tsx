import type { Metadata } from "next";

import { FieldStaffShell } from "@/components/field-staff/field-staff-shell";

/**
 * A phone installed from inside the field app must come back to the field
 * app. Without this the root manifest applies, whose start_url is "/", and
 * the worker's home-screen icon opens the portal chooser (F-172).
 */
export const metadata: Metadata = {
  manifest: "/field-manifest.webmanifest",
  // In an iPhone browser tab these pages carry the sign-in hand-off in their
  // address (`FieldWorkspaceAddress`). Another site never gets more than this
  // site's origin as the referrer, whatever the browser's default; map tiles
  // that check the referrer still see the origin.
  referrer: "strict-origin-when-cross-origin",
};

export default function FieldStaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <FieldStaffShell>{children}</FieldStaffShell>;
}
