/**
 * 系统维护 and 强制更新 as the screen sees them (JB211, Lucas 11-16
 * 「把它们真的做出来」).
 *
 * The server keeps a customer account out with one of two answers, on any
 * request: 503 `platform_maintenance` (11.2.11 维护模式, or 服务可用 off) or 426
 * `client_update_required` (this build is older than 最低支持版本 while 强制更新
 * is on). Neither is a sign-out: the session stays, and the same page carries
 * on once the reason is gone. `api-client` reports the answer here and the
 * one full-screen notice (`PlatformGateOverlay`) shows it - the page under it
 * keeps its tokens and its unsent records.
 */

export const PLATFORM_MAINTENANCE = "platform_maintenance";
export const CLIENT_UPDATE_REQUIRED = "client_update_required";

export type PlatformGate = "maintenance" | "update";

/** Which notice a refused request calls for, or null for an ordinary refusal. */
export function gateForRefusal(status: number, code: string): PlatformGate | null {
  if (code === PLATFORM_MAINTENANCE && status === 503) return "maintenance";
  if (code === CLIENT_UPDATE_REQUIRED || status === 426) return "update";
  return null;
}

let current: PlatformGate | null = null;
const listeners = new Set<() => void>();

function publish(next: PlatformGate | null) {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

/**
 * Show the notice. Maintenance wins over an update: while the system is down a
 * reload would only meet the maintenance notice again.
 */
export function reportPlatformGate(gate: PlatformGate): void {
  if (current === "maintenance" && gate === "update") return;
  publish(gate);
}

export function clearPlatformGate(): void {
  publish(null);
}

export function getPlatformGate(): PlatformGate | null {
  return current;
}

export function subscribePlatformGate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const UPDATE_RELOAD_KEY = "mse-update-reload";
/** A reload this recent that still met 「请重新载入」 means the deploy is not done. */
export const UPDATE_RELOAD_WINDOW_MS = 10 * 60_000;

/** Remember, for this tab, that 【重新载入】 was pressed on this build. */
export function rememberUpdateReload(version: string, now = Date.now()): void {
  try {
    window.sessionStorage.setItem(UPDATE_RELOAD_KEY, JSON.stringify({ version, at: now }));
  } catch {
    // A private window without storage: the notice simply never says 「几分钟后再试」.
  }
}

/**
 * Whether this same build was already reloaded for an update a moment ago.
 * Then the new build is not out yet, and the notice says to try again in a
 * few minutes instead of sending the person round the same loop.
 */
export function reloadedForUpdateRecently(version: string, now = Date.now()): boolean {
  try {
    const raw = window.sessionStorage.getItem(UPDATE_RELOAD_KEY);
    if (!raw) return false;
    const stored = JSON.parse(raw) as { version?: unknown; at?: unknown };
    return (
      stored.version === version &&
      typeof stored.at === "number" &&
      now - stored.at >= 0 &&
      now - stored.at < UPDATE_RELOAD_WINDOW_MS
    );
  } catch {
    return false;
  }
}
