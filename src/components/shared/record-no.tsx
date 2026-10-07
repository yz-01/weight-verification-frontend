"use client";

/**
 * A record's number in a list column (2026-10 D4, Q12).
 *
 * Big: the short number a person reads out - `MR-002`. Small underneath: the
 * project code. The whole number is one hover away (the cell's title), one
 * long press away on a phone, and one tap of the copy button away for pasting
 * into a message. A number `parseRecordNo` cannot read is shown as it is.
 *
 * Lists only. Details, exports, PDFs and notifications print the whole number.
 */

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { parseRecordNo } from "@/lib/record-no";
import { cn } from "@/lib/utils";

const LONG_PRESS_MS = 500;

export function RecordNo({
  value,
  projectCode,
  className,
  copyable = true,
}: {
  /** The whole number as stored. */
  value: string | null | undefined;
  /** The record's project code, when the row has it. */
  projectCode?: string | null;
  className?: string;
  /**
   * Off where the whole row is a link: a button inside a link is not valid,
   * and the full number is still one hover or long press away.
   */
  copyable?: boolean;
}) {
  const t = useTranslations("recordNo");
  const [showFull, setShowFull] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const full = (value ?? "").trim();
  if (!full) return <span className="text-muted-foreground">—</span>;
  const parsed = parseRecordNo(full, projectCode);
  const code = parsed?.projectCode ?? projectCode ?? "";

  const stopPress = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const copy = (event: React.MouseEvent) => {
    // The row opens the record on click; copying is not opening it.
    event.stopPropagation();
    void navigator.clipboard
      ?.writeText(full)
      .then(() => toast.success(t("copied", { number: full })))
      .catch(() => toast.error(t("copyFailed")));
  };

  return (
    <div
      className={cn("group min-w-0", className)}
      title={full}
      onTouchStart={() => {
        stopPress();
        timer.current = setTimeout(() => setShowFull((shown) => !shown), LONG_PRESS_MS);
      }}
      onTouchEnd={stopPress}
      onTouchMove={stopPress}
    >
      <div className="flex items-center gap-1">
        <span className="tabular whitespace-nowrap text-[0.9375rem] font-semibold text-foreground">
          {parsed ? parsed.short : full}
        </span>
        {copyable && (
          <button
            type="button"
            onClick={copy}
            aria-label={t("copy", { number: full })}
            title={t("copy", { number: full })}
            className="rounded-md p-1 text-muted-foreground opacity-60 hover:bg-accent hover:text-accent-foreground group-hover:opacity-100"
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </div>
      {code && (
        <span className="tabular block truncate text-[11px] text-muted-foreground">{code}</span>
      )}
      {showFull && parsed && (
        <span className="tabular block break-all text-[11px] text-foreground">{full}</span>
      )}
    </div>
  );
}
