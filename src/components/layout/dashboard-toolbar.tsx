"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";

import { GlobalModuleSearch } from "@/components/layout/global-module-search";
import { NotificationButton } from "@/components/notifications/notification-button";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function DashboardToolbar() {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const showBack = pathname !== "/dashboard";

  return (
    <header className="relative z-[500] flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 shadow-[0_1px_0_rgb(0_0_0/0.02)] backdrop-blur lg:px-6">
      <SidebarTrigger className="size-9" />
      {showBack && (
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={() => router.back()}
          title={t("common.back")}
          aria-label={t("common.back")}
        >
          <ArrowLeft />
        </Button>
      )}
      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
        <GlobalModuleSearch />
        <NotificationButton />
      </div>
    </header>
  );
}
