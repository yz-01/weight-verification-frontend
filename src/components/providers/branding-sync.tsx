"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/components/providers/auth-provider";
import {
  BUILTIN_BRANDING,
  cacheBranding,
  getCachedBranding,
  versionedBrandIconUrl,
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
  if (link.href !== new URL(href, window.location.href).href) link.href = href;
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
  const revision = branding.revision;
  const icon = versionedBrandIconUrl(branding);

  useEffect(() => {
    if (user?.branding) cacheBranding(user.branding, fieldSession);
  }, [fieldSession, user?.branding]);

  useEffect(() => {
    // These pages resolve the tenant from a one-time invitation/bootstrap
    // token in their server metadata. Do not replace that company icon with
    // the unauthenticated platform fallback during hydration.
    if (fieldBrandingFromLink && !user?.branding) return;

    const brandRevision = `${name}:${revision ?? icon}`;
    const links = {
      icon,
      apple: icon,
      manifest: `/manifest.webmanifest${company ? `?company=${encodeURIComponent(company)}&brand=${encodeURIComponent(brandRevision)}` : ""}`,
    };

    const applyBranding = () => {
      replaceLink("icon", links.icon, "any");
      replaceLink("apple-touch-icon", links.apple, "180x180");
      if (!fieldSession) replaceLink("manifest", links.manifest);
      if (document.title !== name) document.title = name;
    };

    applyBranding();

    // Route metadata can be committed after React effects and replace the
    // tenant tab branding. Observe only the document head and restore it when
    // that happens; normal application renders and API calls are untouched.
    let animationFrame: number | null = null;
    const observer = new MutationObserver(() => {
      if (animationFrame !== null) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        applyBranding();
      });
    });
    observer.observe(document.head, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [
    company,
    fieldBrandingFromLink,
    fieldSession,
    icon,
    name,
    revision,
    user?.branding,
  ]);

  return null;
}
