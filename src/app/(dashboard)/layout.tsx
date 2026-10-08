import { DashboardShell } from "@/components/layout/dashboard-shell";
import { InAppNavigationTracker } from "@/components/shared/dialog-navigation";

/**
 * `modal` is the parallel slot the intercepted create and edit routes render
 * into (T-216). It is `null` on every other address - see `@modal/default.tsx`
 * and `@modal/[...catchAll]` - so the dashboard looks exactly as it did until
 * somebody clicks New or Edit.
 *
 * The tracker records each in-app navigation so a dialog knows whether it
 * has somewhere to go back to when it closes (`dialog-navigation.tsx`).
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
      <InAppNavigationTracker />
      {children}
      {modal}
    </DashboardShell>
  );
}
