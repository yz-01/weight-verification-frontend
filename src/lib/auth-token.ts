/**
 * Where the session lives on the client.
 *
 * The API is a separate origin that authenticates with bearer tokens, so the
 * browser has to hold them. That trades XSS exposure for a much simpler
 * architecture than a same-origin BFF; the mitigation is a strict Content
 * Security Policy and a short access-token lifetime, both of which belong to
 * the hardening phase and are tracked there.
 *
 * Every read is guarded for the server: this module is imported by components
 * that also render during SSR, where `window` does not exist.
 */

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "@/i18n/config";
import type { Portal } from "@/interfaces/auth";

const ACCESS_KEY = "mse_access_token";
const REFRESH_KEY = "mse_refresh_token";
const FIELD_ACCESS_KEY = "mse_field_access_token";
const FIELD_REFRESH_KEY = "mse_field_refresh_token";
const FIELD_APP_KEY = "mse_field_app_context";
const DRIVER_ACCESS_KEY = "mse_driver_access_token";
const DRIVER_REFRESH_KEY = "mse_driver_refresh_token";
const DRIVER_APP_KEY = "mse_driver_app_context";
const PORTAL_KEY = "mse_portal";
const SESSION_COOKIE = "mse_session";
const PORTAL_COOKIE = "mse_portal";

const isBrowser = () => typeof window !== "undefined";

export function isFieldSessionPath(pathname?: string): boolean {
  if (!isBrowser() && pathname === undefined) return false;
  const path = pathname ?? window.location.pathname;
  return (
    path === "/field-staff" ||
    path.startsWith("/field-staff/") ||
    path === "/trace/field-activate" ||
    path === "/trace/field-login" ||
    path === "/trace/field-ready" ||
    path === "/field-pwa-bootstrap"
  );
}

export function isDriverSessionPath(pathname?: string): boolean {
  if (!isBrowser() && pathname === undefined) return false;
  const path = pathname ?? window.location.pathname;
  return path === "/driver" || path.startsWith("/driver/");
}

export function isStandaloneApp(): boolean {
  if (!isBrowser()) return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

export function markFieldAppContext(): void {
  if (isBrowser() && isStandaloneApp()) {
    window.localStorage.setItem(FIELD_APP_KEY, "1");
  }
}

export function isFieldStandaloneApp(): boolean {
  return (
    isStandaloneApp() && window.localStorage.getItem(FIELD_APP_KEY) === "1"
  );
}

export function markDriverAppContext(): void {
  if (isBrowser() && isStandaloneApp()) {
    window.localStorage.setItem(DRIVER_APP_KEY, "1");
  }
}

export function isDriverStandaloneApp(): boolean {
  return (
    isStandaloneApp() && window.localStorage.getItem(DRIVER_APP_KEY) === "1"
  );
}

export function isFieldSessionContext(pathname?: string): boolean {
  return isFieldSessionPath(pathname) || isFieldStandaloneApp();
}

export function isDriverSessionContext(pathname?: string): boolean {
  return isDriverSessionPath(pathname) || isDriverStandaloneApp();
}

function tokenKeys() {
  if (isFieldSessionContext()) {
    migrateLegacyFieldSession();
    return { access: FIELD_ACCESS_KEY, refresh: FIELD_REFRESH_KEY };
  }
  if (isDriverSessionContext()) {
    return { access: DRIVER_ACCESS_KEY, refresh: DRIVER_REFRESH_KEY };
  }
  return { access: ACCESS_KEY, refresh: REFRESH_KEY };
}

function migrateLegacyFieldSession(): void {
  if (!isBrowser() || window.localStorage.getItem(FIELD_ACCESS_KEY)) return;
  const access = window.localStorage.getItem(ACCESS_KEY);
  const refresh = window.localStorage.getItem(REFRESH_KEY);
  if (!isFieldDeviceToken(access) || !isFieldDeviceToken(refresh)) return;
  window.localStorage.setItem(FIELD_ACCESS_KEY, access);
  window.localStorage.setItem(FIELD_REFRESH_KEY, refresh);
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

function isFieldDeviceToken(token: string | null): token is string {
  if (!token) return false;
  try {
    const payload = token.split(".")[1];
    if (!payload) return false;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(
      window.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    ) as { session_kind?: string; device?: string };
    return decoded.session_kind === "FIELD_DEVICE" && Boolean(decoded.device);
  } catch {
    return false;
  }
}

export function getAccessToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(tokenKeys().access);
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(tokenKeys().refresh);
}

export function setTokens(tokens: { access: string; refresh: string }): void {
  if (!isBrowser()) return;
  const keys = tokenKeys();
  window.localStorage.setItem(keys.access, tokens.access);
  window.localStorage.setItem(keys.refresh, tokens.refresh);
  setCookie(SESSION_COOKIE, "1", 60 * 60 * 24 * 90);
}

export function clearTokens(): void {
  if (!isBrowser()) return;
  const keys = tokenKeys();
  window.localStorage.removeItem(keys.access);
  window.localStorage.removeItem(keys.refresh);
  if (
    window.localStorage.getItem(ACCESS_KEY) === null &&
    window.localStorage.getItem(FIELD_ACCESS_KEY) === null &&
    window.localStorage.getItem(DRIVER_ACCESS_KEY) === null
  ) {
    deleteCookie(SESSION_COOKIE);
  }
}

export function setFieldTokens(tokens: { access: string; refresh: string }): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(FIELD_ACCESS_KEY, tokens.access);
  window.localStorage.setItem(FIELD_REFRESH_KEY, tokens.refresh);
  setCookie(SESSION_COOKIE, "1", 60 * 60 * 24 * 90);
}

export function clearFieldTokens(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(FIELD_ACCESS_KEY);
  window.localStorage.removeItem(FIELD_REFRESH_KEY);
  if (
    window.localStorage.getItem(ACCESS_KEY) === null &&
    window.localStorage.getItem(DRIVER_ACCESS_KEY) === null
  ) {
    deleteCookie(SESSION_COOKIE);
  }
}

export function setDriverTokens(tokens: { access: string; refresh: string }): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(DRIVER_ACCESS_KEY, tokens.access);
  window.localStorage.setItem(DRIVER_REFRESH_KEY, tokens.refresh);
  setCookie(SESSION_COOKIE, "1", 60 * 60 * 24 * 90);
}

export function clearDriverTokens(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(DRIVER_ACCESS_KEY);
  window.localStorage.removeItem(DRIVER_REFRESH_KEY);
  if (
    window.localStorage.getItem(ACCESS_KEY) === null &&
    window.localStorage.getItem(FIELD_ACCESS_KEY) === null &&
    window.localStorage.getItem(DRIVER_ACCESS_KEY) === null
  ) {
    deleteCookie(SESSION_COOKIE);
  }
}

export function hasDriverSession(): boolean {
  if (!isBrowser()) return false;
  return window.localStorage.getItem(DRIVER_ACCESS_KEY) !== null;
}

export function hasFieldSession(): boolean {
  if (!isBrowser()) return false;
  return window.localStorage.getItem(FIELD_ACCESS_KEY) !== null;
}

/**
 * Keep the portal separately from the credentials so an expired session can
 * return to the same branded sign-in screen after its tokens are removed.
 */
export function getSessionPortal(): Portal | null {
  if (!isBrowser()) return null;
  const portal = window.localStorage.getItem(PORTAL_KEY) ?? getCookie(PORTAL_COOKIE);
  return portal === "MSE_ADMIN" || portal === "MSE_TRACE" || portal === "MSE_SCRAP"
    ? portal
    : null;
}

export function setSessionPortal(portal: Portal): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(PORTAL_KEY, portal);
  setCookie(PORTAL_COOKIE, portal, 60 * 60 * 24 * 365);
}

export function clearSession(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(FIELD_ACCESS_KEY);
  window.localStorage.removeItem(FIELD_REFRESH_KEY);
  window.localStorage.removeItem(DRIVER_ACCESS_KEY);
  window.localStorage.removeItem(DRIVER_REFRESH_KEY);
  deleteCookie(SESSION_COOKIE);
  window.localStorage.removeItem(PORTAL_KEY);
  deleteCookie(PORTAL_COOKIE);
}

export function hasSession(): boolean {
  return getAccessToken() !== null;
}

/**
 * Mirror the account's language into a cookie.
 *
 * The account is the source of truth, but the server renders the first paint
 * before it can load the account, so it reads this cookie instead. Refreshed
 * on every sign-in and whenever the user changes their language.
 */
export function setLocaleCookie(locale: Locale): void {
  if (!isBrowser()) return;
  setCookie(LOCALE_COOKIE, locale, LOCALE_COOKIE_MAX_AGE);
}

function getCookie(name: string): string | null {
  const prefix = `${name}=`;
  return (
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
}

function setCookie(name: string, value: string, maxAge: number): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

function deleteCookie(name: string): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax${secure}`;
}
