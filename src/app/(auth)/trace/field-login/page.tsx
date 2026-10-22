import type { Metadata } from "next";
import { Suspense } from "react";

import { FieldAccess } from "@/components/field-staff/field-access";
import { fieldManifestFromCookie } from "@/lib/field-manifest-server";

// Installing from the sign-in screen itself must also produce a field app -
// one that signs itself in when this Safari tab holds a hand-off.
export async function generateMetadata(): Promise<Metadata> {
  return { manifest: await fieldManifestFromCookie() };
}

export default function FieldLoginPage() {
  return (
    <Suspense>
      <FieldAccess />
    </Suspense>
  );
}
