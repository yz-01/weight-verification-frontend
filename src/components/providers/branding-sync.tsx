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

  document.head
    .querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`)
    .forEach((candidate) => {
      if (candidate !== link) candidate.remove();
    });

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
  const fieldBrandingFromLink =
    pathname === "/trace/field-activate" ||
    pathname === "/trace/field-ready" ||
    pathname === "/field-pwa-bootstrap";
  const branding =
    user?.branding ?? getCachedBranding(fieldSession) ?? BUILTIN_BRANDING;
  const company = branding.company_id;
  const name = branding.name;
  const revision = branding.icon_url;

  useEffect(() => {
    if (user?.branding) cacheBranding(user.branding, fieldSession);
  }, [fieldSession, user?.branding]);

  useEffect(() => {
    // These pages resolve the tenant from a one-time invitation/bootstrap
    // token in their server metadata. Do not replace that company icon with
    // the unauthenticated platform fallback during hydration.
    if (fieldBrandingFromLink && !user?.branding) return;

    const brandRevision = `${name}:${revision ?? "default"}`;
    const links = {
      icon: iconPath(32, { company, revision }),
      apple: iconPath(180, { company, revision }),
      manifest: `/manifest.webmanifest${company ? `?company=${encodeURIComponent(company)}&brand=${encodeURIComponent(brandRevision)}` : ""}`,
    };

    replaceLink("icon", links.icon, "32x32");
    replaceLink("apple-touch-icon", links.apple, "180x180");
    if (!fieldSession) replaceLink("manifest", links.manifest);
    if (document.title !== name) document.title = name;
  }, [
    company,
    fieldBrandingFromLink,
    fieldSession,
    name,
    pathname,
    revision,
    user?.branding,
  ]);

  return null;
}
