import { NextResponse } from "next/server";

import { iconPath } from "@/lib/branding";
import { getPublicBranding } from "@/lib/branding-server";
import { fieldManifestStartUrl, MANIFEST_TOKEN } from "@/lib/field-install";

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const value = search.get("bootstrap") ?? "";
  const token = MANIFEST_TOKEN.test(value) ? value : "";
  const invitationValue = search.get("invitation") ?? "";
  const invitation = MANIFEST_TOKEN.test(invitationValue) ? invitationValue : "";
  const branding = await getPublicBranding(
    token ? { bootstrap: token } : { invitation },
  );
  const startUrl = fieldManifestStartUrl(search);
  return NextResponse.json(
    {
      name: `${branding.name} Field Staff`,
      short_name: branding.short_name,
      id: branding.company_id
        ? `/field-staff/${branding.company_id}`
        : "/field-staff",
      description: "MSE Trace field staff workspace",
      start_url: startUrl,
      scope: "/",
      display: "standalone",
      background_color: "#f3f6fa",
      theme_color: "#0e7490",
      orientation: "any",
      icons: [
        {
          src: iconPath(192, {
            bootstrap: token,
            revision: branding.icon_url,
          }),
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: iconPath(512, {
            bootstrap: token,
            revision: branding.icon_url,
          }),
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/manifest+json",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
