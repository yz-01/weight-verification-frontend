import { NextResponse } from "next/server";

import { getPublicBranding } from "@/lib/branding-server";
import { iconPath } from "@/lib/branding";

export async function GET(request: Request) {
  const company = new URL(request.url).searchParams.get("company");
  const branding = await getPublicBranding({ company });
  return NextResponse.json(
    {
      name: `${branding.name} Driver`,
      short_name: `${branding.short_name} Driver`,
      id: company ? `/driver/${company}` : "/driver",
      description: "MSE Trace driver collection workspace",
      start_url: "/driver",
      scope: "/",
      display: "standalone",
      background_color: "#f8fafb",
      theme_color: "#087f8c",
      orientation: "any",
      icons: [
        { src: iconPath(192, { company, revision: branding.icon_url }), sizes: "192x192", type: "image/png", purpose: "any" },
        { src: iconPath(512, { company, revision: branding.icon_url }), sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Cache-Control": "no-store", "Content-Type": "application/manifest+json" } },
  );
}
