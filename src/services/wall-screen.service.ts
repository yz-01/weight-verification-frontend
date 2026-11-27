/**
 * 总部大屏 (JB291, 客户 11-27e).
 *
 * Signed in: `contractor-dashboard/get_wall_screen` and the slide weather,
 * plus 大屏展示设定 and the wall's own link (office, head office).
 *
 * A wall link (`/screen/<token>`): no session - these calls never carry the
 * office's login, even on a browser that has one; the token in the address is
 * the whole credential, as for the package link.
 */

import { ApiError } from "@/interfaces/api";
import type {
  WallScreenData,
  WallSettingRow,
  WallSettings,
  WallWeather,
} from "@/interfaces/wall-screen";
import { api } from "@/services/api-client";

export function getWallScreen(): Promise<WallScreenData> {
  // Quiet: a failed refresh keeps the last picture and says so in a corner.
  return api.get<WallScreenData>("/api/contractor-dashboard/get_wall_screen/", undefined, {
    silent: true,
  });
}

export async function getWallWeather(project: string): Promise<WallWeather | null> {
  const data = await api.get<{ weather: WallWeather | null }>(
    "/api/contractor-dashboard/get_wall_weather/",
    project ? { project } : undefined,
    { silent: true },
  );
  return data.weather;
}

export function getWallSettings(): Promise<WallSettings> {
  return api.get<WallSettings>("/api/contractor-dashboard/get_wall_settings/");
}

export function saveWallSettings(projects: WallSettingRow[]): Promise<WallSettings> {
  return api.post<WallSettings>("/api/contractor-dashboard/set_wall_settings/", {
    projects: projects.map(({ project, shown, photos, esg }) => ({ project, shown, photos, esg })),
  });
}

export function createWallLink(): Promise<WallSettings> {
  return api.post<WallSettings>("/api/contractor-dashboard/create_wall_link/", {});
}

export function revokeWallLink(): Promise<WallSettings> {
  return api.post<WallSettings>("/api/contractor-dashboard/revoke_wall_link/", {});
}

// ---- the wall link ----------------------------------------------------------

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

function linkUrl(token: string, path = "", query?: Record<string, string>) {
  const base = `${API_BASE_URL}/api/wall-screen/${encodeURIComponent(token)}/${path}`;
  const search = query ? new URLSearchParams(query).toString() : "";
  return search ? `${base}?${search}` : base;
}

async function linkFetch<T>(url: string): Promise<T> {
  let response: Response;
  try {
    // `omit`: never the office's cookies, whatever this browser holds.
    response = await fetch(url, { credentials: "omit", cache: "no-store" });
  } catch {
    throw new ApiError("network", 0, {}, "network_error");
  }
  let envelope: { success: boolean; data?: T; message?: string; code?: string };
  try {
    envelope = await response.json();
  } catch {
    envelope = { success: false };
  }
  if (!response.ok || !envelope.success || envelope.data === undefined) {
    throw new ApiError(envelope.message || "wall_link_failed", response.status, {}, envelope.code ?? "");
  }
  return envelope.data;
}

export function getWallLinkScreen(token: string): Promise<WallScreenData> {
  return linkFetch<WallScreenData>(linkUrl(token));
}

export async function getWallLinkWeather(token: string, project: string): Promise<WallWeather | null> {
  const data = await linkFetch<{ weather: WallWeather | null }>(
    linkUrl(token, "weather/", project ? { project } : undefined),
  );
  return data.weather;
}

/** The address a wall link opens, on this site. */
export function wallLinkAddress(token: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/screen/${encodeURIComponent(token)}`;
}
