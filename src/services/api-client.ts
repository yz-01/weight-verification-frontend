/**
 * The typed API client.
 *
 * Responsibilities, all of them here so no caller has to repeat them:
 *   - attach the bearer token
 *   - unwrap the response envelope
 *   - throw a typed `ApiError` on failure, never return one
 *   - refresh a expired access token once and replay the request
 *   - surface failures as a toast, since the design system forbids components
 *     from toasting themselves
 */

import { toast } from "sonner";

import {
  ApiError,
  type ApiEnvelope,
  type FieldError,
  type ListQuery,
  type Paginated,
} from "@/interfaces/api";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "@/lib/auth-token";
import { t } from "@/lib/i18n-runtime";

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

/** Endpoints that must not trigger a refresh-and-retry loop. */
const AUTH_ENDPOINTS = ["/api/auth/login/", "/api/auth/refresh_token/"];

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: Method;
  body?: unknown;
  query?: ListQuery;
  /** Suppress the automatic error toast when the caller renders its own. */
  silent?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: ListQuery): string {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Refresh state, shared across concurrent requests.
 *
 * A table page fires several requests at once. When the access token expires,
 * all of them get a 401 together. Without a single shared refresh, each would
 * rotate the refresh token independently and every rotation after the first
 * would hit an already-blacklisted token and sign the user out mid-session.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;

  const response = await fetch(buildUrl("/api/auth/refresh_token/"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });

  if (!response.ok) return false;

  const envelope = (await response.json()) as ApiEnvelope<{
    access: string;
    refresh: string;
  }>;
  if (!envelope.success) return false;

  setTokens(envelope.data);
  return true;
}

function ensureRefresh(): Promise<boolean> {
  if (refreshInFlight === null) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function endSession(): void {
  clearTokens();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    toast.error(t("auth.sessionExpired"));
    window.location.href = "/login";
  }
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const { method = "GET", body, query, signal } = options;
  const headers: Record<string, string> = {};

  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    // Let the browser set the multipart boundary. Setting Content-Type here
    // would produce a header with no boundary and the upload would fail.
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  return fetch(buildUrl(path, query), { method, headers, body: payload, signal });
}

async function parseEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  try {
    return (await response.json()) as ApiEnvelope<T>;
  } catch {
    // A gateway timeout or a proxy error page: not JSON, but still a failure
    // the caller has to see as one.
    return {
      success: false,
      message: t("errors.generic"),
      errors: {},
    };
  }
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await send(path, options);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    const failure = new ApiError(t("errors.network"), 0);
    if (!options.silent) toast.error(failure.message);
    throw failure;
  }

  // One retry, and only for requests that are not themselves part of signing
  // in, or a failed login would try to refresh and bounce the user out.
  if (
    response.status === 401 &&
    !AUTH_ENDPOINTS.some((endpoint) => path.startsWith(endpoint))
  ) {
    const refreshed = await ensureRefresh();
    if (refreshed) {
      response = await send(path, options);
    } else {
      endSession();
      throw new ApiError(t("auth.sessionExpired"), 401);
    }
  }

  const envelope = await parseEnvelope<T>(response);

  if (!response.ok || !envelope.success) {
    const code = envelope.success ? "" : (envelope.code ?? "");
    const errors = envelope.success ? {} : translateFieldErrors(envelope.errors);
    const message = resolveMessage(
      code,
      envelope.success ? "" : envelope.message,
    );
    const failure = new ApiError(message, response.status, errors, code);

    if (response.status === 401) {
      endSession();
    } else if (!options.silent) {
      toast.error(message);
    }
    throw failure;
  }

  return envelope.data;
}

/**
 * Word a failure in the reader's language.
 *
 * The backend names the failure with a code; the catalogue words it. A code
 * with no translation falls back to the server's English, which is wrong but
 * readable, and better than showing a raw identifier. That gap is what the
 * backend's error-code test exists to prevent.
 */
function resolveMessage(code: string, serverMessage: string): string {
  if (code) {
    const key = `errors.api.${code}`;
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return serverMessage || t("errors.generic");
}

/**
 * Word each field's failure, keeping only the first per field.
 *
 * A form shows one message under an input, so the rest would never be read.
 * Accepts the older shape of plain strings too, in case an endpoint has not
 * been moved onto `serialize_errors` yet.
 */
function translateFieldErrors(
  errors: Record<string, FieldError[] | string[] | string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [field, value] of Object.entries(errors)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first === undefined) continue;
    if (typeof first === "string") {
      result[field] = first;
    } else {
      const key = `errors.field.${first.code}`;
      const translated = t(key);
      result[field] = translated === key ? first.message : translated;
    }
  }
  return result;
}

/** Convenience wrappers. */
export const api = {
  get: <T>(path: string, query?: ListQuery, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "GET", query }),

  list: <T>(path: string, query?: ListQuery, options?: RequestOptions) =>
    request<Paginated<T>>(path, { ...options, method: "GET", query }),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body }),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),

  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "DELETE" }),
};

/** Toast a success message. Services call this; components never do. */
export function toastSuccess(messageKey: string, values?: Record<string, unknown>): void {
  toast.success(t(messageKey, values));
}
