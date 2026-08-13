import { NextResponse } from "next/server";

import { getPublicBranding } from "@/lib/branding-server";
import { iconPath } from "@/lib/branding";

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const company = search.get("company");
  const branding = await getPublicBranding({ company });
  return NextResponse.json(
    {
      name: branding.name,
      short_name: branding.short_name,
      id: company ? `/company/${company}` : "/mse-trace",
      description: "Verified weight and traceable site operations",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#087f8c",
      orientation: "any",
      icons: [
        {
          src: iconPath(192, { company, revision: branding.icon_url }),
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: iconPath(512, { company, revision: branding.icon_url }),
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
      },
    },
  );
}
