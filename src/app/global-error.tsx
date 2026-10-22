"use client";

import "./globals.css";

import { RouteErrorScreen } from "@/components/shared/route-error";

/**
 * A crash in the root layout itself. Replaces Next.js's built-in
 * 「This page couldn't load」 so the error is reported and shows a code.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <RouteErrorScreen error={error} boundary="global" />
      </body>
    </html>
  );
}
