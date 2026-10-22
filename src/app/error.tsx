"use client";

import { RouteErrorScreen } from "@/components/shared/route-error";

/** Any page that crashes below the root layout: our screen, reported, with a code. */
export default function RootRouteError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorScreen error={error} boundary="app" />;
}
