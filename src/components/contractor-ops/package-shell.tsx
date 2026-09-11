"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

/**
 * The panel every Multi Engine dialog is drawn in.
 *
 * Lifted out of `multi-engine.tsx` when the per-record shortcut (T-238) needed
 * the same panel: a second copy is a second place for the two to drift, and
 * the whole point of the shortcut is that a record added from a column looks
 * exactly like one added from the workspace.
 */
export function Shell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const common = useTranslations("common");
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl bg-card sm:rounded-xl">
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate font-semibold">{title}</h2>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label={common("close")}
          >
            <X />
          </Button>
        </header>
        {children}
      </div>
    </div>
  );
}
