"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";

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
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** A page in a dialog (J34-6, 图 6): as wide as the screen allows. */
  wide?: boolean;
}) {
  const common = useTranslations("common");
  // A press on the dark area beside the panel closes it, like every other
  // dialog (Lucas 2026-10-24: 「点旁边空白的地方…会关闭弹窗」). Only when the
  // press also began there: selecting text inside and letting go outside
  // keeps it open.
  const pressedOutside = useRef(false);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim p-0 sm:items-center sm:p-4"
      onPointerDown={(event) => {
        pressedOutside.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedOutside.current && event.target === event.currentTarget) onClose();
        pressedOutside.current = false;
      }}
    >
      <div className={`flex max-h-[90dvh] w-full ${wide ? "max-w-7xl" : "max-w-2xl"} flex-col overflow-hidden rounded-t-xl bg-popover text-popover-foreground shadow-panel ring-1 ring-panel-border sm:rounded-xl`}>
        <header className="flex items-center gap-2 border-b border-panel-border px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
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
