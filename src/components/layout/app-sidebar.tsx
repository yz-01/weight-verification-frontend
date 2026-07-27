"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { useAuth } from "@/components/providers/auth-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { isActivePath, visibleNavigation } from "@/lib/navigation";

/**
 * The application sidebar.
 *
 * Built on the shadcn sidebar primitives, which bring the mobile sheet, the
 * collapse state and its keyboard shortcut. What is added here is which
 * entries appear: one app serves three consoles, so the navigation is derived
 * from the signed-in user's audience and permissions rather than branched on.
 *
 * The account controls sit in the footer rather than in a top bar. The page
 * shell sizes itself to `100dvh - 5rem`, where the 5rem is the layout's own
 * padding, so a horizontal bar above the page slot would push every table's
 * pagination footer below the fold.
 */
export function AppSidebar() {
  const t = useTranslations();
  const pathname = usePathname();
  const { user, can } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();

  const groups = useMemo(
    () => visibleNavigation(user?.audience, can),
    [user?.audience, can],
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
              {t("app.name")}
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
        {groups.map((group) => (
          <SidebarGroup key={group.key}>
            <SidebarGroupLabel>{t(`nav.group.${group.key}`)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActivePath(item.href, pathname);
                  const Icon = item.icon;
                  const label = t(`nav.${item.key}`);
                  return (
                    <SidebarMenuItem key={item.key}>
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
          <LanguageSwitcher className="group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
