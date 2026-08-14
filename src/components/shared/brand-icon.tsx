"use client";

import type { Branding } from "@/interfaces/auth";
import { iconPath } from "@/lib/branding";
import { cn } from "@/lib/utils";

export function BrandIcon({
  branding,
  className,
  alt = "",
}: {
  branding?: Branding | null;
  className?: string;
  alt?: string;
}) {
  return (
    // The same-origin icon route normalises every uploaded logo to PNG and
    // falls back to the platform icon when a company has no logo.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={iconPath(32, {
        company: branding?.company_id,
        revision: branding?.icon_url,
      })}
      alt={alt}
      className={cn("size-full object-contain", className)}
      draggable={false}
    />
  );
}
