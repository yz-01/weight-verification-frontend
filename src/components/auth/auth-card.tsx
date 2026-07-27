"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/layout/language-switcher";

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
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-5 lg:px-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="h-4.5 w-4.5" />
          </span>
          <span className="text-sm font-semibold tracking-tight">
            {t("app.name")}
          </span>
        </div>
        <LanguageSwitcher />
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm">{children}</div>

          {footer && <div className="mt-6 text-center text-sm">{footer}</div>}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            {t("app.tagline")}
          </p>
        </div>
      </main>
    </div>
  );
}
