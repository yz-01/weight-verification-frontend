"use client";

import { RouteErrorScreen } from "@/components/shared/route-error";

/** The phone workspace: a crash in a page keeps the field app's own screen. */
export default function FieldStaffRouteError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorScreen error={error} boundary="field-staff" />;
}
