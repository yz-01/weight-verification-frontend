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

const ACCESS_KEY = "mse_access_token";
const REFRESH_KEY = "mse_refresh_token";

const isBrowser = () => typeof window !== "undefined";

export function getAccessToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setTokens(tokens: { access: string; refresh: string }): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(ACCESS_KEY, tokens.access);
  window.localStorage.setItem(REFRESH_KEY, tokens.refresh);
}

export function clearTokens(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
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
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}
