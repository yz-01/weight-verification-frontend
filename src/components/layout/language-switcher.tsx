"use client";

import { Check, Languages } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALES, LOCALE_LABELS, resolveLocale, type Locale } from "@/i18n/config";
import { setLocaleCookie } from "@/lib/auth-token";
import { cn } from "@/lib/utils";
import * as authService from "@/services/auth.service";

/**
 * Switch the interface language.
 *
 * For a signed-in user the choice is persisted on their account, so it follows
 * them to any device. Before sign-in there is no account to write to, so the
 * cookie alone carries it and the account overwrites it at sign-in.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const locale = resolveLocale(useLocale());
  const { user, refresh } = useAuth();
  const [isPending, startTransition] = useTransition();

  async function choose(next: Locale) {
    if (next === locale) return;

    setLocaleCookie(next);
    if (user !== null) {
      await authService.updateProfile({ language: next });
      await refresh();
    }
    // The catalogue is resolved on the server from the cookie, so the tree has
    // to be re-rendered for the new language to take effect.
    startTransition(() => router.refresh());
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          className={cn("gap-2 rounded-full px-3 text-muted-foreground", className)}
        >
          <Languages className="h-4 w-4" />
          <span className="text-xs font-medium">{LOCALE_LABELS[locale]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {LOCALES.map((option) => (
          <DropdownMenuItem
            key={option}
            onSelect={() => void choose(option)}
            className="justify-between"
          >
            {LOCALE_LABELS[option]}
            {option === locale && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
