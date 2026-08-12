import { isFieldSessionContext } from "@/lib/auth-token";

const ACTIVE_PROJECT_KEY = "mse_active_project";
const FIELD_ACTIVE_PROJECT_KEY = "mse_field_active_project";

function activeProjectKey(): string {
  return isFieldSessionContext()
    ? FIELD_ACTIVE_PROJECT_KEY
    : ACTIVE_PROJECT_KEY;
}

export function getActiveProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(activeProjectKey());
}

export function setActiveProjectId(projectId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(activeProjectKey(), projectId);
}

export function clearActiveProjectId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(activeProjectKey());
}
