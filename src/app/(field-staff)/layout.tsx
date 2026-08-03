import { FieldStaffShell } from "@/components/field-staff/field-staff-shell";

export default function FieldStaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <FieldStaffShell>{children}</FieldStaffShell>;
}
