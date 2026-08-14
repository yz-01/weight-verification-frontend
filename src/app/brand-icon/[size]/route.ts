import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { getPublicBranding } from "@/lib/branding-server";

const ALLOWED_SIZES = new Set([32, 180, 192, 512]);
const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

function isAllowedIconSource(value: string): boolean {
  try {
    const source = new URL(value);
    const api = new URL(API_BASE_URL);
    return (
      source.origin === api.origin ||
      (source.protocol === "https:" &&
        ((source.hostname === "ap-south-1.linodeobjects.com" &&
          source.pathname.startsWith("/weight-verification/")) ||
          source.hostname.endsWith(".ap-south-1.linodeobjects.com")))
    );
  } catch {
    return false;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const parsed = Number((await params).size);
  const size = ALLOWED_SIZES.has(parsed) ? parsed : 192;
  const search = new URL(request.url).searchParams;
  const revision = search.get("v");
  const branding = await getPublicBranding({
    company: search.get("company"),
    bootstrap: search.get("bootstrap"),
    invitation: search.get("invitation"),
  });

  let source: Buffer;
  try {
    if (!branding.icon_url || !isAllowedIconSource(branding.icon_url)) {
      throw new Error("No permitted uploaded icon");
    }
    const response = await fetch(branding.icon_url, { cache: "no-store" });
    if (!response.ok) throw new Error("Icon source unavailable");
    source = Buffer.from(await response.arrayBuffer());
  } catch {
    source = await readFile(path.join(process.cwd(), "public", "mse-icon-512.png"));
  }

  try {
    const icon = await sharp(source)
      .rotate()
      .resize(size, size, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .png()
      .toBuffer();
    return new NextResponse(new Uint8Array(icon), {
      headers: {
        "Cache-Control": revision
          ? "public, max-age=31536000, immutable"
          : "no-store",
        "Content-Type": "image/png",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch {
    return NextResponse.json({ error: "Invalid branding image" }, { status: 422 });
  }
}
