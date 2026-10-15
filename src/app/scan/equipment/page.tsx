import { Suspense } from "react";

import { EquipmentScanLanding } from "@/components/contractor-ops/equipment-scan-landing";

/** A machine's printed QR code, scanned with the phone's camera (2026-10 I24). */
export default function EquipmentScanPage() {
  return (
    <Suspense>
      <EquipmentScanLanding />
    </Suspense>
  );
}
