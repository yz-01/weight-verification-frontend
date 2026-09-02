import type {
  Announcement,
  AnnouncementInput,
  AnnouncementPublishResult,
  CompanyPlatformConfigCatalogue,
  FeatureFlagRow,
  PlatformConfigCatalogue,
} from "@/interfaces/platform-settings";
import type { Branding } from "@/interfaces/auth";
import { api, toastSuccess } from "@/services/api-client";

export function getPlatformConfigCatalogue(): Promise<PlatformConfigCatalogue> {
  return api.get("/api/platform-config/get_config_catalogue/");
}

export async function setPlatformConfig(input: {
  key: string;
  value: unknown;
}): Promise<{ key: string; created: boolean }> {
  const result = await api.post<{ key: string; created: boolean }>(
    "/api/platform-config/set_config/",
    input,
  );
  toastSuccess("adminSystemSettings.toast.saved");
  return result;
}

export async function uploadPlatformBranding(icon: File): Promise<Branding> {
  const body = new FormData();
  body.append("icon", icon);
  const result = await api.post<Branding>(
    "/api/platform-config/upload_branding/",
    body,
  );
  toastSuccess("adminSystemSettings.toast.brandingSaved");
  return result;
}

export function getCompanyPlatformConfigCatalogue(
  company: string,
): Promise<CompanyPlatformConfigCatalogue> {
  return api.get("/api/platform-config/get_company_config_catalogue/", {
    company,
  });
}

export async function setCompanyPlatformConfig(input: {
  company: string;
  key: string;
  value: unknown;
}): Promise<{ key: string; company: string; created: boolean }> {
  const result = await api.post<{
    key: string;
    company: string;
    created: boolean;
  }>("/api/platform-config/set_company_config/", input);
  toastSuccess("adminSystemSettings.toast.companySaved");
  return result;
}

export async function resetCompanyPlatformConfig(input: {
  company: string;
  key: string;
}): Promise<void> {
  await api.post("/api/platform-config/reset_company_config/", input);
  toastSuccess("adminSystemSettings.toast.companyReset");
}

export function getFeatureFlags(): Promise<FeatureFlagRow[]> {
  return api.get("/api/feature-flags/get_flags/");
}

export async function setFeatureFlag(
  input: FeatureFlagRow,
): Promise<{ key: string }> {
  const result = await api.post<{ key: string }>(
    "/api/feature-flags/set_flag/",
    input,
  );
  toastSuccess("adminSystemSettings.toast.saved");
  return result;
}

/**
 * Platform announcements.
 *
 * 系统公告 is written here and read in every portal's notification list.
 * Creating or updating one publishes it: the API answers with how many
 * notifications it delivered, which is the only honest confirmation that the
 * announcement reached anybody.
 */
export function getAnnouncements(params?: {
  level?: string;
}): Promise<Announcement[]> {
  return api.get("/api/announcements/get_announcements/", params);
}

export async function createAnnouncement(
  input: AnnouncementInput,
): Promise<AnnouncementPublishResult> {
  const result = await api.post<AnnouncementPublishResult>(
    "/api/announcements/create_announcement/",
    input,
  );
  toastSuccess("adminSystemSettings.announcements.toast.published");
  return result;
}

export async function updateAnnouncement(
  id: string,
  input: Partial<AnnouncementInput>,
): Promise<AnnouncementPublishResult> {
  const result = await api.patch<AnnouncementPublishResult>(
    `/api/announcements/update_announcement/${id}/`,
    input,
  );
  toastSuccess("adminSystemSettings.announcements.toast.saved");
  return result;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await api.delete(`/api/announcements/delete_announcement/${id}/`);
  toastSuccess("adminSystemSettings.announcements.toast.removed");
}
