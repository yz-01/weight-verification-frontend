import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { TONES, type Tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

/**
 * A dashboard figure in the canvas's KPI card: a tinted card in the figure's
 * own data colour, the label on top, the number large in the display face.
 *
 * Dark mode lights the edge and the number; light mode keeps the colour and
 * drops the glow. Every card that counts something leads somewhere (E1), so a
 * card takes an `href` (a list) or an `onClick` (a breakdown); a card with
 * neither is a plain figure.
 */
export function KpiCard({
  label,
  value,
  tone = "cyan",
  detail,
  icon: Icon,
  href,
  onClick,
  size = "md",
  className,
  children,
  ...rest
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: Tone;
  detail?: ReactNode;
  icon?: LucideIcon;
  href?: string | null;
  onClick?: () => void;
  /** `sm` for a row of six, `md` for the usual grid, `lg` for the big screen. */
  size?: "sm" | "md" | "lg";
  className?: string;
  children?: ReactNode;
} & Record<`data-${string}`, string | boolean | undefined> & {
  "aria-label"?: string;
  title?: string;
}) {
  const colours = TONES[tone];
  const body = (
    <>
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className="line-clamp-2 min-w-0 text-xs font-medium leading-snug text-muted-foreground">
          {label}
        </span>
        {Icon ? (
          <Icon className={cn("size-4 shrink-0", colours.text)} aria-hidden />
        ) : (
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", colours.dot, colours.glow)} />
        )}
      </span>
      <span
        className={cn(
          "kpi-figure block truncate",
          colours.text,
          size === "sm" && "text-2xl",
          size === "md" && "text-3xl",
          size === "lg" && "text-4xl",
        )}
      >
        {value}
      </span>
      {detail ? (
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      ) : null}
      {children}
    </>
  );
  const classes = cn(
    "flex min-w-0 flex-col gap-1 rounded-xl border text-left transition",
    size === "sm" ? "px-3 py-2.5" : "px-4 py-3",
    colours.surface,
    (href || onClick) &&
      "hover:-translate-y-px hover:shadow-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes} {...rest}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} {...rest}>
        {body}
      </button>
    );
  }
  return (
    <div className={classes} {...rest}>
      {body}
    </div>
  );
}
