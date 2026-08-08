import { Login } from "@/components/auth/login";
import { safeReturnPath } from "@/lib/portal";

export default async function TraceLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return <Login portal="MSE_TRACE" nextPath={safeReturnPath((await searchParams).next)} />;
}
