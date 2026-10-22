/**
 * Tell the server about a screen that crashed in somebody's browser.
 *
 * A phone that flashes an error for a second leaves nothing behind: the
 * person cannot read it and we cannot see it (Lucas 2026-10-22, the first
 * open of the home-screen app). The error screens send what they caught here,
 * the server writes it to its log, and the screen shows a short code that
 * matches the log line, so a screenshot is enough to find it.
 *
 * Rules, all tested:
 * - never throws and never retries: a reporter that fails must not become a
 *   second error, and one that retries must not become a loop;
 * - at most `MAX_REPORTS_PER_PAGE` reports per page load, and the same error
 *   once per `SAME_ERROR_MS`;
 * - nothing when the browser says it is offline;
 * - plain `fetch`, not the API client: no session refresh, no sign-out, no
 *   navigation can follow from a report;
 * - credentials in the address (`token`, `bootstrap`, …) are blanked.
 */

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

export const CLIENT_ERROR_ENDPOINT = "/api/client_errors/report_client_error/";
export const MAX_REPORTS_PER_PAGE = 5;
export const SAME_ERROR_MS = 60_000;

const CREDENTIAL_PARAMS = ["token", "bootstrap", "invitation", "code", "key", "uid"];

export interface ClientErrorReport {
  code: string;
  name: string;
  message: string;
  stack: string;
  digest: string;
  url: string;
  user_agent: string;
  standalone: boolean;
  boundary: string;
  leaving: boolean;
  /** "crash" (an error screen) or "unbound" (an app that could not sign in). */
  kind: "crash" | "unbound";
}

type Reportable = { name?: string; message?: string; stack?: string; digest?: string };

type ReportContext = {
  boundary: string;
  standalone?: boolean;
  leaving?: boolean;
  kind?: "crash" | "unbound";
};

let sent = 0;
const lastSentAt = new Map<string, number>();

export function resetClientErrorReporterForTests(): void {
  sent = 0;
  lastSentAt.clear();
}

/** A short, stable code for an error: its digest, else a hash of name+message. */
export function clientErrorCode(error: Reportable | null | undefined): string {
  if (error?.digest) return String(error.digest).slice(0, 32);
  const text = `${error?.name ?? "Error"}:${error?.message ?? ""}`;
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  }
  return `E-${hash.toString(36).toUpperCase().padStart(7, "0").slice(-7)}`;
}

/** The line the error screen shows under its friendly text. */
export function clientErrorLine(error: Reportable | null | undefined): string {
  const message = (error?.message ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const code = clientErrorCode(error);
  return message ? `${code} · ${message}` : code;
}

/** The address with every credential-looking parameter blanked. */
export function redactAddress(href: string): string {
  try {
    const url = new URL(href);
    for (const name of CREDENTIAL_PARAMS) {
      if (url.searchParams.has(name)) url.searchParams.set(name, "-");
    }
    return url.toString().slice(0, 500);
  } catch {
    return "";
  }
}

export function buildClientErrorReport(
  error: Reportable | null | undefined,
  context: ReportContext,
): ClientErrorReport {
  const hasWindow = typeof window !== "undefined";
  const kind = context.kind ?? "crash";
  return {
    // An unbound report's "message" is its reason code, kept readable so the
    // log line matches the 「原因：…」 on the screen.
    code:
      kind === "unbound"
        ? String(error?.message ?? "").slice(0, 40)
        : clientErrorCode(error),
    name: String(error?.name ?? "Error").slice(0, 120),
    message: String(error?.message ?? "").slice(0, 500),
    stack: String(error?.stack ?? "").slice(0, 2000),
    digest: String(error?.digest ?? "").slice(0, 64),
    url: hasWindow ? redactAddress(window.location.href) : "",
    user_agent:
      typeof navigator === "undefined" ? "" : String(navigator.userAgent).slice(0, 400),
    standalone: Boolean(context.standalone),
    boundary: context.boundary.slice(0, 40),
    leaving: Boolean(context.leaving),
    kind,
  };
}

/**
 * Send one report. Returns whether it was sent (for tests); the request's own
 * outcome is never awaited by the caller and never surfaces.
 */
export function reportClientError(
  error: Reportable | null | undefined,
  context: ReportContext,
  deps: { fetch?: typeof fetch; now?: () => number; online?: () => boolean } = {},
): boolean {
  try {
    const online =
      deps.online ??
      (() => typeof navigator === "undefined" || navigator.onLine !== false);
    if (!online()) return false;
    if (sent >= MAX_REPORTS_PER_PAGE) return false;
    const report = buildClientErrorReport(error, context);
    const now = (deps.now ?? Date.now)();
    const key = `${report.code}|${report.boundary}`;
    const previous = lastSentAt.get(key);
    if (previous !== undefined && now - previous < SAME_ERROR_MS) return false;
    const send = deps.fetch ?? (typeof fetch === "undefined" ? null : fetch);
    if (!send) return false;
    sent += 1;
    lastSentAt.set(key, now);
    void Promise.resolve()
      .then(() =>
        send(`${BASE_URL}${CLIENT_ERROR_ENDPOINT}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(report),
          credentials: "omit",
          keepalive: true,
        }),
      )
      .catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}
