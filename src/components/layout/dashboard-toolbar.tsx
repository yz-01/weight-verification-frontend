"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";

import { GlobalModuleSearch } from "@/components/layout/global-module-search";
import { PageSwitcher } from "@/components/layout/page-switcher";
import { usePageTitleOverride } from "@/components/layout/page-title-override";
import { NotificationButton } from "@/components/notifications/notification-button";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useCurrentNav } from "@/hooks/use-current-nav";
import { useQueryClient } from "@tanstack/react-query";
import { setActiveProjectId } from "@/lib/project-context";

export function DashboardToolbar() {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, refresh } = useAuth();
  const showBack = pathname !== "/dashboard";
  const current = useCurrentNav();

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-card/95 px-3 shadow-[0_1px_0_rgb(0_0_0/0.02)] backdrop-blur lg:px-5">
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
      {/* Where the reader is, in the menu's words (B02, 图7): the same bar
          and the same title in every console. */}
      {current && <PageTitle current={current} />}
      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
        <PageSwitcher />
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

function PageTitle({
  current,
}: {
  current: NonNullable<ReturnType<typeof useCurrentNav>>;
}) {
  const t = useTranslations();
  // The page's own, more precise name wins over its menu entry's (B14).
  const override = usePageTitleOverride();
  const Icon = current.item.icon;
  const entry = t(`nav.${current.item.labelKey}`);
  const page = override ?? (current.leaf ? t(current.leaf.labelKey) : null);
  const showPage = page !== null && page !== entry;
  return (
    <div className="flex min-w-0 shrink items-center gap-2 text-sm">
      <span className="hidden size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary sm:grid">
        <Icon className="size-4" />
      </span>
      <span
        className={
          showPage
            ? "hidden truncate font-medium text-muted-foreground md:inline"
            : "truncate font-semibold text-foreground"
        }
      >
        {entry}
      </span>
      {showPage && (
        <>
          <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground md:block" />
          <span className="truncate font-semibold text-foreground">{page}</span>
        </>
      )}
    </div>
  );
}
