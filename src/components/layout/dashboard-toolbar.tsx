"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { CurrentProjectPicker } from "@/components/layout/current-project-picker";
import { GlobalModuleSearch } from "@/components/layout/global-module-search";
import { PageSwitcher } from "@/components/layout/page-switcher";
import { ThemeMenu } from "@/components/layout/theme-choice";
import { usePageTitleOverride } from "@/components/layout/page-title-override";
import { NotificationButton } from "@/components/notifications/notification-button";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useCurrentNav } from "@/hooks/use-current-nav";
import { useQueryClient } from "@tanstack/react-query";
import { consultantProjectToAutoSelect } from "@/lib/consultant-project";
import { setActiveProjectId } from "@/lib/project-context";

export function DashboardToolbar() {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, refresh } = useAuth();
  const showBack = pathname !== "/dashboard";
  const current = useCurrentNav();

  const switchConsultantProject = async (projectId: string) => {
    setActiveProjectId(projectId);
    await queryClient.cancelQueries();
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== "auth",
    });
    await refresh();
    router.refresh();
  };

  // A consultant with one project is put on it without having to choose
  // (C2): otherwise 「待审批事项」 stays empty with an application waiting.
  // Tried once per project, so a server that still refuses it cannot loop.
  const autoSelect = consultantProjectToAutoSelect(user);
  const autoSelectTried = useRef<string | null>(null);
  useEffect(() => {
    if (!autoSelect || autoSelectTried.current === autoSelect) return;
    autoSelectTried.current = autoSelect;
    void switchConsultantProject(autoSelect);
    // Keyed on the project to select; the switch itself is stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelect]);

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border bg-background/85 px-2 backdrop-blur-md sm:px-4 lg:px-6">
      <SidebarTrigger className="size-10" />
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
        {/* Everyone else's 「当前项目」; the consultant's is the select below,
            which the server enforces (B13). */}
        <CurrentProjectPicker />
        {user?.account_type === "CONSULTANT" && (
          <select
            aria-label={t("consultantProject.label")}
            className="h-10 min-w-0 max-w-56 rounded-lg border border-input bg-card px-3 text-sm pointer-coarse:text-base"
            value={user.active_project?.project_id ?? ""}
            onChange={(event) => void switchConsultantProject(event.target.value)}
          >
            {/* Without this, an unselected box shows the first project as
                if it were the one in use, while every page is refused. */}
            {!user.active_project && (
              <option value="" disabled>
                {t("consultantProject.choose")}
              </option>
            )}
            {user.consultant_projects
              .filter((project) => project.is_current)
              .map((project) => (
                <option key={project.project_id} value={project.project_id}>
                  {project.project_code} - {project.project_name}
                </option>
              ))}
          </select>
        )}
        {/* B13: the global 「当前项目」 picker takes its place here, before the
            search, so the bar reads: where I am · which project · find · alerts. */}
        <GlobalModuleSearch />
        <ThemeMenu />
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
    <div className="flex min-w-0 shrink items-center gap-2 text-sm sm:text-base">
      <span className="hidden size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary shadow-glow-sm sm:grid">
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
