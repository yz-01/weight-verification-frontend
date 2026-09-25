"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
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
import { isActivePath, visibleNavigation } from "@/lib/navigation";
import { PORTAL_LABELS } from "@/lib/portal";

/**
 * The application sidebar.
 *
 * Built on the shadcn sidebar primitives, which bring the mobile sheet, the
 * collapse state and its keyboard shortcut. What is added here is which
 * entries appear: one app serves three consoles, so the navigation is the
 * ordered intersection of the user's portal registry and the feature keys
 * already authorised by the backend.
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
                  const active = isActivePath(item.href, pathname, item.exact);
                  const Icon = item.icon;
                  const label = t(`nav.${item.labelKey}`);
                  const childIsActive = Boolean(
                    item.children?.some((child) =>
                      isActivePath(child.href, pathname, true),
                    ),
                  );
                  const isExpanded = expanded[item.feature] ?? childIsActive;
                  return (
                    <SidebarMenuItem key={`${item.feature}:${item.href}`}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={label}
                        className="h-10 rounded-lg px-3 font-medium"
                      >
                        <Link
                          href={item.href}
                          prefetch={false}
                          onPointerEnter={() => router.prefetch(item.href)}
                          onFocus={() => router.prefetch(item.href)}
                          onClick={closeOnMobile}
                          aria-current={active ? "page" : undefined}
                        >
                          <Icon />
                          <span>{label}</span>
                          {/* Inside the Link, not in a SidebarMenuAction: the
                              right-hand slot already holds the submodule
                              chevron on every entry that has children, and
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
                      {item.children && item.children.length > 0 && (
                        <SidebarMenuAction
                          type="button"
                          aria-label={t("nav.toggleSubmodules", {
                            module: label,
                          })}
                          aria-expanded={isExpanded}
                          onClick={() =>
                            setExpanded((current) => ({
                              ...current,
                              [item.feature]: !isExpanded,
                            }))
                          }
                        >
                          <ChevronDown
                            className={
                              isExpanded
                                ? "rotate-180 transition-transform"
                                : "transition-transform"
                            }
                          />
                        </SidebarMenuAction>
                      )}
                      {item.children && isExpanded && (
                        <SidebarMenuSub className="my-1 gap-0.5">
                          {item.children.map((child) => {
                            const childActive = isActiveChild(
                              child.href,
                              pathname,
                              searchParams,
                            );
                            return (
                              <SidebarMenuSubItem key={child.key}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={childActive}
                                  className="h-8 rounded-lg px-3"
                                >
                                  <Link
                                    href={child.href}
                                    prefetch={false}
                                    onPointerEnter={() => router.prefetch(child.href)}
                                    onFocus={() => router.prefetch(child.href)}
                                    onClick={closeOnMobile}
                                    aria-current={
                                      childActive ? "page" : undefined
                                    }
                                  >
                                    <span>{t(child.labelKey)}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
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

function isActiveChild(
  href: string,
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
) {
  const [route, query = ""] = href.split("?", 2);
  if (pathname !== route) return false;

  const expected = new URLSearchParams(query);
  if (expected.has("tab")) {
    return searchParams.get("tab") === expected.get("tab");
  }

  // A scanned gate link also belongs to the gate view, not the pass list.
  return searchParams.get("tab") !== "gate" && !searchParams.get("scan");
}
