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
  FIELD_OFFICE_SIGN_OUTS,
  clearTokens,
  rememberFieldSignOutReason,
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
import { attachOriginalManifest, carriesOriginals, markOriginalsDeclared } from "@/lib/original-photos";
import {
  SIGN_OFF_CANCELLED,
  askSignOff,
  hasSignOffDialog,
  isSignOffRefusal,
  settleSignOff,
} from "@/lib/sign-off";

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
  /**
   * The six-digit sign-off PIN (I29), sent as `X-Sign-Off-PIN`. Usually left
   * out: a refusal asking for it opens the shared dialog and the request is
   * sent again with what was typed (`lib/sign-off`).
   */
  signOffPin?: string;
  /** Leave a sign-off refusal to the caller instead of the dialog. */
  noSignOffPrompt?: boolean;
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

/** Why the last renewal was refused, for the sign-in screen it ends on. */
let lastRefusalCode = "";

/**
 * How long renewing the session may take before it counts as no answer.
 *
 * The access token lasts 30 minutes, so a delivery typed in over a longer
 * stretch is sent, refused with 401, and renewed first. On a weak site signal
 * that renewal could hang with nothing to end it, and 提交 spun for good.
 */
export const REFRESH_TIMEOUT_MS = 30_000;

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
  try {
    const response = await fetch(buildUrl("/api/auth/refresh_token/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Another tab or window of this browser renewed with the same refresh
      // token a moment earlier: the server refused ours because it was just
      // rotated, and the new pair is already stored. That is a renewal.
      const stored = getRefreshToken();
      if (stored && stored !== refresh) return true;
      // Only the server saying no is a refusal. A 429 or a 5xx on waking the
      // phone (a deploy, a busy minute) is no answer: the session is kept and
      // asked about again later (Lucas 2026-10-22: signed out after a while).
      if (response.status === 401 || response.status === 403) {
        lastRefusalCode = await response
          .json()
          .then((body: { code?: unknown }) => (typeof body?.code === "string" ? body.code : ""))
          .catch(() => "");
        return false;
      }
      throw new Error("refresh_no_answer");
    }

    const envelope = (await response.json()) as ApiEnvelope<{
      access: string;
      refresh: string;
    }>;
    if (!envelope.success) return false;

    setTokens(envelope.data);
    return true;
  } catch {
    // No answer, or cut off at the limit. Not a refusal - the session may be
    // fine - so `request` reports it as no answer, and a queued record waits
    // for a better signal instead of being refused.
    throw new Error("refresh_no_answer");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Renew the session once for everybody who needs it.
 *
 * `usedAccess` is the access token the refused request carried. When the
 * stored one is already different, somebody renewed in the meantime (another
 * request here, or another tab), and the request is simply sent again: a
 * second renewal would present a refresh token that was just rotated. Across
 * tabs the renewal itself runs under a Web Lock where the browser has one.
 */
function ensureRefresh(usedAccess?: string | null): Promise<boolean> {
  if (refreshInFlight === null) {
    refreshInFlight = renewUnderLock(usedAccess).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function renewUnderLock(usedAccess?: string | null): Promise<boolean> {
  const renew = () => {
    const current = getAccessToken();
    if (usedAccess !== undefined && current && current !== usedAccess) {
      return Promise.resolve(true);
    }
    return refreshAccessToken();
  };
  const locks =
    typeof navigator === "undefined"
      ? undefined
      : (navigator as Navigator & { locks?: LockManager }).locks;
  if (locks?.request) {
    return locks.request("mse-session-refresh", renew) as unknown as Promise<boolean>;
  }
  return renew();
}

function endSession(): void {
  const portal = getSessionPortal();
  const reason = lastRefusalCode;
  lastRefusalCode = "";
  clearTokens();
  const loginPath = isFieldSessionContext()
    ? "/trace/field-login"
    : isDriverSessionContext()
      ? "/scrap/login"
      : portalLoginPath(portal);
  if (typeof window !== "undefined" && window.location.pathname !== loginPath) {
    // The office's new link or 停用 is said as such on the phone.
    const officeReason =
      isFieldSessionContext() && FIELD_OFFICE_SIGN_OUTS.includes(reason)
        ? resolveMessage(reason, "")
        : "";
    if (officeReason) rememberFieldSignOutReason(officeReason);
    toast.error(officeReason || t("auth.sessionExpired"));
    window.location.href = loginPath;
  }
}

/**
 * How long an upload may run before it counts as failed (A9).
 *
 * A file upload on a weak site signal could hang with no answer at all, and
 * the record sat on 「等待上传」 with nothing to say why. Two minutes is ample
 * for a few compressed photos on a poor 4G link; past that the request is
 * given up, reported as `timeout`, and the offline queue tries it again.
 * Only uploads (a FormData body) are timed: a plain read has its own retries
 * and no photo to push.
 *
 * That is the floor. A bigger body gets longer (P-phonefix): a 20 MB PDF on
 * a weak site link takes far more than two minutes, and cutting it off every
 * time meant it never arrived. See `uploadTimeoutMs`.
 */
export const UPLOAD_TIMEOUT_MS = 120_000;

/** The slowest link an upload is still given time for: ~0.5 Mbit/s. */
export const UPLOAD_SLOWEST_BYTES_PER_SECOND = 64 * 1024;

/** What the two minutes already cover: a few compressed photos. */
export const UPLOAD_BYTES_IN_FLOOR = 5 * 1024 * 1024;

/** No upload waits longer than this, however big. */
export const UPLOAD_TIMEOUT_MAX_MS = 30 * 60_000;

/** The bytes a multipart body will push: its files plus its text fields. */
export function formDataBytes(body: FormData): number {
  let bytes = 0;
  body.forEach((value) => {
    bytes += typeof value === "string" ? value.length : value.size;
  });
  return bytes;
}

/**
 * How long an upload of ``bytes`` may run: two minutes, plus the time what
 * is over ``UPLOAD_BYTES_IN_FLOOR`` needs at ``UPLOAD_SLOWEST_BYTES_PER_SECOND``,
 * never over ``UPLOAD_TIMEOUT_MAX_MS``. A few photos stay at two minutes.
 */
export function uploadTimeoutMs(bytes: number): number {
  const over = Math.max(bytes - UPLOAD_BYTES_IN_FLOOR, 0);
  const extra = Math.ceil((over / UPLOAD_SLOWEST_BYTES_PER_SECOND) * 1000);
  return Math.min(UPLOAD_TIMEOUT_MS + extra, UPLOAD_TIMEOUT_MAX_MS);
}

/** The reason an upload was cut off, told apart from a caller's own abort. */
class UploadTimeout extends Error {
  constructor() {
    super("upload_timeout");
    this.name = "UploadTimeout";
  }
}

async function fetchWithUploadTimeout(
  url: string,
  init: RequestInit,
  callerSignal: AbortSignal | undefined,
): Promise<Response> {
  const controller = new AbortController();
  const forward = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) forward();
  else callerSignal?.addEventListener("abort", forward, { once: true });
  const limit = init.body instanceof FormData ? uploadTimeoutMs(formDataBytes(init.body)) : UPLOAD_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(new UploadTimeout()), limit);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.reason instanceof UploadTimeout) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", forward);
  }
}

/**
 * The phone itself says it has no connection. Then a request with no answer
 * is no news: the screen already says so once, calmly, and records go to the
 * offline queue (Lucas 2026-10-23: offline, the field home was a wall of red
 * 「无法连接服务器」). An outage while the phone is online is still said.
 */
function phoneSaysOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** A request that got no answer: offline, unreachable, or an upload cut off. */
function noAnswer(error: unknown): ApiError {
  return error instanceof UploadTimeout
    ? new ApiError(t("errors.uploadTimeout"), 0, {}, "timeout")
    : new ApiError(t("errors.network"), 0);
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const { method = "GET", body, query, signal, auth = true } = options;
  const headers: Record<string, string> = {};

  if (auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const projectId = getActiveProjectId();
    if (projectId) headers["X-MSE-Project"] = projectId;
    if (options.signOffPin) headers["X-Sign-Off-PIN"] = options.signOffPin;
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

  if (body instanceof FormData) {
    return fetchWithUploadTimeout(buildUrl(path, query), { method, headers, body: payload }, signal);
  }
  return fetch(buildUrl(path, query), { method, headers, body: payload, signal });
}

/**
 * What to say when the answer is not ours: a proxy's HTML page. A body too
 * big for the gateway (413) says what to do instead; a gateway that got no
 * answer from the server (502 / 503 / 504) says to try again later - never
 * the bare 「出了点问题」 (P-phonefix).
 */
export function proxyFailureMessage(status: number): { message: string; code: string } {
  if (status === 413) return { message: t("errors.uploadTooLarge"), code: "upload_too_large" };
  if (status === 502 || status === 503 || status === 504) {
    return { message: t("errors.serverBusy"), code: "server_busy" };
  }
  return { message: t("errors.generic"), code: "" };
}

async function parseEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  try {
    return (await response.json()) as ApiEnvelope<T>;
  } catch {
    // A gateway timeout or a proxy error page: not JSON, but still a failure
    // the caller has to see as one.
    const { message, code } = proxyFailureMessage(response.status);
    return {
      success: false,
      message,
      ...(code ? { code } : {}),
      errors: {},
    };
  }
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  // A photo upload declares the originals this phone keeps for its photos
  // (H5 三, WP1). Once, before the first send: a 401 resend reuses the body.
  const declared =
    options.body instanceof FormData && carriesOriginals(options.body)
      ? await attachOriginalManifest(options.body)
      : [];
  // Sent again with the sign-off PIN when the server asks for it (I29).
  const asked: SignOffMemory = {};
  for (let attempt = options; ; ) {
    let response: Response;
    const usedAccess = attempt.auth === false ? undefined : getAccessToken();
    try {
      response = await send(path, attempt);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      const failure = noAnswer(error);
      if (attempt.signOffPin) settleSignOff();
      if (!attempt.silent && !phoneSaysOffline()) toast.error(failure.message);
      throw failure;
    }

    // One retry, and only for requests that are not themselves part of signing
    // in, or a failed login would try to refresh and bounce the user out.
    if (
      response.status === 401 &&
      attempt.auth !== false &&
      !isCredentialExchange(path)
    ) {
      let refreshed: boolean;
      try {
        refreshed = await ensureRefresh(usedAccess);
        if (refreshed) response = await send(path, attempt);
      } catch (error) {
        // The renewal or the resend got no answer: the same as the first send
        // getting none. Uncaught, it reached the form as a bare error, so a
        // delivery 提交 on a weak signal said 「操作失败」 instead of going into
        // the offline queue.
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        const failure = noAnswer(error);
        if (!attempt.silent && !phoneSaysOffline()) toast.error(failure.message);
        throw failure;
      }
      if (!refreshed) {
        endSession();
        throw new ApiError(t("auth.sessionExpired"), 401);
      }
    }

    const envelope = await parseEnvelope<T>(response);

    if (!response.ok || !envelope.success) {
      const code = envelope.success ? "" : (envelope.code ?? "");
      const errors = envelope.success ? {} : translateFieldErrors(envelope.errors);
      const values = envelope.success ? undefined : envelope.values;
      const message = resolveMessage(code, envelope.success ? "" : envelope.message, values);

      // The sign-off PIN (I29): ask, and send the same request again.
      const pin = attempt.noSignOffPrompt
        ? undefined
        : await answerSignOff(response.status, code, message, attempt.signOffPin, values, asked);
      if (pin) {
        attempt = { ...attempt, signOffPin: pin };
        continue;
      }
      if (pin === null) throw signOffCancelled(response.status);

      const failure = new ApiError(message, response.status, errors, code, values);

      // The same exemption as the retry above. It was missing here, so a
      // wrong password skipped the refresh correctly and was then signed out
      // anyway one block later - cleared tokens, "your session has expired",
      // and a hard navigation away from the entrance being typed into.
      if (
        response.status === 401 &&
        attempt.auth !== false &&
        !isCredentialExchange(path)
      ) {
        endSession();
      } else if (!attempt.silent) {
        toast.error(message);
      }
      throw failure;
    }

    if (attempt.signOffPin) settleSignOff();
    if (declared.length) await markOriginalsDeclared(declared);
    return envelope.data;
  }
}

/**
 * The failure a closed PIN dialog leaves (I29, ID77): the person chose not to
 * go on, so there is nothing to say. It carries no message and no field
 * errors, so every screen that shows `error.message` or places
 * `error.errors` stays quiet without checking the code itself.
 */
function signOffCancelled(status: number): ApiError {
  return new ApiError("", status, {}, SIGN_OFF_CANCELLED);
}

/** What one request's PIN dialog remembers between its retries. */
interface SignOffMemory {
  action?: string;
}

/**
 * A refusal about the sign-off PIN, answered in the shared dialog (I29).
 *
 * The PIN typed, to send the request again with; `null` when the dialog was
 * closed (the operation is not done, and nothing is toasted); `undefined`
 * when this refusal is not the dialog's - the caller handles it as any other.
 */
async function answerSignOff(
  status: number,
  code: string,
  message: string,
  sentPin: string | undefined,
  values: Record<string, string | number> | undefined,
  asked: SignOffMemory,
): Promise<string | null | undefined> {
  if (!isSignOffRefusal(status, code, Boolean(sentPin)) || !hasSignOffDialog()) {
    if (sentPin) settleSignOff();
    return undefined;
  }
  // The operation the first refusal named: a wrong PIN's answer keeps
  // saying what the PIN is for, even if the server left it out.
  const action = typeof values?.action === "string" ? values.action : asked.action;
  if (!asked.action) asked.action = action;
  const lockedUntil = typeof values?.locked_until === "string" ? values.locked_until : undefined;
  const pin = await askSignOff({ code, message, action: asked.action, lockedUntil });
  if (!pin) settleSignOff();
  return pin || null;
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
  // Claimed on entry, before the first await, so a capture belongs to the
  // download its own export started (see `captureDownload`).
  const capture = captureSlot;
  captureSlot = null;
  const response = await fetchFile(path, options);
  const blob = await response.blob();
  if (capture) {
    capture(
      new File(
        [blob],
        filenameFromDisposition(response.headers.get("Content-Disposition")) ??
          options.fallbackFilename,
        { type: blob.type || "application/octet-stream" },
      ),
    );
    return;
  }
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

let captureSlot: ((file: File) => void) | null = null;
let captureQueue: Promise<unknown> = Promise.resolve();

/**
 * Run an export and keep its file instead of saving it (PDF 统一操作规则,
 * 2026-10-10): 预览、打印、导出、发送 all work on the one file the export
 * produced, so what is previewed is byte for byte what is printed, saved or
 * sent.
 *
 * Every screen's export already ends in exactly one `download()` carrying the
 * columns, filters and wording only that screen knows. Rather than give forty
 * export functions a second "fetch only" twin, the `download()` that starts
 * while `run` runs hands its file here and saves nothing. Captures run one at
 * a time, so two cannot take each other's file.
 *
 * Rejects when `run` fails (the service has already toasted why) or ends
 * without downloading anything.
 */
export function captureDownload(run: () => Promise<unknown>): Promise<File> {
  const job = captureQueue.then(async () => {
    let captured: File | null = null;
    const mine = (file: File) => {
      captured = file;
    };
    captureSlot = mine;
    try {
      await run();
    } finally {
      if (captureSlot === mine) captureSlot = null;
    }
    if (!captured) throw new Error("export produced no file");
    return captured as File;
  });
  captureQueue = job.catch(() => undefined);
  return job;
}

/**
 * A file the API serves, as a `File` with the name the server gave it - for
 * handing to the phone's share sheet (2026-10 C11, Web Share API).
 */
export async function fetchAsFile(
  path: string,
  options: RequestOptions & { fallbackFilename: string },
): Promise<File> {
  const response = await fetchFile(path, options);
  const blob = await response.blob();
  const name =
    filenameFromDisposition(response.headers.get("Content-Disposition")) ??
    options.fallbackFilename;
  return new File([blob], name, { type: blob.type || "application/octet-stream" });
}

/**
 * A file the API serves, as an object URL the page can show in a frame and
 * print (the MR form's Preview / Print, C06). The caller revokes it.
 */
export async function fetchObjectUrl(path: string, options: RequestOptions = {}): Promise<string> {
  const response = await fetchFile(path, options);
  return URL.createObjectURL(await response.blob());
}

/** Fetch a file with the session's auth, refreshing once, toasting failure. */
async function fetchFile(path: string, options: RequestOptions): Promise<Response> {
  // Sent again with the sign-off PIN when the server asks for it (I29): a
  // daily report's PDF and the list's export are signed.
  const asked: SignOffMemory = {};
  for (let attempt = options; ; ) {
    let response: Response;
    const usedAccess = attempt.auth === false ? undefined : getAccessToken();
    try {
      response = await send(path, attempt);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      const failure = noAnswer(error);
      if (attempt.signOffPin) settleSignOff();
      if (!attempt.silent && !phoneSaysOffline()) toast.error(failure.message);
      throw failure;
    }

    if (response.status === 401) {
      const refreshed = await ensureRefresh(usedAccess);
      if (refreshed) {
        response = await send(path, attempt);
      } else {
        endSession();
        throw new ApiError(t("auth.sessionExpired"), 401);
      }
    }

    if (!response.ok) {
      const envelope = await parseEnvelope<never>(response);
      const code = envelope.success ? "" : (envelope.code ?? "");
      const values = envelope.success ? undefined : envelope.values;
      const message = resolveMessage(code, envelope.success ? "" : envelope.message, values);
      const pin = attempt.noSignOffPrompt
        ? undefined
        : await answerSignOff(response.status, code, message, attempt.signOffPin, values, asked);
      if (pin) {
        attempt = { ...attempt, signOffPin: pin };
        continue;
      }
      if (pin === null) throw signOffCancelled(response.status);
      if (!attempt.silent) toast.error(message);
      throw new ApiError(message, response.status, {}, code);
    }
    if (attempt.signOffPin) settleSignOff();
    return response;
  }
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
  // A machine switched off, removed or moved since the phone loaded its list.
  "equipment_not_found",
  // A write to a record the office confirmed and archived: the server's
  // sentence names a model and an id, the catalogue says what to do.
  "record_archived",
]);

/**
 * Word each field's failure, keeping only the first per field.
 *
 * A form shows one message under an input, so the rest would never be read.
 * Accepts the older shape of plain strings too, in case an endpoint has not
 * been moved onto `serialize_errors` yet.
 */
function translateFieldErrors(errors: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  // A bare list or sentence where the field map should be is still a reason.
  if (typeof errors === "string" || Array.isArray(errors)) {
    const worded = wordFieldError(errors);
    return worded ? { non_field_errors: worded } : {};
  }
  if (typeof errors !== "object") return result;
  /*
   * A failure that arrived without an `errors` key at all (F-366). Django
   * always sends the envelope, but a proxy, a gateway or a rate limiter in
   * front of it does not - and `Object.entries(undefined)` throws a TypeError
   * from inside the error path, which reaches the caller *instead of* the
   * ApiError carrying the status. Everything that decides what to do by
   * reading `error.status` - signing out on a 401, retrying a 429 - is then
   * deciding from an error that has no status.
   */
  for (const [field, value] of Object.entries(errors ?? {})) {
    // An empty list names no failure: nothing to put under the field.
    if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;
    // A field the server named always gets a sentence (2026-10-08). A nested
    // detail - `{photos: {0: [...]}}`, or an object with no code or message -
    // used to come out as `undefined` here, so a refusal made only of such
    // fields left the 设备进场 dialog with "check the highlighted fields" and
    // nothing highlighted.
    result[field] = wordFieldError(value) || catalogueWording("invalid") || t("errors.generic");
  }
  return result;
}

/** The catalogue's wording for a DRF code, or "" when it has none. */
function catalogueWording(code: string): string {
  const key = `errors.field.${code}`;
  const translated = t(key);
  return translated === key ? "" : translated;
}

/**
 * The first sentence anywhere in one field's error detail, or "".
 *
 * Reads a plain string, a `{code, message}` entry, a list of either, and -
 * flattened depth first - a nested dict of them.
 */
function wordFieldError(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const worded = wordFieldError(item);
      if (worded) return worded;
    }
    return "";
  }
  if (typeof value !== "object") return String(value);

  const entry = value as Partial<FieldError> & Record<string, unknown>;
  if (typeof entry.code === "string" || typeof entry.message === "string") {
    const code = typeof entry.code === "string" ? entry.code : "";
    const message = typeof entry.message === "string" ? entry.message : "";
    const catalogue = code ? catalogueWording(code) : "";
    // Outside the structural set the server's sentence is the specific one, so
    // it wins; the catalogue stays as the fallback for a failure that arrived
    // with no message at all.
    return CATALOGUE_WINS.has(code) ? catalogue || message : message || catalogue;
  }
  for (const inner of Object.values(entry)) {
    const worded = wordFieldError(inner);
    if (worded) return worded;
  }
  return "";
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

/**
 * While above zero, services' own success toasts stay quiet.
 *
 * A phone submit says one thing when it is done - 「提交成功」 or 「已暂存，等待
 * 上传」 (Lucas, 2026-10-09) - and the upload queue says what it sent in one
 * line; the per-service sentence underneath would be a second, differently
 * worded toast for the same press. Ambient for the same reason as the
 * provenance stamp: the submit reaches the server through a dozen service
 * functions that each toast for themselves.
 */
let quietSuccess = 0;

export async function withoutSuccessToasts<T>(run: () => Promise<T>): Promise<T> {
  quietSuccess += 1;
  try {
    return await run();
  } finally {
    quietSuccess -= 1;
  }
}

export const SUCCESS_TOAST_MS = 4000;
const SUCCESS_TOAST_FAILSAFE_MS = 3000;

/**
 * A success toast that always goes away.
 *
 * Sonner pauses a toast's timer while the list counts as hovered. On a phone
 * the tap that picked a header menu item lands where the toast then appears,
 * and iOS sends a compatibility mouse-move there that is never followed by a
 * mouse-leave - so 「资料已更新」 stayed on screen for good (Lucas, 2026-10-22).
 * A hard dismiss shortly after the normal duration closes it regardless.
 */
export function showSuccessToast(message: string): void {
  const id = toast.success(message, { duration: SUCCESS_TOAST_MS });
  setTimeout(() => toast.dismiss(id), SUCCESS_TOAST_MS + SUCCESS_TOAST_FAILSAFE_MS);
}

/** Toast a success message. Services call this; components never do. */
export function toastSuccess(messageKey: string, values?: Record<string, unknown>): void {
  if (quietSuccess > 0) return;
  showSuccessToast(t(messageKey, values));
}

/** The outcome of a phone submit or an upload pass: always said. */
export function toastOutcome(messageKey: string, values?: Record<string, unknown>): void {
  showSuccessToast(t(messageKey, values));
}
