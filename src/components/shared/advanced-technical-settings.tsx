"use client";

import { ChevronDown, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

type AdvancedTechnicalSettingsProps = {
  children: ReactNode;
  title?: string;
  description?: string;
  defaultOpen?: boolean;
};

/** Keeps engineering-only fields available without making the normal workflow technical. */
export function AdvancedTechnicalSettings({
  children,
  title,
  description,
  defaultOpen = false,
}: AdvancedTechnicalSettingsProps) {
  const t = useTranslations("adminSystemSettings");

  return (
    <details
      className="group rounded-lg border border-dashed bg-muted/10 sm:col-span-2"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <Settings2 className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">
            {title ?? t("guide.advancedTitle")}
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
            {description ?? t("guide.advancedDescription")}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-4 border-t px-4 py-4 sm:grid-cols-2">{children}</div>
    </details>
  );
}
