/**
 * The platform's own state, read without signing in (JB211, Lucas 11-16
 * 「把它们真的做出来」): the 11.2.11 维护 notice, MSE's 11.2.1 联络资料, and
 * whether this build is still allowed under 11.2.9 强制更新.
 *
 * Both calls go without the session (`auth: false`): the sign-in page asks
 * them before anybody signs in, and during maintenance a customer's session
 * would only be answered 「系统维护中」.
 */

import type { Branding } from "@/interfaces/auth";
import type { PlatformStatus } from "@/lib/platform-status";
import { api } from "@/services/api-client";

export async function getPlatformStatus(): Promise<PlatformStatus> {
  const branding = await api.get<Branding>("/api/branding/", undefined, {
    auth: false,
    silent: true,
  });
  return {
    maintenance: branding.maintenance ?? null,
    contact: branding.contact ?? null,
  };
}

export interface ClientVersionCheck {
  update_required: boolean;
  current_version: string | null;
  min_supported_version?: string;
}

export function checkClientVersion(version: string): Promise<ClientVersionCheck> {
  return api.get<ClientVersionCheck>(
    "/api/versions/check_client_version/",
    { version },
    { auth: false, silent: true },
  );
}
