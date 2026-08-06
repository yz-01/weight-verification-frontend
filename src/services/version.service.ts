/** Version management service (module 11). */

import { api, toastSuccess } from "@/services/api-client";

export interface AppVersion {
  id: string;
  version: string;
  release_name: string;
  release_notes: string;
  released_on: string;
  is_current: boolean;
  force_update: boolean;
  min_supported_version: string;
  rollout_percentage: number;
  is_active: boolean;
  changelog_count: number;
}

export interface VersionChangeLog {
  id: string;
  module: string;
  change_type: string;
  description: string;
  sort_order: number;
}

export interface VersionDetail extends AppVersion {
  release_notes_zh: string;
  release_notes_ms: string;
  changelog: VersionChangeLog[];
}

export interface CreateVersionPayload {
  version: string;
  release_name?: string;
  release_notes: string;
  release_notes_zh?: string;
  release_notes_ms?: string;
  released_on: string;
  min_supported_version?: string;
  force_update?: boolean;
  rollout_percentage?: number;
  is_active?: boolean;
}

export function getVersions(): Promise<AppVersion[]> {
  return api.get<AppVersion[]>("/api/versions/get_versions/");
}

export function getCurrentVersion(): Promise<VersionDetail> {
  return api.get<VersionDetail>("/api/versions/get_current_version/");
}

export function getVersion(id: string): Promise<VersionDetail> {
  return api.get<VersionDetail>(`/api/versions/get_version/${id}/`);
}

export async function createVersion(
  payload: CreateVersionPayload,
): Promise<AppVersion> {
  const v = await api.post<AppVersion>("/api/versions/create_version/", payload);
  toastSuccess("versions.toast.created");
  return v;
}

export async function updateVersion(
  id: string,
  payload: Partial<CreateVersionPayload>,
): Promise<AppVersion> {
  const v = await api.patch<AppVersion>(
    `/api/versions/update_version/${id}/`,
    payload,
  );
  toastSuccess("versions.toast.updated");
  return v;
}

export async function setCurrentVersion(id: string): Promise<AppVersion> {
  const v = await api.post<AppVersion>(
    `/api/versions/set_current/${id}/`,
  );
  toastSuccess("versions.toast.setCurrent");
  return v;
}

export async function addChangelog(
  id: string,
  payload: Omit<VersionChangeLog, "id">,
): Promise<VersionChangeLog> {
  const c = await api.post<VersionChangeLog>(
    `/api/versions/add_changelog/${id}/`,
    payload,
  );
  toastSuccess("versions.toast.changelogAdded");
  return c;
}
