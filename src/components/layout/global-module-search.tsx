"use client";

import { ArrowUpRight, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { visibleNavigation } from "@/lib/navigation";

export function GlobalModuleSearch() {
  const t = useTranslations();
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
    const groups = visibleNavigation(user?.portal, user?.features);
    return groups.flatMap((group) =>
      group.items.flatMap((item) => {
        const moduleLabel = t(`nav.${item.labelKey}`);
        return [
          { href: item.href, label: moduleLabel, context: t(`nav.group.${group.key}`), icon: item.icon },
          ...(item.children ?? []).map((child) => ({
            href: child.href,
            label: t(child.labelKey),
            context: moduleLabel,
            icon: item.icon,
          })),
        ];
      }),
    );
  }, [t, user?.features, user?.portal]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return entries.slice(0, 12);
    return entries
      .filter((entry) => `${entry.label} ${entry.context}`.toLocaleLowerCase().includes(normalized))
      .slice(0, 20);
  }, [entries, query]);

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
          className="h-9 min-w-0 max-w-full shrink justify-start bg-card px-2.5 text-muted-foreground shadow-sm hover:border-primary/30 hover:bg-accent sm:w-56 sm:flex-none lg:w-72"
          aria-label={t("globalSearch.open")}
        >
          <Search className="size-4" />
          <span className="hidden flex-1 truncate text-left font-normal sm:inline">
            {t("globalSearch.placeholder")}
          </span>
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline">Ctrl K</kbd>
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
                  onClick={close}
                  className="group flex min-h-14 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {entry.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {entry.context}
                    </span>
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
