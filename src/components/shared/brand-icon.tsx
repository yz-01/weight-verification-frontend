"use client";

import type { Branding } from "@/interfaces/auth";
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
    // Branding URLs are already public and selected by the API in company,
    // platform-default, then built-in fallback order.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={branding?.icon_url ?? "/mse-icon.svg"}
      alt={alt}
      className={cn("size-full object-contain", className)}
      draggable={false}
    />
  );
}
