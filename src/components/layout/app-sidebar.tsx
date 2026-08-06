"use client";

import { ChevronDown, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { NotificationButton } from "@/components/notifications/notification-button";
import { useAuth } from "@/components/providers/auth-provider";
import { OfflineStatus } from "@/components/shared/offline-status";
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
  const pathname = usePathname();
  const { user } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups = useMemo(
    () => visibleNavigation(user?.portal, user?.features),
    [user?.portal, user?.features],
  );

  // Tapping a link on a phone should reveal the page it went to, not leave the
  // sheet sitting over it.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="h-4.5 w-4.5" />
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
                  const active = isActivePath(
                    item.href,
                    pathname,
                    item.exact,
                  );
                  const Icon = item.icon;
                  const label = t(`nav.${item.labelKey}`);
                  const isExpanded =
                    expanded.has(item.feature) ||
                    Boolean(item.children?.some((child) => isActivePath(child.href, pathname)));
                  return (
                    <SidebarMenuItem key={item.feature}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={label}
                      >
                        <Link
                          href={item.href}
                          onClick={closeOnMobile}
                          aria-current={active ? "page" : undefined}
                        >
                          <Icon />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.children && item.children.length > 0 && (
                        <SidebarMenuAction
                          type="button"
                          aria-label={t("nav.toggleSubmodules", { module: label })}
                          aria-expanded={isExpanded}
                          onClick={() => setExpanded((current) => {
                            const next = new Set(current);
                            if (next.has(item.feature)) next.delete(item.feature);
                            else next.add(item.feature);
                            return next;
                          })}
                        >
                          <ChevronDown className={isExpanded ? "rotate-180 transition-transform" : "transition-transform"} />
                        </SidebarMenuAction>
                      )}
                      {item.children && isExpanded && (
                        <SidebarMenuSub>
                          {item.children.map((child) => {
                            const childActive = isActivePath(child.href, pathname, true);
                            return (
                              <SidebarMenuSubItem key={child.key}>
                                <SidebarMenuSubButton asChild isActive={childActive}>
                                  <Link
                                    href={child.href}
                                    onClick={closeOnMobile}
                                    aria-current={childActive ? "page" : undefined}
                                  >
                                    <span className="tabular-nums text-[10px] text-muted-foreground">{child.key}</span>
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

      <SidebarFooter>
        <div className="flex items-center justify-between gap-1 group-data-[collapsible=icon]:flex-col">
          <UserMenu />
          <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
            <OfflineStatus />
            <NotificationButton />
            <LanguageSwitcher />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
