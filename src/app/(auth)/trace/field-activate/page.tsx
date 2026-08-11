import { Suspense } from "react";

import { FieldAccess } from "@/components/field-staff/field-access";

export default function FieldActivatePage() {
  return (
    <Suspense>
      <FieldAccess />
    </Suspense>
  );
}
