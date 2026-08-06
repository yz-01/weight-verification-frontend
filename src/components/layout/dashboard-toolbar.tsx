"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";

import { GlobalModuleSearch } from "@/components/layout/global-module-search";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function DashboardToolbar() {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const showBack = pathname !== "/dashboard";

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
      <SidebarTrigger className="size-9" />
      {showBack && (
        <Button variant="ghost" size="icon-lg" onClick={() => router.back()} title={t("common.back")} aria-label={t("common.back")}>
          <ArrowLeft />
        </Button>
      )}
      <div className="ml-auto">
        <GlobalModuleSearch />
      </div>
    </header>
  );
}
