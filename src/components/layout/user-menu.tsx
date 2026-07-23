"use client";

import { LogOut, Moon, Sun, User as UserIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { useAuth } from "@/components/providers/auth-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu() {
  const t = useTranslations();
  const { user, signOut } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();

  if (user === null) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials(user.full_name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{user.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          {user.role_name && (
            <p className="mt-1.5 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[0.6875rem] font-medium text-primary ring-1 ring-inset ring-primary/20">
              {user.role_name}
            </p>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserIcon className="h-4 w-4" />
            {t("common.profile")}
          </Link>
        </DropdownMenuItem>
        {/* The active theme is only known on the client, so the label and icon
            are swapped with CSS against the `dark` class next-themes puts on
            the root. Deciding in JavaScript would either need a mounted flag or
            produce a hydration mismatch on every page load. */}
        <DropdownMenuItem
          onSelect={(event) => {
            // Keep the menu open so the change is visible where it was made.
            event.preventDefault();
            setTheme(resolvedTheme === "dark" ? "light" : "dark");
          }}
        >
          <Moon className="h-4 w-4 dark:hidden" />
          <Sun className="hidden h-4 w-4 dark:block" />
          <span className="dark:hidden">{t("common.themeDark")}</span>
          <span className="hidden dark:inline">{t("common.themeLight")}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => void signOut()}
        >
          <LogOut className="h-4 w-4" />
          {t("common.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
