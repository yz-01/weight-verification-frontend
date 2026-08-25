import { NextResponse } from "next/server";

import { iconPath } from "@/lib/branding";
import { getPublicBranding } from "@/lib/branding-server";

export async function GET(request: Request) {
  const value = new URL(request.url).searchParams.get("bootstrap") ?? "";
  const token = /^[A-Za-z0-9_-]{20,200}$/.test(value) ? value : "";
  const branding = await getPublicBranding({ bootstrap: token });
  const startUrl = token
    ? `/field-pwa-bootstrap?token=${encodeURIComponent(token)}`
    : "/trace/field-login";
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
      background_color: "#f8fafb",
      theme_color: "#087f8c",
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
