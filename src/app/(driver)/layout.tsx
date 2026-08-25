import type { Metadata } from "next";

import { DriverShell } from "@/components/driver/driver-shell";

export const metadata: Metadata = {
  title: "MSE Trace Driver",
  applicationName: "MSE Trace Driver",
  manifest: "/driver-manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "MSE Trace Driver" },
};

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DriverShell>{children}</DriverShell>;
}
