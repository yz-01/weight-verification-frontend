/**
 * The field phone's last signed-in account, for opening the app offline (H12).
 *
 * 「用户首次联网进入后，即使断网、关闭页面再重新打开，也必须能够进入已缓存的
 * 手机端」. The service worker can bring the app's page back without a network
 * (`public/sw.js`), but the app then asks the server who is signed in - and
 * with no answer it stopped at "cannot reach the server". So the phone keeps
 * the last answer and uses it only when the network is down; the next answer
 * from the server replaces it.
 *
 * The account as the screen shows it - name, project, permissions - and never
 * a token: the session's own tokens stay where they always were
 * (`lib/auth-token`), and this is forgotten with them.
 */
import type { Paginated } from "@/interfaces/api";
import type { CurrentUser } from "@/interfaces/auth";
import type { Project } from "@/interfaces/contractor";

const KEY = "mse.field.last-user";
const PROJECTS_KEY = "mse.field.last-projects";

export function rememberFieldUser(user: CurrentUser): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    // Storage blocked or full: the app simply needs a network to open.
  }
}

export function lastFieldUser(): CurrentUser | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  } catch {
    return null;
  }
}

export function forgetFieldUser(): void {
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(PROJECTS_KEY);
  } catch {
    // Nothing to forget.
  }
}

/**
 * The projects that account last saw, kept the same way and for the same
 * reason (2026-11-14). Opened with no network, the phone knew who was signed
 * in but not their projects: the top of the screen said 「你的项目读取失败」
 * in red, and a worker on two projects could not choose one, so nothing could
 * be recorded for later. With the list kept, the forms work offline as the
 * offline line at the top says they do.
 *
 * Kept under the account's id, so a phone that changes hands never offers the
 * last person's projects; forgotten with the account (`forgetFieldUser`).
 */
export function rememberFieldProjects(userId: string, projects: Paginated<Project>): void {
  try {
    window.localStorage.setItem(PROJECTS_KEY, JSON.stringify({ userId, projects }));
  } catch {
    // Storage blocked or full: the project list simply needs a network.
  }
}

export function lastFieldProjects(userId: string): Paginated<Project> | null {
  try {
    const raw = window.localStorage.getItem(PROJECTS_KEY);
    if (!raw) return null;
    const kept = JSON.parse(raw) as { userId?: string; projects?: Paginated<Project> };
    if (kept.userId !== userId || !Array.isArray(kept.projects?.results)) return null;
    return kept.projects;
  } catch {
    return null;
  }
}
