"use client";

import { Loader2, Save, X, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { z } from "zod";

import { DetailHeader } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The create and edit screen skeleton.
 *
 * A top bar outside the card with a back link on the left and Cancel plus the
 * submit pill on the right, then a card whose sections are separated by
 * dividers. Every create screen and its edit twin render through this, so the
 * two can never drift apart in layout.
 */
export function FormShell({
  backHref,
  backLabel,
  title,
  description,
  isSubmitting,
  submitLabel,
  submitIcon: SubmitIcon = Save,
  onSubmit,
  children,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  description?: string;
  isSubmitting: boolean;
  submitLabel: string;
  submitIcon?: LucideIcon;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations();

  return (
    <div className="space-y-4">
      <DetailHeader
        backHref={backHref}
        backLabel={backLabel}
        action={
          <>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="rounded-full px-4"
            >
              <Link href={backHref}>
                <X className="h-4 w-4" />
                {t("common.cancel")}
              </Link>
            </Button>
            <Button
              type="submit"
              form="mse-form"
              size="sm"
              disabled={isSubmitting}
              className="rounded-full px-4 shadow-sm"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SubmitIcon className="h-4 w-4" />
              )}
              {submitLabel}
            </Button>
          </>
        }
      />

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="px-6 py-5">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <form
          id="mse-form"
          className="divide-y border-t"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {children}
        </form>
      </div>
    </div>
  );
}

/** One titled section inside a form or view card. */
export function FormSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className="px-6 py-5">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2", className)}>
        {children}
      </div>
    </section>
  );
}

/** Placeholder while a record loads on an edit or view screen. */
export function FormSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="px-6 py-5">
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="divide-y border-t">
          {Array.from({ length: sections }).map((_, index) => (
            <div key={index} className="px-6 py-5">
              <Skeleton className="mb-4 h-3 w-24" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {Array.from({ length: 4 }).map((__, field) => (
                  <div key={field} className="space-y-1.5">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Shown when a record cannot be loaded. */
export function LoadErrorCard({
  backHref,
  backLabel,
}: {
  backHref: string;
  backLabel: string;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <DetailHeader backHref={backHref} backLabel={backLabel} />
      <div className="rounded-xl border bg-card px-6 py-16 text-center shadow-sm">
        <p className="text-sm font-medium text-foreground">
          {t("errors.notFound")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("errors.notFoundBody")}
        </p>
      </div>
    </div>
  );
}

/**
 * Validators.
 *
 * Zod wrapped in plain functions rather than passed as a schema, because the
 * form layer calls a validator per field and expects a message or undefined.
 */
export function required(message: string) {
  return ({ value }: { value: unknown }) => {
    const result = z.string().trim().min(1, message).safeParse(value);
    return result.success ? undefined : result.error.issues[0].message;
  };
}

export function requiredEmail(requiredMessage: string, emailMessage: string) {
  return ({ value }: { value: unknown }) => {
    if (typeof value !== "string" || value.trim() === "") return requiredMessage;
    // `z.email()` rather than the deprecated `z.string().email()`, which zod
    // v4 kept only for compatibility.
    const result = z.email(emailMessage).safeParse(value.trim());
    return result.success ? undefined : result.error.issues[0].message;
  };
}

export function optionalEmail(emailMessage: string) {
  return ({ value }: { value: unknown }) => {
    if (typeof value !== "string" || value.trim() === "") return undefined;
    const result = z.email(emailMessage).safeParse(value.trim());
    return result.success ? undefined : result.error.issues[0].message;
  };
}

export function optionalPositiveInteger(message: string) {
  return ({ value }: { value: unknown }) => {
    if (typeof value !== "string" || value.trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 ? undefined : message;
  };
}

export function minLength(min: number, message: string) {
  return ({ value }: { value: unknown }) => {
    const result = z.string().min(min, message).safeParse(value);
    return result.success ? undefined : result.error.issues[0].message;
  };
}

/**
 * A form whose fields this helper can write errors onto.
 *
 * Narrowed to the two methods used, so the helper does not have to name
 * TanStack Form's generic type at every call site.
 */
interface ErrorTargetForm {
  getFieldMeta: (field: string) => unknown;
  setFieldMeta: (
    field: string,
    updater: (meta: Record<string, unknown>) => Record<string, unknown>,
  ) => void;
}

/**
 * Turn a rejected API call into per-field messages the form can display.
 *
 * The fields the backend names are the ones only the server could have
 * checked: a duplicate email, a role from another company. Putting them back
 * on the input beats a toast the user has to remember while they hunt for
 * which field it meant.
 *
 * Fields the form does not have are returned rather than written. The backend
 * can name something that has no input — `company` on a screen that infers it,
 * for instance — and `setFieldMeta` on an unknown field hands the updater
 * `undefined`, which throws. That turned every unexpected server error into a
 * crash instead of a message.
 *
 * Returns the messages that had nowhere to go, for the caller to show at form
 * level.
 */
export function applyServerErrors(
  errors: Record<string, string>,
  form: ErrorTargetForm,
): string[] {
  const unplaced: string[] = [];

  for (const [field, message] of Object.entries(errors)) {
    if (!message) continue;

    if (
      field === "non_field_errors" ||
      field === "detail" ||
      form.getFieldMeta(field) === undefined
    ) {
      unplaced.push(message);
      continue;
    }

    form.setFieldMeta(field, (meta) => ({
      ...meta,
      errorMap: {
        ...((meta.errorMap as Record<string, unknown>) ?? {}),
        onSubmit: message,
      },
      errors: [message],
    }));
  }

  return unplaced;
}
