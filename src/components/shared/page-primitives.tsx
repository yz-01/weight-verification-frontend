"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * The pieces every screen is assembled from.
 *
 * Kept in one module so a change to, say, how a required field marks itself
 * lands everywhere at once rather than in whichever screens someone remembers.
 */

/** Section heading inside a card. */
export function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {title}
    </h3>
  );
}

/** Label, control and error message for an editable field. */
export function FieldWrapper({
  label,
  required,
  optional,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className={cn("text-sm font-medium", error && "text-destructive")}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
        {optional && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            ({optional === true ? "optional" : optional})
          </span>
        )}
      </Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

/** Label and value for a read-only field. */
export function ReadField({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  const isEmpty =
    value === null || value === undefined || value === "" || value === "—";
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex min-h-[2.5rem] items-center rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
        {isEmpty ? (
          <span className="italic text-muted-foreground">—</span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

/** Pill with a leading dot, for lifecycle state. */
export function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "positive" | "warning" | "danger" | "info";
}) {
  const tones = {
    positive: "bg-success/10 text-success ring-success/20",
    warning: "bg-warning/12 text-warning ring-warning/25",
    danger: "bg-destructive/10 text-destructive ring-destructive/20",
    info: "bg-info/10 text-info ring-info/20",
    neutral: "bg-muted text-muted-foreground ring-border",
  } as const;
  const dots = {
    positive: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
    info: "bg-info",
    neutral: "bg-muted-foreground/40",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        tones[tone],
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dots[tone])} />
      {label}
    </span>
  );
}

/** Pill without a dot, for a type or category. */
export function TypeBadge({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20",
        className,
      )}
    >
      {label}
    </span>
  );
}

/** List page header: title and count on the left, one action on the right. */
export function ListHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold text-foreground">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

/** Detail and form page header: a plain back link, and at most one action. */
export function DetailHeader({
  backHref,
  backLabel,
  action,
}: {
  backHref: string;
  backLabel: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
