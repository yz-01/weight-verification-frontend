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
  getSessionPortal,
  isDriverSessionContext,
  isFieldSessionContext,
  setTokens,
} from "@/lib/auth-token";
import { portalLoginPath } from "@/lib/portal";
import { t } from "@/lib/i18n-runtime";
import { getActiveProjectId } from "@/lib/project-context";

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

/** Endpoints that must not trigger a refresh-and-retry loop. */
/**
 * Endpoints that exchange a credential for a session.
 *
 * A 401 from one of these means the credential was wrong, not that a session
 * expired - there was no session. Treating them alike signs the visitor out
 * of a session they never had and sends them to whichever login the browser
 * last remembered, which for a first-time visitor is none of the three: a
 * person typing a password one character wrong on the admin entrance was
 * being thrown to the portal chooser with "your session has expired".
 */
const AUTH_ENDPOINTS = [
  "/api/auth/login/",
  "/api/auth/refresh_token/",
  "/api/field-access/field_login/",
  "/api/field-access/activate/",
  "/api/field-access/pwa_bootstrap/",
];

const isCredentialExchange = (path: string) =>
  AUTH_ENDPOINTS.some((endpoint) => path.startsWith(endpoint));

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: Method;
  body?: unknown;
  query?: ListQuery;
  /** Suppress the automatic error toast when the caller renders its own. */
  silent?: boolean;
  /** Skip a previous bearer session for public credential exchanges. */
  auth?: boolean;
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
  const portal = getSessionPortal();
  clearTokens();
  const loginPath = isFieldSessionContext()
    ? "/trace/field-login"
    : isDriverSessionContext()
      ? "/scrap/login"
      : portalLoginPath(portal);
  if (typeof window !== "undefined" && window.location.pathname !== loginPath) {
    toast.error(t("auth.sessionExpired"));
    window.location.href = loginPath;
  }
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const { method = "GET", body, query, signal, auth = true } = options;
  const headers: Record<string, string> = {};

  if (auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const projectId = getActiveProjectId();
    if (projectId) headers["X-MSE-Project"] = projectId;
  }

  let payload: BodyInit | undefined;
  const offlineCreatedAt = currentOfflineCreatedAt;
  if (body instanceof FormData) {
    if (offlineCreatedAt && !body.has("offline_created_at")) {
      body.append("offline_created_at", offlineCreatedAt);
    }
    // Let the browser set the multipart boundary. Setting Content-Type here
    // would produce a header with no boundary and the upload would fail.
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    const stamped =
      offlineCreatedAt && body !== null && typeof body === "object" && !Array.isArray(body)
        ? { offline_created_at: offlineCreatedAt, ...(body as object) }
        : body;
    payload = JSON.stringify(stamped);
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
    options.auth !== false &&
    !isCredentialExchange(path)
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
      envelope.success ? undefined : envelope.values,
    );
    const failure = new ApiError(message, response.status, errors, code);

    // The same exemption as the retry above. It was missing here, so a
    // wrong password skipped the refresh correctly and was then signed out
    // anyway one block later - cleared tokens, "your session has expired",
    // and a hard navigation away from the entrance being typed into.
    if (
      response.status === 401 &&
      options.auth !== false &&
      !isCredentialExchange(path)
    ) {
      endSession();
    } else if (!options.silent) {
      toast.error(message);
    }
    throw failure;
  }

  return envelope.data;
}

/**
 * Fetch a file and hand it to the browser.
 *
 * Downloads cannot be a plain link. The API is a separate origin authenticated
 * with a bearer token, so the browser has nothing to send on a navigation —
 * an `<a href>` would arrive unauthenticated. The file is fetched like any
 * other request, then handed over as a blob.
 *
 * On failure the response is JSON, not a file, so it is unwrapped through the
 * same envelope path as everything else and reaches the caller as an
 * `ApiError` worded in the reader's language.
 */
export async function download(
  path: string,
  options: RequestOptions & { fallbackFilename: string; openInNewTab?: boolean },
): Promise<void> {
  let response: Response;
  try {
    response = await send(path, options);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    const failure = new ApiError(t("errors.network"), 0);
    toast.error(failure.message);
    throw failure;
  }

  if (response.status === 401) {
    const refreshed = await ensureRefresh();
    if (refreshed) {
      response = await send(path, options);
    } else {
      endSession();
      throw new ApiError(t("auth.sessionExpired"), 401);
    }
  }

  if (!response.ok) {
    const envelope = await parseEnvelope<never>(response);
    const code = envelope.success ? "" : (envelope.code ?? "");
    const message = resolveMessage(
      code,
      envelope.success ? "" : envelope.message,
      envelope.success ? undefined : envelope.values,
    );
    toast.error(message);
    throw new ApiError(message, response.status, {}, code);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  if (options.openInNewTab) {
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    filenameFromDisposition(response.headers.get("Content-Disposition")) ??
    options.fallbackFilename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers, which is
  // why this waits a tick rather than running on the next line.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Read the server's filename out of `Content-Disposition`.
 *
 * Prefers `filename*`, which is the RFC 5987 form and the only one that
 * survives a Chinese or Malay report title intact.
 */
function filenameFromDisposition(header: string | null): string | undefined {
  if (!header) return undefined;

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // A malformed header is not worth failing a download over.
    }
  }

  const plain = /filename="([^"]+)"/i.exec(header);
  return plain?.[1];
}

/**
 * Word a failure in the reader's language.
 *
 * The backend names the failure with a code; the catalogue words it. A code
 * with no translation falls back to the server's English, which is wrong but
 * readable, and better than showing a raw identifier. That gap is what the
 * backend's error-code test exists to prevent.
 */
function resolveMessage(
  code: string,
  serverMessage: string,
  values?: Record<string, string | number>,
): string {
  if (code) {
    const key = `errors.api.${code}`;
    try {
      const translated = t(key, values);
      if (translated !== key) return translated;
    } catch {
      // A catalogue entry that expects a value it was not given. Falling
      // through to the server's own sentence keeps the reason on screen
      // instead of printing the key path at the reader.
    }
  }
  return serverMessage || t("errors.generic");
}

/**
 * DRF codes whose catalogue wording replaces the server's sentence.
 *
 * These are failures of a field's *shape*, and the server's English for them
 * is boilerplate it generated itself — "This field is required." carries
 * nothing the reader's own language would not carry better.
 *
 * `invalid` is deliberately not here, and it is the important one. DRF uses it
 * as the catch-all for every hand-written `ValidationError("...")` in the
 * backend, and those sentences are the only place the reason lives: which
 * driver, which trip already has them, what to do about it. Wording them from
 * the catalogue replaced all of it with "This value is not valid" under the
 * field — which is what a dispatcher saw while trying to work out why the
 * lorry would not go out.
 */
const CATALOGUE_WINS = new Set([
  "required",
  "blank",
  "null",
  "unique",
  "max_length",
  "min_length",
  "max_value",
  "min_value",
  "invalid_choice",
  "does_not_exist",
]);

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
      continue;
    }

    const key = `errors.field.${first.code}`;
    const translated = t(key);
    const catalogue = translated === key ? "" : translated;

    // Outside the structural set the server's sentence is the specific one, so
    // it wins; the catalogue stays as the fallback for a failure that arrived
    // with no message at all.
    result[field] = CATALOGUE_WINS.has(first.code)
      ? catalogue || first.message
      : first.message || catalogue;
  }
  return result;
}

/**
 * The offline queue's provenance stamp, in force for the current replay.
 *
 * A record created on a device and uploaded hours later, and one typed in
 * minutes ago about that morning, arrive at the server looking identical —
 * same occurrence time, same upload time. The queue has always known which is
 * which; this is what carries that knowledge across.
 *
 * Ambient rather than a parameter because the replay reaches the server through
 * fourteen different service functions, several of which build their own
 * FormData. Threading an argument through all of them would leave a new offline
 * path silently unstamped the day it is added, which is exactly the failure
 * this is fixing. The replay loop is strictly sequential — one job is awaited
 * before the next begins — so there is no request this could attach to by
 * accident.
 */
let currentOfflineCreatedAt: string | null = null;

export async function withOfflineProvenance<T>(
  createdAt: string,
  run: () => Promise<T>,
): Promise<T> {
  const previous = currentOfflineCreatedAt;
  currentOfflineCreatedAt = createdAt;
  try {
    return await run();
  } finally {
    currentOfflineCreatedAt = previous;
  }
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
