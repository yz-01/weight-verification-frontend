"use client";

import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { THEME_CHOICES, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ICON: Record<ThemeChoice, LucideIcon> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const noop = () => () => {};

/**
 * The stored choice, once on the client. The server cannot know it, so the
 * first render marks nothing chosen and the browser fills it in after
 * hydration rather than disagreeing with the server's markup.
 */
function useChoice(): [ThemeChoice | null, (next: ThemeChoice) => void] {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const current = mounted && THEME_CHOICES.includes(theme as ThemeChoice)
    ? (theme as ThemeChoice)
    : mounted
      ? "system"
      : null;
  return [current, (next) => setTheme(next)];
}

/**
 * 外观 as an icon button with its three choices: the office top bar and the
 * phone app's header. Two presses on a desk or a phone.
 */
export function ThemeMenu({ className }: { className?: string }) {
  const t = useTranslations("theme");
  const [current, choose] = useChoice();
  const Icon = ICON[current ?? "system"];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn("size-10 bg-card", className)}
          title={t("label")}
          aria-label={t("label")}
        >
          <Icon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("label")}</DropdownMenuLabel>
        {THEME_CHOICES.map((option) => {
          const OptionIcon = ICON[option];
          return (
            <DropdownMenuItem
              key={option}
              data-theme-choice={option}
              onSelect={() => choose(option)}
              className="justify-between"
            >
              <span className="flex items-center gap-2">
                <OptionIcon className="size-4" />
                {t(option)}
              </span>
              {option === current && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The same choice as three side-by-side buttons: the HQ big screen's corner
 * and anywhere the choice should be visible at a glance.
 */
export function ThemeSegmented({ className }: { className?: string }) {
  const t = useTranslations("theme");
  const [current, choose] = useChoice();
  return (
    <div
      role="group"
      aria-label={t("label")}
      className={cn("inline-flex rounded-xl border border-panel-border bg-muted p-1", className)}
    >
      {THEME_CHOICES.map((option) => {
        const OptionIcon = ICON[option];
        const active = option === current;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            data-theme-choice={option}
            onClick={() => choose(option)}
            title={t(option)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-10",
              active
                ? "bg-card text-foreground shadow-panel dark:bg-primary/15 dark:text-tone-cyan-fg"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <OptionIcon className="size-4" aria-hidden />
            {t(option)}
          </button>
        );
      })}
    </div>
  );
}
