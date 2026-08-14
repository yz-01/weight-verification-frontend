"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/components/providers/auth-provider";
import {
  BUILTIN_BRANDING,
  cacheBranding,
  getCachedBranding,
  iconPath,
} from "@/lib/branding";
import { isFieldSessionPath } from "@/lib/auth-token";

function replaceLink(rel: string, href: string, sizes?: string) {
  const selector = `link[data-mse-branding="${rel}"]`;
  const link =
    document.head.querySelector<HTMLLinkElement>(selector) ??
    document.createElement("link");

  link.rel = rel;
  link.href = href;
  if (sizes) link.sizes = sizes;
  link.dataset.mseBranding = rel;
  if (!link.isConnected) document.head.appendChild(link);
}

export function BrandingSync() {
  const { user } = useAuth();
  const pathname = usePathname();
  const fieldSession = isFieldSessionPath(pathname);
  const branding =
    user?.branding ?? getCachedBranding(fieldSession) ?? BUILTIN_BRANDING;
  const company = branding.company_id;
  const name = branding.name;
  const revision = branding.icon_url;

  useEffect(() => {
    if (user?.branding) cacheBranding(user.branding, fieldSession);
  }, [fieldSession, user?.branding]);

  useEffect(() => {
    const brandRevision = `${name}:${revision ?? "default"}`;
    const links = {
      icon: company ? iconPath(32, { company, revision }) : "/favicon.ico",
      apple: company
        ? iconPath(180, { company, revision })
        : "/mse-icon-192.png",
      manifest: `/manifest.webmanifest${company ? `?company=${encodeURIComponent(company)}&brand=${encodeURIComponent(brandRevision)}` : ""}`,
    };

    replaceLink("icon", links.icon, "32x32");
    replaceLink("apple-touch-icon", links.apple, "180x180");
    if (!fieldSession) replaceLink("manifest", links.manifest);
    if (document.title !== name) document.title = name;
  }, [company, fieldSession, name, pathname, revision]);

  return null;
}
