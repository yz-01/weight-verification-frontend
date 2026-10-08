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

/*
 * 顶栏「当前项目」 (B13, X14) for the office console: the project a user
 * chose once in the top bar, kept per user so a second person signing in on
 * the same browser does not inherit it, and kept across sign-ins so the
 * choice really is made once. Not sent as `X-MSE-Project`: that header is the
 * consultant's server-enforced scope; for everyone else the choice is only the
 * pages' default, passed as their ordinary `project` parameter.
 */
const CURRENT_PROJECT_KEY = "mse_current_project";

/** The stored value for 「全部项目」. */
export const ALL_PROJECTS_CHOICE = "all";

export function getCurrentProjectChoice(userId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(`${CURRENT_PROJECT_KEY}.${userId}`);
  } catch {
    return null;
  }
}

export function setCurrentProjectChoice(userId: string, choice: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${CURRENT_PROJECT_KEY}.${userId}`, choice);
  } catch {
    // A browser that refuses storage still gets the choice for this visit.
  }
}
