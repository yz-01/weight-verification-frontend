import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const value = new URL(request.url).searchParams.get("bootstrap") ?? "";
  const token = /^[A-Za-z0-9_-]{20,200}$/.test(value) ? value : "";
  const startUrl = token
    ? `/field-pwa-bootstrap?token=${encodeURIComponent(token)}`
    : "/trace/field-login";
  return NextResponse.json(
    {
      name: "MSE Trace Field Staff",
      short_name: "MSE Field",
      description: "MSE Trace field staff workspace",
      start_url: startUrl,
      scope: "/",
      display: "standalone",
      background_color: "#f8fafb",
      theme_color: "#087f8c",
      orientation: "any",
      icons: [
        {
          src: "/mse-icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/mse-icon-512.png",
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
