import type {
  FeatureFlagRow,
  PlatformConfigCatalogue,
} from "@/interfaces/platform-settings";
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
