import { Suspense } from "react";

import { ResetPassword } from "@/components/auth/reset-password";

export default function ScrapResetPasswordPage() {
  return <Suspense><ResetPassword portal="MSE_SCRAP" /></Suspense>;
}
