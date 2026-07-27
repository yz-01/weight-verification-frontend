import { Suspense } from "react";

import { ResetPassword } from "@/components/auth/reset-password";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPassword />
    </Suspense>
  );
}
