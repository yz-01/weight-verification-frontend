"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/components/providers/auth-provider";
import { iconPath } from "@/lib/branding";
import { isFieldSessionPath } from "@/lib/auth-token";

function replaceLink(rel: string, href: string, sizes?: string) {
  const links = [
    ...document.head.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`),
  ];
  const link = links[0] ?? document.createElement("link");

  link.rel = rel;
  link.href = href;
  if (sizes) link.sizes = sizes;
  if (!link.isConnected) document.head.appendChild(link);

  // Next metadata may add its own favicon after this effect runs. Keep one
  // authoritative link so the browser cannot choose the platform icon while
  // the tenant icon is still loading.
  links.slice(1).forEach((candidate) => candidate.remove());
}

export function BrandingSync() {
  const { user } = useAuth();
  const pathname = usePathname();
  const company = user?.branding.company_id ?? null;
  const name = user?.branding.name ?? "MSE Trace";
  const revision = user?.branding.icon_url ?? null;
  const fieldSession = isFieldSessionPath(pathname);

  useEffect(() => {
    const brandRevision = `${name}:${revision ?? "default"}`;
    const links = {
      icon: iconPath(32, { company, revision }),
      apple: iconPath(180, { company, revision }),
      manifest: `/manifest.webmanifest${company ? `?company=${encodeURIComponent(company)}&brand=${encodeURIComponent(brandRevision)}` : ""}`,
    };

    const applyBranding = () => {
      replaceLink("icon", links.icon, "32x32");
      replaceLink("apple-touch-icon", links.apple, "180x180");
      if (!fieldSession) replaceLink("manifest", links.manifest);
      if (document.title !== name) document.title = name;
    };

    applyBranding();
    const observer = new MutationObserver(() => applyBranding());
    observer.observe(document.head, { childList: true });
    return () => observer.disconnect();
  }, [company, fieldSession, name, revision]);

  return null;
}
