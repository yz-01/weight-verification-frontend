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
import type { CurrentUser } from "@/interfaces/auth";

const KEY = "mse.field.last-user";

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
  } catch {
    // Nothing to forget.
  }
}
