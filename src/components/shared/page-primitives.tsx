"use client";

import { ArrowLeft, CircleHelp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { helpKeyFor } from "@/lib/page-help";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * The pieces every screen is assembled from.
 *
 * Kept in one module so a change to, say, how a required field marks itself
 * lands everywhere at once rather than in whichever screens someone remembers.
 */

/**
 * What a screen shows when a query fails, told apart from what it shows when
 * the answer is genuinely empty.
 *
 * `data?.results ?? []` turns a failed request into zero rows, and `?? 0`
 * turns it into a zero. From there nothing downstream can tell an empty list
 * from a dead call, so the screen words an absence it never observed - "no
 * schedule history yet" beside a red toast, or a dashboard of nine zeroes
 * that reads as a quiet day rather than as a broken request (F-222).
 *
 * `what` names the data that is missing. "Something went wrong" beside an
 * empty table still does not tell the reader whether the table is empty.
 *
 * `children` is an element rather than a call, so a list's own empty state is
 * only reached once there is a real answer for it to be empty.
 */
export function QueryBoundary({
  query,
  what,
  loading,
  children,
}: {
  query: { isError: boolean; isLoading: boolean; refetch?: () => unknown };
  what: string;
  loading?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("common");
  if (query.isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
        <p className="text-sm text-destructive">{t("loadFailed", { what })}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => query.refetch?.()}
        >
          {t("retry")}
        </Button>
      </div>
    );
  }
  if (query.isLoading && loading !== undefined) return <>{loading}</>;
  return <>{children}</>;
}

/**
 * Stands where the data would have been, when the request for it failed.
 *
 * Pass `what` wherever the subject is known - "the reviewer list" tells the
 * reader something "this did not load" does not. Where it is omitted the
 * position on screen carries the subject instead, which is still enough to
 * stop the reader concluding an absence that was never observed (F-222).
 */
export function LoadFailed({
  what,
  onRetry,
  className,
}: {
  what?: string;
  onRetry?: () => unknown;
  className?: string;
}) {
  const t = useTranslations("common");
  return (
    <div
      className={cn(
        "rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center",
        className,
      )}
    >
      <p className="text-sm text-destructive">
        {what ? t("loadFailed", { what }) : t("sectionLoadFailed")}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => onRetry()}>
          {t("retry")}
        </Button>
      )}
    </div>
  );
}

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
  /** Pass the translated word so the marker is never hardcoded English. */
  optional?: string;
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
            ({optional})
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

/**
 * The five things someone needs to know about the screen they are on.
 *
 * Deliberately the same five questions everywhere, so a person who has read
 * one of these knows where to look in the next: what it does, who may use it,
 * what it will not let you leave blank, what pressing the button actually
 * causes, and what usually goes wrong.
 *
 * `need` is optional because plenty of screens are read-only and inventing a
 * "nothing required" line for them would be noise.
 */
const HELP_SECTIONS = ["what", "who", "need", "then", "trouble"] as const;

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
  const guide = useTranslations("pageGuide");
  const help = useTranslations("pageHelp");
  const { user } = useAuth();
  const pathname = usePathname();
  const helpKey = helpKeyFor(user?.portal, pathname);

  // A screen with nothing true to say about itself shows no help button.
  // Silence beats the three generic sentences this used to open.
  const sections = helpKey
    ? HELP_SECTIONS.filter((name) => help.has(`${helpKey}.${name}`))
    : [];

  return (
    <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 border-b pb-4">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="h-10 w-1 shrink-0 rounded-full bg-primary"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold leading-tight text-foreground">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        {sections.length > 0 && (
          <Dialog>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title={guide("action")}
                aria-label={guide("action")}
              >
                <CircleHelp className="size-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{guide("title", { page: title })}</DialogTitle>
                <DialogDescription>{subtitle}</DialogDescription>
              </DialogHeader>
              <dl className="grid gap-3">
                {sections.map((name) => (
                  <div
                    key={name}
                    className="rounded-lg border bg-muted/20 px-3 py-3"
                  >
                    <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {guide(`section.${name}`)}
                    </dt>
                    <dd className="mt-1 text-sm leading-6">
                      {help(`${helpKey}.${name}`)}
                    </dd>
                  </div>
                ))}
              </dl>
            </DialogContent>
          </Dialog>
        )}
      </div>
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
    // Named so a test can say the page's back bar is *not* inside a dialog:
    // the dialog draws its own header and footer instead (T-216).
    <div
      data-slot="detail-header"
      className="flex items-center justify-between gap-4"
    >
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
