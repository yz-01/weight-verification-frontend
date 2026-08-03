import { Suspense } from "react";

import { ResetPassword } from "@/components/auth/reset-password";

export default function AdminResetPasswordPage() {
  return <Suspense><ResetPassword portal="MSE_ADMIN" /></Suspense>;
}
