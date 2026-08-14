import type { Metadata } from "next";

import { FieldInstallReady } from "@/components/field-staff/field-install-ready";
import { getPublicBranding } from "@/lib/branding-server";
import { iconPath } from "@/lib/branding";
import { safeReturnPath } from "@/lib/portal";

type Search = Promise<{
  bootstrap?: string | string[];
  next?: string | string[];
}>;

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
  const branding = await getPublicBranding({ bootstrap: token });
  return {
    title: branding.name,
    applicationName: branding.name,
    referrer: "no-referrer",
    manifest: token
      ? `/field-manifest.webmanifest?bootstrap=${encodeURIComponent(token)}`
      : "/manifest.webmanifest",
    icons: {
      icon: [
        {
          url: iconPath(32, {
            bootstrap: token,
            revision: branding.icon_url,
          }),
          sizes: "32x32",
          type: "image/png",
        },
      ],
      apple: [
        {
          url: iconPath(180, {
            bootstrap: token,
            revision: branding.icon_url,
          }),
          sizes: "180x180",
          type: "image/png",
        },
      ],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: branding.short_name,
    },
  };
}

export default async function FieldReadyPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const search = await searchParams;
  const token = bootstrapValue(search.bootstrap);
  return <FieldInstallReady token={token} next={safeReturnPath(search.next)} />;
}
