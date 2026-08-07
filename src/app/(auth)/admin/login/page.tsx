import { Login } from "@/components/auth/login";
import { safeReturnPath } from "@/lib/portal";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return <Login portal="MSE_ADMIN" nextPath={safeReturnPath((await searchParams).next)} />;
}
