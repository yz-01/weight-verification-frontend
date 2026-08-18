import type { Metadata } from "next";
import { Suspense } from "react";

import { FieldAccess } from "@/components/field-staff/field-access";
import { getPublicBranding } from "@/lib/branding-server";
import { iconPath } from "@/lib/branding";

type Search = Promise<{ token?: string | string[] }>;

function invitationValue(value: string | string[] | undefined): string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(value)
    ? value
    : "";
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Search;
}): Promise<Metadata> {
  const token = invitationValue((await searchParams).token);
  const branding = await getPublicBranding({ invitation: token });
  return {
    title: branding.name,
    applicationName: branding.name,
    referrer: "no-referrer",
    icons: {
      icon: [
        {
          url: iconPath(32, {
            invitation: token,
            revision: branding.icon_url,
          }),
          sizes: "32x32",
          type: "image/png",
        },
      ],
      apple: [
        {
          url: iconPath(180, {
            invitation: token,
            revision: branding.icon_url,
          }),
          sizes: "180x180",
          type: "image/png",
        },
      ],
    },
  };
}

export default function FieldActivatePage() {
  return (
    <Suspense>
      <FieldAccess />
    </Suspense>
  );
}
