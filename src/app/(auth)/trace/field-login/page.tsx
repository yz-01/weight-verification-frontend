import { Suspense } from "react";

import { FieldAccess } from "@/components/field-staff/field-access";

export default function FieldLoginPage() {
  return (
    <Suspense>
      <FieldAccess />
    </Suspense>
  );
}
