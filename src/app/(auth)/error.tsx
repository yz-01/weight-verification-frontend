"use client";

import { RouteErrorScreen } from "@/components/shared/route-error";

/** Sign-in pages, the phone's ready page and the home-screen app's first stop. */
export default function AuthRouteError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorScreen error={error} boundary="auth" />;
}
