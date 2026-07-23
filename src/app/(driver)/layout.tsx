import { DriverShell } from "@/components/driver/driver-shell";

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DriverShell>{children}</DriverShell>;
}
