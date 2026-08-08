import { Login } from "@/components/auth/login";
import { safeReturnPath } from "@/lib/portal";

export default async function ScrapLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return <Login portal="MSE_SCRAP" nextPath={safeReturnPath((await searchParams).next)} />;
}
