import type { Metadata } from "next";
import { Suspense } from "react";

import { FieldAccess } from "@/components/field-staff/field-access";

// Installing from the sign-in screen itself must also produce a field app.
export const metadata: Metadata = {
  manifest: "/field-manifest.webmanifest",
};

export default function FieldLoginPage() {
  return (
    <Suspense>
      <FieldAccess />
    </Suspense>
  );
}
