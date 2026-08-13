"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/components/providers/auth-provider";
import { iconPath } from "@/lib/branding";
import { isFieldSessionPath } from "@/lib/auth-token";

function replaceLink(rel: string, href: string, sizes?: string) {
  document.head
    .querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`)
    .forEach((link) => link.remove());
  const link = document.createElement("link");
  link.rel = rel;
  link.href = href;
  if (sizes) link.sizes = sizes;
  document.head.appendChild(link);
}

export function BrandingSync() {
  const { user } = useAuth();
  const pathname = usePathname();
  const company = user?.branding.company_id ?? null;
  const name = user?.branding.name ?? "MSE Trace";
  const revision = user?.branding.icon_url ?? null;

  useEffect(() => {
    replaceLink("icon", iconPath(32, { company, revision }), "32x32");
    replaceLink(
      "apple-touch-icon",
      iconPath(180, { company, revision }),
      "180x180",
    );
    if (!isFieldSessionPath(pathname)) {
      replaceLink(
        "manifest",
        `/manifest.webmanifest${company ? `?company=${encodeURIComponent(company)}&brand=${encodeURIComponent(revision ?? "")}` : ""}`,
      );
    }
    document.title = name;
  }, [company, name, pathname, revision]);

  return null;
}
