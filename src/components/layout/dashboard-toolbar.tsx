"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";

import { GlobalModuleSearch } from "@/components/layout/global-module-search";
import { NotificationButton } from "@/components/notifications/notification-button";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useQueryClient } from "@tanstack/react-query";
import { setActiveProjectId } from "@/lib/project-context";

export function DashboardToolbar() {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, refresh } = useAuth();
  const showBack = pathname !== "/dashboard";

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 shadow-[0_1px_0_rgb(0_0_0/0.02)] backdrop-blur lg:px-6">
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
        {user?.account_type === "CONSULTANT" && (
          <select
            aria-label={t("consultantProject.label")}
            className="h-9 min-w-0 max-w-56 rounded-md border bg-background px-2 text-sm"
            value={user.active_project?.project_id ?? ""}
            onChange={async (event) => {
              setActiveProjectId(event.target.value);
              await queryClient.cancelQueries();
              queryClient.removeQueries({
                predicate: (query) => query.queryKey[0] !== "auth",
              });
              await refresh();
              router.refresh();
            }}
          >
            {user.consultant_projects
              .filter((project) => project.is_current)
              .map((project) => (
                <option key={project.project_id} value={project.project_id}>
                  {project.project_code} - {project.project_name}
                </option>
              ))}
          </select>
        )}
        <GlobalModuleSearch />
        <NotificationButton />
      </div>
    </header>
  );
}
