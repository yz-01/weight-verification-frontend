"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import {
  FLYOUT_ATTRIBUTE,
  NavFlyout,
  type FlyoutNode,
} from "@/components/layout/sidebar-flyout";
import { UserMenu } from "@/components/layout/user-menu";
import { useAuth } from "@/components/providers/auth-provider";
import { useUnreadBadges } from "@/hooks/use-unread-badges";
import { OfflineStatus } from "@/components/shared/offline-status";
import { BrandIcon } from "@/components/shared/brand-icon";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  isActivePath,
  navLeaves,
  visibleNavigation,
  type FeatureNavChild,
} from "@/lib/navigation";
import { PORTAL_LABELS } from "@/lib/portal";
import { cn } from "@/lib/utils";

/**
 * The application sidebar.
 *
 * Built on the shadcn sidebar primitives, which bring the mobile sheet, the
 * collapse state and its keyboard shortcut. What is added here is which
 * entries appear: one app serves three consoles, so the navigation is the
 * ordered intersection of the user's portal registry and the feature keys
 * already authorised by the backend.
 *
 * An entry with several pages under it opens them on hover, to the right of
 * the sidebar, a level at a time (B03, 图7); a click on the entry itself goes
 * straight to its first page (A03). A phone has no hover, so there the arrow
 * opens the same levels in place.
 *
 * The account controls sit in the footer rather than in a top bar. The page
 * shell sizes itself to `100dvh - 5rem`, where the 5rem is the layout's own
 * padding, so a horizontal bar above the page slot would push every table's
 * pagination footer below the fold.
 */
export function AppSidebar() {
  const t = useTranslations();
  const badges = useUnreadBadges();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const groups = useMemo(
    () =>
      visibleNavigation(
        user?.portal,
        user?.features,
        user?.permissions,
        user?.is_superuser,
      ),
    [user?.features, user?.is_superuser, user?.permissions, user?.portal],
  );

  // Tapping a link on a phone should reveal the page it went to, not leave the
  // sheet sitting over it.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  // The desktop cascade. One entry's menu is open at a time; leaving the
  // entry or the menu closes it after a moment, long enough for the pointer
  // to cross the gap between the two.
  const [flyout, setFlyout] = useState<{
    key: string;
    anchor: DOMRect;
    focusFirst: boolean;
    opener: HTMLElement | null;
  } | null>(null);
  const closeTimer = useRef<number | null>(null);
  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const closeFlyout = useCallback(() => {
    cancelClose();
    setFlyout(null);
  }, [cancelClose]);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setFlyout(null), 180);
  }, [cancelClose]);
  const openFlyout = (key: string, row: HTMLElement, focusFirst: boolean) => {
    cancelClose();
    if (flyout?.key === key && !focusFirst) return;
    // Against the sidebar's edge rather than the row's, which stops short of
    // it by the menu's padding.
    const rect = row.getBoundingClientRect();
    const edge =
      row.closest('[data-slot="sidebar-container"]')?.getBoundingClientRect().right ??
      rect.right;
    setFlyout({
      key,
      anchor: new DOMRect(rect.left, rect.top, edge - rect.left, rect.height),
      focusFirst,
      opener: row.querySelector<HTMLElement>('[data-sidebar="menu-action"]'),
    });
  };

  // The menu is placed against the row it opened from, so anything that
  // moves the row - scrolling the sidebar, resizing the window - closes it,
  // as does a click anywhere else. Scrolling inside the menu itself does not.
  useEffect(() => {
    if (!flyout) return;
    const inMenu = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(target.closest(`[${FLYOUT_ATTRIBUTE}], [data-sidebar="menu-item"]`));
    const onScroll = (event: Event) => {
      if (!inMenu(event.target)) closeFlyout();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!inMenu(event.target)) closeFlyout();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", closeFlyout);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", closeFlyout);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [flyout, closeFlyout]);

  // A page change closes it too, including one made with the back button.
  useEffect(() => closeFlyout, [pathname, closeFlyout]);

  /**
   * The menu's rows, with which one holds the page being read. A detail page
   * (`/receipts/<id>`) belongs to the closest entry above it, so the menu
   * still shows where the reader is after opening a record.
   */
  const flyoutNodes = (children: readonly FeatureNavChild[]): FlyoutNode[] => {
    const closest = closestRoute(navLeaves(children), pathname);
    const build = (level: readonly FeatureNavChild[]): FlyoutNode[] =>
      level.map((child) => {
        const below = child.children?.length ? build(child.children) : undefined;
        return {
          key: child.key,
          label: t(child.labelKey),
          href: child.href,
          children: below,
          active: below
            ? below.some((node) => node.active)
            : isActiveChild(child.href, pathname, searchParams, closest),
        };
      });
    return build(children);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/80">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-background p-1">
            <BrandIcon
              branding={user?.branding}
              alt={user?.branding?.company_name ?? user?.branding?.name ?? ""}
            />
          </span>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold tracking-tight">
              {user ? PORTAL_LABELS[user.portal] : t("app.name")}
            </p>
            {user?.company_name && (
              <p className="truncate text-xs text-muted-foreground">
                {user.company_name}
              </p>
            )}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group, groupIndex) => (
          <SidebarGroup key={`${group.key}-${groupIndex}`}>
            <SidebarGroupLabel>{t(`nav.group.${group.key}`)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const label = t(`nav.${item.labelKey}`);
                  const entryKey = `${item.feature}:${item.href}`;
                  // `menuHidden` children are already gone: visibleNavigation
                  // drops them with whatever the reader may not open, at
                  // every level, so the menus never list a page the address
                  // bar alone keeps (「证据归档」, T-345).
                  const nodes = flyoutNodes(item.children ?? []);
                  // One page under an entry is the entry: no menu to open.
                  const hasMenu =
                    nodes.length > 1 || Boolean(nodes[0]?.children?.length);
                  const active =
                    isActivePath(item.href, pathname, item.exact) ||
                    nodes.some((node) => node.active);
                  const isExpanded =
                    expanded[entryKey] ?? nodes.some((node) => node.active);
                  const flyoutOpen = flyout?.key === entryKey;
                  return (
                    <SidebarMenuItem
                      key={entryKey}
                      onPointerEnter={(event) => {
                        if (isMobile || event.pointerType !== "mouse") return;
                        if (hasMenu) openFlyout(entryKey, event.currentTarget, false);
                        else closeFlyout();
                      }}
                      onPointerLeave={(event) => {
                        if (event.pointerType === "mouse") scheduleClose();
                      }}
                    >
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={hasMenu && !isMobile ? undefined : label}
                        className={cn(
                          "h-9 rounded-md px-2.5",
                          flyoutOpen &&
                            "bg-sidebar-accent text-sidebar-accent-foreground",
                        )}
                      >
                        <Link
                          href={item.href}
                          prefetch={false}
                          onPointerEnter={() => router.prefetch(item.href)}
                          onFocus={() => router.prefetch(item.href)}
                          onClick={() => {
                            closeFlyout();
                            closeOnMobile();
                          }}
                          aria-current={active ? "page" : undefined}
                        >
                          <Icon />
                          <span>{label}</span>
                          {/* Inside the Link, not in a SidebarMenuAction: the
                              right-hand slot already holds the submodule
                              arrow on every entry that has children, and
                              material receipts is one of them. */}
                          {badges[item.feature] === null && (
                            <span
                              className="ml-auto shrink-0 rounded-full border border-destructive/40 px-1.5 py-0.5 text-[0.625rem] font-semibold leading-none text-destructive group-data-[collapsible=icon]:hidden"
                              aria-label={t("nav.waitingUnknown")}
                              title={t("nav.waitingUnknown")}
                            >
                              ?
                            </span>
                          )}
                          {(badges[item.feature] ?? 0) > 0 && (
                            <span
                              className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[0.625rem] font-semibold leading-none tabular-nums text-primary-foreground group-data-[collapsible=icon]:hidden"
                              aria-label={t("nav.waitingForYou", {
                                count: badges[item.feature] ?? 0,
                              })}
                            >
                              {(badges[item.feature] ?? 0) > 99
                                ? "99+"
                                : badges[item.feature]}
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                      {hasMenu && (
                        <SidebarMenuAction
                          type="button"
                          aria-label={t("nav.toggleSubmodules", {
                            module: label,
                          })}
                          aria-haspopup={isMobile ? undefined : "menu"}
                          aria-expanded={isMobile ? isExpanded : flyoutOpen}
                          onClick={(event) => {
                            if (isMobile) {
                              setExpanded((current) => ({
                                ...current,
                                [entryKey]: !isExpanded,
                              }));
                              return;
                            }
                            const row = event.currentTarget.closest("li");
                            if (flyoutOpen && !flyout?.focusFirst) {
                              // Hover opened it; a click asks for the keyboard
                              // version of the same menu.
                              if (row) openFlyout(entryKey, row, true);
                            } else if (flyoutOpen) {
                              closeFlyout();
                            } else if (row) {
                              openFlyout(entryKey, row, true);
                            }
                          }}
                        >
                          {isMobile ? (
                            <ChevronDown
                              className={
                                isExpanded
                                  ? "rotate-180 transition-transform"
                                  : "transition-transform"
                              }
                            />
                          ) : (
                            <ChevronRight />
                          )}
                        </SidebarMenuAction>
                      )}
                      {isMobile && hasMenu && isExpanded && (
                        <InlineLevel
                          nodes={nodes}
                          expanded={expanded}
                          onToggle={(key, open) =>
                            setExpanded((current) => ({ ...current, [key]: !open }))
                          }
                          onNavigate={closeOnMobile}
                          toggleLabel={(module) =>
                            t("nav.toggleSubmodules", { module })
                          }
                        />
                      )}
                      {!isMobile && flyoutOpen && flyout && (
                        <NavFlyout
                          anchor={flyout.anchor}
                          title={label}
                          nodes={nodes}
                          focusFirst={flyout.focusFirst}
                          onPointerEnter={cancelClose}
                          onPointerLeave={scheduleClose}
                          onClose={(restoreFocus) => {
                            const opener = flyout.opener;
                            closeFlyout();
                            if (restoreFocus) opener?.focus();
                          }}
                        />
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/80">
        <div className="flex items-center justify-between gap-1 group-data-[collapsible=icon]:flex-col">
          <UserMenu />
          <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
            <OfflineStatus />
            <LanguageSwitcher />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

/** One level of the phone menu, and the levels under it once opened. */
function InlineLevel({
  nodes,
  expanded,
  onToggle,
  onNavigate,
  toggleLabel,
}: {
  nodes: FlyoutNode[];
  expanded: Record<string, boolean>;
  onToggle: (key: string, open: boolean) => void;
  onNavigate: () => void;
  toggleLabel: (module: string) => string;
}) {
  return (
    <SidebarMenuSub className="my-1 gap-0.5">
      {nodes.map((node) => {
        const hasLevel = Boolean(node.children?.length);
        const open = expanded[node.key] ?? node.active;
        return (
          <SidebarMenuSubItem key={node.key}>
            <div className="flex items-center gap-1">
              <SidebarMenuSubButton
                asChild
                isActive={node.active && !hasLevel}
                className="h-9 min-w-0 flex-1 rounded-md px-2.5"
              >
                <Link
                  href={node.href}
                  prefetch={false}
                  onClick={onNavigate}
                  aria-current={node.active && !hasLevel ? "page" : undefined}
                >
                  <span>{node.label}</span>
                </Link>
              </SidebarMenuSubButton>
              {hasLevel && (
                <button
                  type="button"
                  aria-label={toggleLabel(node.label)}
                  aria-expanded={open}
                  onClick={() => onToggle(node.key, open)}
                  className="grid size-9 shrink-0 place-items-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent"
                >
                  <ChevronDown
                    className={cn("size-4 transition-transform", open && "rotate-180")}
                  />
                </button>
              )}
            </div>
            {hasLevel && open && (
              <InlineLevel
                nodes={node.children ?? []}
                expanded={expanded}
                onToggle={onToggle}
                onNavigate={onNavigate}
                toggleLabel={toggleLabel}
              />
            )}
          </SidebarMenuSubItem>
        );
      })}
    </SidebarMenuSub>
  );
}

/** The longest entry route the current page sits under, if any. */
function closestRoute(
  leaves: readonly FeatureNavChild[],
  pathname: string,
): string | null {
  let best: string | null = null;
  for (const leaf of leaves) {
    const route = leaf.href.split("?", 1)[0];
    if (
      (pathname === route || pathname.startsWith(`${route}/`)) &&
      route.length > (best?.length ?? -1)
    ) {
      best = route;
    }
  }
  return best;
}

function isActiveChild(
  href: string,
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
  closest: string | null,
) {
  const [route, query = ""] = href.split("?", 2);
  if (pathname !== route) return route === closest && pathname.startsWith(`${route}/`);

  const expected = new URLSearchParams(query);
  if (expected.has("tab")) {
    return searchParams.get("tab") === expected.get("tab");
  }

  // A scanned gate link also belongs to the gate view, not the pass list.
  return searchParams.get("tab") !== "gate" && !searchParams.get("scan");
}
