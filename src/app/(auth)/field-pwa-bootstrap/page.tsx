import type { Metadata } from "next";

import { FieldPwaBootstrap } from "@/components/field-staff/field-pwa-bootstrap";
import { safeReturnPath } from "@/lib/portal";

export const metadata: Metadata = { referrer: "no-referrer" };

export default async function FieldPwaBootstrapPage({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string | string[];
    next?: string | string[];
  }>;
}) {
  const search = await searchParams;
  const value = search.token;
  const token = typeof value === "string" ? value : "";
  return <FieldPwaBootstrap token={token} next={safeReturnPath(search.next)} />;
}
