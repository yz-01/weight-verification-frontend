import { DashboardShell } from "@/components/layout/dashboard-shell";

/**
 * `modal` is the parallel slot the intercepted create and edit routes render
 * into (T-216). It is `null` on every other address - see `@modal/default.tsx`
 * - so the dashboard looks exactly as it did until somebody clicks New or Edit.
 */
export default function DashboardLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <DashboardShell>
      {children}
      {modal}
    </DashboardShell>
  );
}
