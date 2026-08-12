import type { Metadata } from "next";

import { FieldInstallReady } from "@/components/field-staff/field-install-ready";

type Search = Promise<{ bootstrap?: string | string[] }>;

function bootstrapValue(value: string | string[] | undefined): string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(value)
    ? value
    : "";
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Search;
}): Promise<Metadata> {
  const token = bootstrapValue((await searchParams).bootstrap);
  return {
    referrer: "no-referrer",
    manifest: token
      ? `/field-manifest.webmanifest?bootstrap=${encodeURIComponent(token)}`
      : "/manifest.webmanifest",
  };
}

export default async function FieldReadyPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const token = bootstrapValue((await searchParams).bootstrap);
  return <FieldInstallReady token={token} />;
}
