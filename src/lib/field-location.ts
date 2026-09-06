/**
 * Asking a phone where it is, and knowing what to say when it will not tell you.
 *
 * A website cannot switch a phone's GPS on and cannot grant itself permission.
 * No browser allows it, on any platform, and nothing here pretends otherwise.
 * What it can do is the part that was missing: ask at a moment the person
 * understands, and when the answer is no, say where the switch actually is.
 *
 * The user reported the consequence (2026-09-05): the field app asked for
 * location the instant it opened, most people's first reaction to an
 * unexplained system prompt is Don't Allow, and after that the app only ever
 * said "location unavailable" - so workers left the site app to hunt through
 * Settings on their own.
 *
 * Two things make this harder than it looks.
 *
 * The Permissions API cannot be relied on. Safari does not answer
 * `permissions.query({ name: "geolocation" })` at all - it throws - so on the
 * platform where this matters most there is no way to ask whether permission
 * was already refused without triggering the request itself.
 *
 * And on iOS a page-level refusal and a system-level one are indistinguishable.
 * If Location Services is off, or the browser is not allowed to use it, the
 * request fails with the same `PERMISSION_DENIED` and no prompt ever appears -
 * a silent failure that looks exactly like the person having pressed Don't
 * Allow. Nothing in the web platform separates them, so the instructions cover
 * both rather than guessing at one.
 */

export interface LocationFix {
  latitude: string;
  longitude: string;
  accuracy: string;
}

export type LocationProblem =
  /** Refused: by this person on this page, or by the system, indistinguishably. */
  | "denied"
  /** The device tried and could not get a fix - indoors, no signal. */
  | "unavailable"
  | "timeout"
  /** No geolocation API. An insecure origin, or a browser too old. */
  | "unsupported";

export class LocationRefused extends Error {
  readonly problem: LocationProblem;

  constructor(problem: LocationProblem) {
    super(`location_${problem}`);
    this.name = "LocationRefused";
    this.problem = problem;
  }
}

/** Which set of instructions applies to the phone in the reader's hand. */
export type LocationHelpTarget =
  | "iosSafari"
  | "iosOtherBrowser"
  | "androidChrome"
  | "androidOtherBrowser"
  | "desktop";

function agent(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent;
}

export function isIos(): boolean {
  const ua = agent();
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // An iPad on iPadOS reports itself as a Mac, and the touch points are the
  // only thing that gives it away.
  return (
    /Macintosh/.test(ua) &&
    typeof navigator !== "undefined" &&
    navigator.maxTouchPoints > 1
  );
}

export function isAndroid(): boolean {
  return /Android/.test(agent());
}

/**
 * The instructions that fit this device.
 *
 * On iOS every browser is WebKit underneath, but each one holds its own entry
 * under Location Services, and only Safari has the page menu that can undo a
 * per-site refusal. So the two are told apart.
 */
export function locationHelpTarget(): LocationHelpTarget {
  const ua = agent();
  if (isIos()) {
    const isSafari = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    return isSafari ? "iosSafari" : "iosOtherBrowser";
  }
  if (isAndroid()) {
    return /Chrome|CriOS/.test(ua) ? "androidChrome" : "androidOtherBrowser";
  }
  return "desktop";
}

/**
 * Whether permission is already settled, when the browser will say.
 *
 * Returns "unknown" rather than guessing. Safari throws on this query, and a
 * wrong guess here is worse than none: it would either skip the explanation
 * for somebody who needs it, or show instructions to somebody who already
 * granted permission and is simply indoors.
 */
export async function knownPermissionState(): Promise<
  "granted" | "denied" | "prompt" | "unknown"
> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unknown";
  }
  try {
    const status = await navigator.permissions.query({
      name: "geolocation" as PermissionName,
    });
    return status.state;
  } catch {
    return "unknown";
  }
}

/**
 * One position fix, or a `LocationRefused` saying which kind of no it was.
 *
 * The numbers are rounded to what the server stores - seven decimal places for
 * a coordinate, two for the accuracy - because a raw reading carries more
 * decimals than the column holds and is rejected as a validation error, which
 * reaches the worker as a sentence about a field they cannot see.
 */
export function requestLocation(
  options: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 15_000,
    maximumAge: 0,
  },
): Promise<LocationFix> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return Promise.reject(new LocationRefused("unsupported"));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
          accuracy: position.coords.accuracy.toFixed(2),
        }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new LocationRefused("denied"));
        } else if (error.code === error.TIMEOUT) {
          reject(new LocationRefused("timeout"));
        } else {
          reject(new LocationRefused("unavailable"));
        }
      },
      options,
    );
  });
}

export function problemOf(error: unknown): LocationProblem {
  return error instanceof LocationRefused ? error.problem : "unavailable";
}
