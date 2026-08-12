import type { Metadata } from "next";

import { FieldPwaBootstrap } from "@/components/field-staff/field-pwa-bootstrap";

export const metadata: Metadata = { referrer: "no-referrer" };

export default async function FieldPwaBootstrapPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const value = (await searchParams).token;
  const token = typeof value === "string" ? value : "";
  return <FieldPwaBootstrap token={token} />;
}
