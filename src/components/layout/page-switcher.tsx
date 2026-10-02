"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentNav } from "@/hooks/use-current-nav";
import type { FeatureNavChild } from "@/lib/navigation";

/**
 * The compact switcher at the top right of a page under an entry (B04).
 *
 * 「点进去子栏目后右上角有一个下拉式选单可以直接点另外一个子栏目，这样就不需要
 * 退回上一个页面去打开另外一个子栏目」. It lists the same pages as the
 * sidebar's menu for this entry, levels included, and nothing the sidebar
 * would not show this person. Shown only where there is somewhere else to go.
 */
export function PageSwitcher() {
  const t = useTranslations();
  const current = useCurrentNav();
  const pages = current?.item.children ?? [];
  if (!current?.leaf || countPages(pages) < 2) return null;
  const here = current.leaf;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 min-w-0 max-w-56 shrink gap-1.5 bg-card px-2.5 shadow-sm"
          aria-label={t("pageSwitcher.label", { page: t(here.labelKey) })}
          title={t("pageSwitcher.label", { page: t(here.labelKey) })}
        >
          <span className="hidden truncate sm:inline">{t(here.labelKey)}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-56 max-w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t(`nav.${current.item.labelKey}`)}
        </DropdownMenuLabel>
        <Level pages={pages} hereHref={here.href} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Level({
  pages,
  hereHref,
}: {
  pages: readonly FeatureNavChild[];
  hereHref: string;
}) {
  const t = useTranslations();
  return pages.map((page) =>
    page.children?.length ? (
      <DropdownMenuSub key={`${page.key}:${page.href}`}>
        <DropdownMenuSubTrigger className="h-8">{t(page.labelKey)}</DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="min-w-52">
            <Level pages={page.children} hereHref={hereHref} />
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    ) : (
      <DropdownMenuItem key={`${page.key}:${page.href}`} asChild className="h-8">
        <Link
          href={page.href}
          aria-current={page.href === hereHref ? "page" : undefined}
          className={page.href === hereHref ? "font-medium text-primary" : undefined}
        >
          <span className="min-w-0 flex-1 truncate">{t(page.labelKey)}</span>
          {page.href === hereHref && <Check className="size-4 text-primary" />}
        </Link>
      </DropdownMenuItem>
    ),
  );
}

function countPages(pages: readonly FeatureNavChild[]): number {
  return pages.reduce(
    (total, page) => total + (page.children?.length ? countPages(page.children) : 1),
    0,
  );
}
