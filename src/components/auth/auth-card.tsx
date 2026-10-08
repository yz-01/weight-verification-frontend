"use client";

import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { BrandIcon } from "@/components/shared/brand-icon";

/**
 * The frame shared by every signed-out screen.
 *
 * Sign-in, forgot password and reset password all sit inside this, so the
 * three cannot drift into three slightly different pages.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = useTranslations();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pt-safe pb-3 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-panel-border bg-card p-1 shadow-glow-sm">
            <BrandIcon alt={t("app.name")} />
          </span>
          <span className="truncate text-sm font-semibold tracking-tight">
            {t("app.name")}
          </span>
        </div>
        <LanguageSwitcher />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
        <div className="w-full max-w-100">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          </div>

          <div className="surface-panel rounded-xl p-4 sm:p-6">{children}</div>

          {footer && <div className="mt-6 text-center text-sm">{footer}</div>}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            {t("app.tagline")}
          </p>
        </div>
      </main>
    </div>
  );
}
