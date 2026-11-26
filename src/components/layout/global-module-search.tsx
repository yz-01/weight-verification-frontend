"use client";

import { ArrowUpRight, Search, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavLabel } from "@/hooks/use-nav-label";
import { itemNameKey, moduleEntryMatches } from "@/lib/menu-names";
import { navLeaves, visibleNavigation } from "@/lib/navigation";
import {
  focusSection,
  isSettingsAnchor,
  searchSettings,
  settingsResults,
} from "@/lib/settings-search";

export function GlobalModuleSearch() {
  const t = useTranslations();
  const navLabel = useNavLabel();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const entries = useMemo(() => {
    const groups = visibleNavigation(
      user?.portal,
      user?.features,
      user?.permissions,
      user?.is_superuser,
    );
    return groups.flatMap((group) =>
      group.items.flatMap((item) => {
        // JB251: the company's own menu name is shown; the system name
        // still finds it (「设备管理」 finds 「设备租赁管理」).
        const moduleKey = itemNameKey(item);
        const moduleLabel = navLabel(moduleKey);
        return [
          {
            href: item.href,
            label: moduleLabel,
            context: t(`nav.group.${group.key}`),
            also: t(moduleKey as never),
            icon: item.icon,
          },
          ...navLeaves(item.children).map((child) => ({
            href: child.href,
            label: navLabel(child.labelKey),
            context: moduleLabel,
            also: `${t(child.labelKey as never)} ${t(moduleKey as never)}`,
            icon: item.icon,
          })),
        ];
      }),
    );
  }, [navLabel, t, user?.features, user?.is_superuser, user?.permissions, user?.portal]);

  // Every settings section too (JB70: 「助理副密码」 was not found): one
  // result each, 「设定 · 页面 · 区块」, opening the page at that section.
  const settings = useMemo(
    () =>
      settingsResults(user, (key) => t(key as never)).map((row) => ({
        ...row,
        context: "",
        icon: Settings,
      })),
    [t, user],
  );

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return entries.slice(0, 12);
    const modules = entries.filter((entry) => moduleEntryMatches(entry, normalized));
    const sections = searchSettings(query, settings);
    return [...modules.slice(0, 12), ...sections].slice(0, 24);
  }, [entries, settings, query]);

  // A page opened at a settings section (`/profile#sign-off-assistants`),
  // from here or from a link: show that section once it is on the page.
  const pathname = usePathname();
  useEffect(() => {
    const anchor = window.location.hash.slice(1);
    if (anchor && isSettingsAnchor(anchor)) focusSection(anchor);
  }, [pathname]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          // JB202: never pressed thinner than its icon (on a phone its right
          // edge was cut off); from `sm` up as wide as its words need, at
          // least the old 14 / 18 rem (in English the hint lost its end).
          className="h-10 max-w-full shrink-0 justify-start bg-card px-3 text-muted-foreground hover:border-primary/40 hover:bg-accent max-sm:ml-auto sm:min-w-56 lg:min-w-72"
          aria-label={t("globalSearch.open")}
        >
          <Search className="size-4" />
          <span className="hidden flex-1 truncate text-left font-normal sm:inline">
            {t("globalSearch.placeholder")}
          </span>
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-2xs font-medium sm:inline">Ctrl K</kbd>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        collisionPadding={12}
        className="w-[min(94vw,38rem)] gap-0 overflow-hidden border-primary/15 p-0 shadow-xl"
      >
        <div className="relative border-b bg-muted/35 p-3.5">
          <Search className="pointer-events-none absolute left-[1.625rem] top-1/2 size-4 -translate-y-1/2 text-primary" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("globalSearch.placeholder")}
            className="h-11 border bg-background pl-9 pr-3 shadow-sm focus-visible:ring-2"
          />
        </div>
        <div className="max-h-[min(64vh,30rem)] overflow-y-auto overscroll-contain p-2.5">
          {results.length > 0 ? (
            results.map((entry) => {
              const Icon = entry.icon;
              return (
                <Link
                  key={`${entry.href}-${entry.label}`}
                  href={entry.href}
                  data-testid="global-search-result"
                  onClick={() => {
                    close();
                    // The same page at another section: no navigation to wait for.
                    const anchor = (entry as { anchor?: string }).anchor;
                    if (anchor) focusSection(anchor);
                  }}
                  className="group flex min-h-14 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {entry.label}
                    </span>
                    {entry.context ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {entry.context}
                      </span>
                    ) : null}
                  </span>
                  <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-primary" />
                </Link>
              );
            })
          ) : (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              {t("globalSearch.noResults")}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
