import type { Metadata } from "next";

import { FieldStaffShell } from "@/components/field-staff/field-staff-shell";
import { fieldManifestFromCookie } from "@/lib/field-manifest-server";

/**
 * A phone installed from inside the field app must come back to the field
 * app. Without this the root manifest applies, whose start_url is "/", and
 * the worker's home-screen icon opens the portal chooser (F-172).
 *
 * In an iPhone Safari tab the link already carries the hand-off (from its
 * cookie), so Safari's own Share -> Add to Home Screen, from any field page,
 * makes an app that signs itself in (Lucas 2026-10-23).
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    manifest: await fieldManifestFromCookie(),
  // In an iPhone browser tab these pages carry the sign-in hand-off in their
  // address (`FieldWorkspaceAddress`). Another site never gets more than this
  // site's origin as the referrer, whatever the browser's default; map tiles
  // that check the referrer still see the origin.
    referrer: "strict-origin-when-cross-origin",
  };
}

export default function FieldStaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <FieldStaffShell>{children}</FieldStaffShell>;
}
