import { Suspense } from "react";

import { ResetPassword } from "@/components/auth/reset-password";

export default function TraceResetPasswordPage() {
  return <Suspense><ResetPassword portal="MSE_TRACE" /></Suspense>;
}
