"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Maximize } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { WallControl, WallScreen, type WallSource } from "@/components/dashboard/wall-screen";
import { WallSettingsButton } from "@/components/dashboard/wall-settings";
import { useAuth } from "@/components/providers/auth-provider";
import { ApiError } from "@/interfaces/api";
import { getSessionPortal } from "@/lib/auth-token";
import { portalLoginPath, redirectWithFallback } from "@/lib/portal";
import {
  getWallLinkScreen,
  getWallLinkWeather,
  getWallScreen,
  getWallWeather,
} from "@/services/wall-screen.service";

/** The page address of the signed-in wall (its own tab, outside the console). */
export const WALL_PATH = "/wall";

const WALL_KEY = ["wall-screen", "session"] as const;

/**
 * 总部大屏 for a signed-in head office (JB291, 客户 11-27e), at `/wall`.
 *
 * 四 「后台与大屏独立运行」: the page is its own tab, outside the office console
 * - no sidebar, top-bar project, live stream or bell behind it - so a
 * colleague switching projects, approving, editing or reading reports, in
 * this browser or anywhere else, never touches it. It reads only the wall's
 * own endpoint and keeps its own loop (`WallScreen`). The session renews
 * itself while the wall polls, so it does not sign itself out over a day.
 *
 * Head office (公司设置's manage right) has 【大屏展示设定】 among the corner
 * buttons; Esc or 【退出大屏】 goes to the 公司总部 dashboard.
 */
export function HeadquartersWall() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("headquarters.wall");
  const { user, can, isLoading } = useAuth();
  const allowed = user?.portal === "MSE_TRACE" && !user.is_field_staff && can("dashboard.view");
  const manages = allowed && can("company_settings.manage");

  useEffect(() => {
    if (isLoading) return;
    if (user === null) {
      redirectWithFallback(router, portalLoginPath(getSessionPortal()));
      return;
    }
    // Someone without the company view is sent to the dashboard they have.
    if (user && !allowed) router.replace("/dashboard");
  }, [allowed, isLoading, router, user]);

  // Esc leaves (not while a dialog is open, nor out of full screen, which the
  // browser's own Esc ends first).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.fullscreenElement) return;
      if (document.querySelector("[role=dialog]")) return;
      router.push("/dashboard");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const source = useMemo<WallSource>(
    () => ({ queryKey: WALL_KEY, load: getWallScreen, weather: getWallWeather }),
    [],
  );
  if (!allowed) return null;
  return (
    <WallScreen
      source={source}
      controls={
        <>
          {manages && (
            <WallSettingsButton onSaved={() => void queryClient.invalidateQueries({ queryKey: WALL_KEY })} />
          )}
          <WallControl onClick={() => router.push("/dashboard")} data-wall-exit>
            <LogOut className="size-[1.4rem]" aria-hidden />
            {t("exit")}
          </WallControl>
        </>
      }
    />
  );
}

/**
 * 总部大屏 on a screen nobody signs in on (`/screen/<token>`): the wall and
 * nothing else - no back office behind it, no buttons but 全屏. A link that
 * was ended says so in plain words.
 */
export function WallLinkScreen({ token }: { token: string }) {
  const t = useTranslations("jb291");
  const source = useMemo<WallSource>(
    () => ({
      queryKey: ["wall-screen", "link", token],
      load: () => getWallLinkScreen(token),
      weather: (project: string) => getWallLinkWeather(token, project),
      failure: (error) => (error instanceof ApiError && error.status === 404 ? t("linkGone") : null),
    }),
    [t, token],
  );
  return <WallScreen source={source} />;
}

/**
 * 【大屏模式】 on the 公司总部 dashboard: the wall opens in its own tab
 * (四: 「后台与大屏独立运行」), so the dashboard stays where it is.
 */
export function WallButton() {
  const t = useTranslations("headquarters.wall");
  return (
    <a
      href={WALL_PATH}
      target="_blank"
      rel="noopener"
      data-wall-open
      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary bg-(image:--primary-gradient) px-4 text-sm font-semibold text-primary-foreground shadow-glow hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11"
    >
      <Maximize className="size-4" aria-hidden />
      {t("open")}
    </a>
  );
}
