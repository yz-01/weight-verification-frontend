import type { Portal } from "@/interfaces/auth";

const PORTAL_PATHS: Record<Portal, { login: string; forgot: string; reset: string }> = {
  MSE_ADMIN: {
    login: "/admin/login",
    forgot: "/admin/forgot-password",
    reset: "/admin/reset-password",
  },
  MSE_TRACE: {
    login: "/trace/login",
    forgot: "/trace/forgot-password",
    reset: "/trace/reset-password",
  },
  MSE_SCRAP: {
    login: "/scrap/login",
    forgot: "/scrap/forgot-password",
    reset: "/scrap/reset-password",
  },
};

export const PORTAL_LABELS: Record<Portal, string> = {
  MSE_ADMIN: "MSE Admin",
  MSE_TRACE: "MSE Trace",
  MSE_SCRAP: "MSE Scrap",
};

export function portalPaths(portal: Portal) {
  return PORTAL_PATHS[portal];
}

export function portalLoginPath(portal: Portal | null | undefined): string {
  return portal ? PORTAL_PATHS[portal].login : "/login";
}
