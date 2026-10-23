/**
 * Installing the field app on a phone, and finding the way back in.
 *
 * An iPhone home-screen app does not share storage with Safari: no
 * localStorage, no cookies. Whatever Safari learnt when the worker typed the
 * PIN - the device id, the session, the handoff token - is invisible to the
 * app. The only thing that crosses over is the address the app starts at.
 *
 * So the page the worker adds to the Home Screen must carry the handoff token
 * in its *own* address, and must be a page the browser really loaded (not one
 * reached by a client-side route change, where Safari can still be holding the
 * manifest of the page before). Both rules live here so they can be tested.
 */

export type InstallEnvironment =
  | "ios-safari"
  | "ios-chrome"
  | "ios-other"
  | "ios-in-app"
  | "android"
  | "desktop-chromium"
  | "other";

/** Chat and social apps that name their own web view on iPhone. */
const IOS_IN_APP = /FBAN|FBAV|FB_IAB|Instagram|\bLine\/|MicroMessenger|musical_ly|Bytedance|TikTok|Twitter|WhatsApp|GSA\//;

export function detectInstallEnvironment(input?: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}): InstallEnvironment {
  const source =
    input ??
    (typeof navigator === "undefined"
      ? null
      : {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          maxTouchPoints: navigator.maxTouchPoints,
        });
  if (!source) return "other";
  const raw = source.userAgent;
  const agent = raw.toLowerCase();
  const ios =
    /iphone|ipad|ipod/.test(agent) ||
    (source.platform === "MacIntel" && (source.maxTouchPoints ?? 0) > 1);
  if (ios) {
    if (IOS_IN_APP.test(raw)) return "ios-in-app";
    if (agent.includes("crios")) return "ios-chrome";
    if (
      agent.includes("fxios") ||
      agent.includes("edgios") ||
      agent.includes("opios")
    ) {
      return "ios-other";
    }
    // Safari always says "Safari/"; a web view embedded in some other app
    // (one that does not name itself) does not.
    if (!agent.includes("safari/")) return "ios-in-app";
    return "ios-safari";
  }
  if (agent.includes("android")) return "android";
  if (/chrome|chromium|edg|opr/.test(agent)) return "desktop-chromium";
  return "other";
}

export function isIosEnvironment(environment: InstallEnvironment): boolean {
  return environment.startsWith("ios-");
}

/**
 * The page to add to the Home Screen from: its address carries the token, and
 * its server-rendered manifest starts the app at the token too.
 */
export function fieldReadyPath(token: string, next?: string): string {
  return `/trace/field-ready?bootstrap=${encodeURIComponent(token)}${
    next ? `&next=${encodeURIComponent(next)}` : ""
  }`;
}

/** Where an installed app signs itself in with the token. */
export function fieldAppStartPath(token: string, next?: string): string {
  return `/field-pwa-bootstrap?token=${encodeURIComponent(token)}${
    next ? `&next=${encodeURIComponent(next)}` : ""
  }`;
}

/** The activation link itself, used as the start of an app added before the PIN. */
export function fieldActivatePath(invitation: string): string {
  return `/trace/field-activate?token=${encodeURIComponent(invitation)}`;
}

/**
 * What the PIN screen should say when this storage has never been linked.
 *
 * - `installed-app`: an iPhone home-screen app that was added from a page
 *   without the token. It has its own empty storage, so no PIN can work here.
 * - `in-app`: a chat app's browser. Linking it would link only that app.
 * - `browser`: an ordinary browser that has not been linked (or lost it).
 * - `null`: this storage has been linked before; the PIN is the right ask.
 */
export type UnboundReason = "installed-app" | "in-app" | "browser";

/** Which of the three ways in applies to this browser context. */
export function contextReason(input: {
  standalone: boolean;
  environment: InstallEnvironment;
}): UnboundReason {
  if (input.standalone) return "installed-app";
  if (input.environment === "ios-in-app") return "in-app";
  return "browser";
}

/**
 * Why the PIN alone cannot sign in here, or `null` when it can.
 *
 * `linked` means this storage has signed in as a field phone before; a held
 * hand-off token means it can sign itself in. Either way the PIN is the right
 * ask. Otherwise the storage has never been linked - most often an iPhone
 * home-screen app added from a page without the token.
 */
export function unboundReason(input: {
  linked: boolean;
  hasBootstrapToken: boolean;
  standalone: boolean;
  environment: InstallEnvironment;
}): UnboundReason | null {
  if (input.linked || input.hasBootstrapToken) return null;
  return contextReason(input);
}

/**
 * The short reason shown as 「原因：…」 under the "not linked" help, and sent
 * to the server log, so a screenshot says why this phone could not sign in.
 *
 * - `companion-pin`: this page holds the app link; the PIN typed here signs
 *   it in.
 * - `refused:<code>`: the app had a link and the server refused it.
 * - `device-refused`: the PIN was refused for this storage.
 * - `in-app` / `not-standalone`: a chat app's browser / a browser tab.
 * - `no-token`: the installed app opened without any link - added from a
 *   page whose manifest had none (Lucas 2026-10-23).
 */
export function unboundCode(input: {
  standalone: boolean;
  environment: InstallEnvironment;
  refusedCode?: string | null;
  deviceRefused?: boolean;
  joinLink?: boolean;
}): string {
  if (input.joinLink || input.refusedCode === "field_companion_pin_required") {
    return "companion-pin";
  }
  if (input.refusedCode) return `refused:${input.refusedCode}`.slice(0, 40);
  if (input.deviceRefused) return "device-refused";
  if (!input.standalone) {
    return input.environment === "ios-in-app" ? "in-app" : "not-standalone";
  }
  return "no-token";
}

/** Where the browser goes once a PIN has been accepted. */
export function fieldSignInDestination(input: {
  bootstrapToken?: string | null;
  next?: string;
  standalone: boolean;
}): string {
  // Inside the installed app the session is already in the app's own storage:
  // the ready page would only bounce to the workspace.
  if (input.standalone || !input.bootstrapToken) {
    return input.next ?? "/field-staff";
  }
  return fieldReadyPath(input.bootstrapToken, input.next);
}

/**
 * What the activation / PIN screen shows. Once a PIN has been accepted the
 * screen only ever says "opening": the form must not come back while the
 * browser loads the next page (Lucas 2026-10-22: 「我第一次输入了又跳回去输入
 * pin的页面」 - signing in reset the invitation query, the form reappeared
 * on a slow line, and a second PIN retired the first hand-off token).
 */
export type FieldAccessView = "opening" | "loading" | "resuming" | "invalid" | "form";

export function fieldAccessView(input: {
  signedIn: boolean;
  hasInvitation: boolean;
  invitationLoading: boolean;
  invitationError: boolean;
  resuming: boolean;
}): FieldAccessView {
  if (input.signedIn) return "opening";
  if (input.hasInvitation && input.invitationLoading) return "loading";
  if (input.resuming) return "resuming";
  if (input.hasInvitation && input.invitationError) return "invalid";
  return "form";
}

/**
 * Whether opening the activation link again may skip the PIN because this
 * browser is already signed in through it.
 *
 * Only a session started from this very link counts. A session from an older
 * link was ended by the office when it issued this one; skipping the PIN on
 * it opened the workspace, which bounced back to the plain sign-in screen
 * with 「办公室已重新发出链接」, where a PIN cannot link the new link - the
 * worker had to open the link a second time (Lucas 2026-10-23). The server
 * clears `activated_at` when it issues a new link and sets it when the link
 * is first used, so a session issued before that moment is from an older link.
 */
export function activationLinkSignedIn(input: {
  /** The link has run out: the session in this browser is all that counts. */
  invitationExpired: boolean;
  invitationUserId: string | null | undefined;
  /** When the link was first used to link a phone (ISO), null if not yet. */
  activatedAt: string | null | undefined;
  sessionUserId: string | null;
  /** The session's `iat` (seconds, server clock), null if unreadable. */
  sessionIssuedAt: number | null;
}): boolean {
  if (input.invitationExpired) return true;
  if (input.sessionUserId && input.invitationUserId !== input.sessionUserId) return false;
  if (!input.activatedAt || input.sessionIssuedAt === null) return false;
  const activated = Date.parse(input.activatedAt);
  if (Number.isNaN(activated)) return false;
  return input.sessionIssuedAt >= Math.floor(activated / 1000);
}

/**
 * Whether to offer "add to Home Screen" help on the iPhone: Safari (or another
 * iOS browser) in a tab, never inside the installed app.
 */
export function showIosInstallGuide(input: {
  environment: InstallEnvironment;
  standalone: boolean;
}): boolean {
  return !input.standalone && isIosEnvironment(input.environment);
}

/**
 * Which install help the ready page shows below its buttons.
 *
 * - `ios-steps`: iPhone Safari. iOS has no install prompt, so the numbered
 *   steps (and the arrow at Safari's bar) are always shown.
 * - `android-steps`: Android when Chrome has not handed us its install prompt
 *   (or the worker asked for help): the menu steps instead.
 * - `none`: Android with a ready prompt - the Install button opens the real
 *   system prompt - or anything else the generic help covers.
 */
export function installGuideVariant(input: {
  environment: InstallEnvironment;
  guideVisible: boolean;
  nativePromptReady: boolean;
}): "ios-steps" | "android-steps" | "none" {
  if (input.environment === "ios-safari") return "ios-steps";
  if (input.environment === "android") {
    return input.guideVisible || !input.nativePromptReady ? "android-steps" : "none";
  }
  return "none";
}

export const MANIFEST_TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

/**
 * The first-party cookie that carries the hand-off in an iPhone browser tab,
 * so the server can render every field page's manifest link with it
 * (`syncFieldBootstrapCookie`).
 */
export const FIELD_BOOTSTRAP_COOKIE = "mse_field_bootstrap";

/**
 * Whether a field page should load itself once more so the server renders
 * its manifest link with the hand-off.
 *
 * Only in an iPhone browser tab (where Share -> Add to Home Screen makes an
 * app with storage of its own), only when the page was rendered without the
 * hand-off the tab now holds, only once the cookie really carries it (else a
 * reload changes nothing), and at most once per tab session.
 */
export function manifestReloadNeeded(input: {
  renderedHref: string;
  held: string | null;
  cookie: string | null;
  environment: InstallEnvironment;
  standalone: boolean;
  alreadyReloaded: boolean;
}): boolean {
  if (input.standalone || input.alreadyReloaded) return false;
  if (!isIosEnvironment(input.environment) || input.environment === "ios-in-app") {
    return false;
  }
  const held = validBootstrap(input.held);
  if (!held || input.cookie !== held) return false;
  return input.renderedHref !== fieldManifestHref(held);
}

/** The manifest link a field page is rendered with, given the cookie value. */
export function fieldManifestHref(cookieToken: string | null | undefined): string {
  const token = cookieToken && MANIFEST_TOKEN.test(cookieToken) ? cookieToken : "";
  return token
    ? `/field-manifest.webmanifest?bootstrap=${encodeURIComponent(token)}`
    : "/field-manifest.webmanifest";
}

/**
 * The field app's manifest. Its start_url is where an installed app opens on
 * every launch, and on an iPhone that app has storage of its own - nothing
 * Safari stored reaches it. So the start carries whatever lets it sign in:
 *
 * - `bootstrap`: the hand-off made at the PIN; the app signs itself in.
 * - `invitation`: added from the activation link before the PIN; the app
 *   opens on that link and the PIN is typed inside the app.
 * - neither: the PIN screen, which explains the way in when it cannot work.
 */
export function fieldManifestStartUrl(
  search: URLSearchParams,
  cookieToken?: string | null,
): string {
  const bootstrap = search.get("bootstrap") ?? "";
  if (MANIFEST_TOKEN.test(bootstrap)) return fieldAppStartPath(bootstrap, "/field-staff");
  const invitation = search.get("invitation") ?? "";
  if (MANIFEST_TOKEN.test(invitation)) return fieldActivatePath(invitation);
  // No hand-off in the link: the one this browser holds in its cookie (sent
  // only when the link asks for credentials).
  if (cookieToken && MANIFEST_TOKEN.test(cookieToken)) {
    return fieldAppStartPath(cookieToken, "/field-staff");
  }
  return "/trace/field-login";
}


/** The query parameter that carries the hand-off on a field page's address. */
export const BOOTSTRAP_PARAM = "bootstrap";

/** A hand-off value we would ever act on (same shape the manifest accepts). */
export function validBootstrap(value: string | null | undefined): string | null {
  return value && MANIFEST_TOKEN.test(value) ? value : null;
}

/** `path?query#hash` with the hand-off set to `token`, or removed when `null`. */
export function withBootstrapParam(address: string, token: string | null): string {
  const url = new URL(address, "http://field.local");
  if (token) url.searchParams.set(BOOTSTRAP_PARAM, token);
  else url.searchParams.delete(BOOTSTRAP_PARAM);
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
}

/**
 * The address a field workspace page should show, or `null` to leave it.
 *
 * iPhone Safari's own Share -> Add to Home Screen saves the address in the
 * bar, and the app it makes has empty storage of its own (Lucas 2026-10-22:
 * 「如果我在工作台里面添加去主屏幕就会显示还没有绑定」). So in a Safari tab
 * every workspace page keeps the live hand-off in its address, and the app
 * started from such an address signs itself in with it. Inside the installed
 * app the hand-off has done its job and comes off the address again, so it is
 * not on screen, in screenshots or in links copied from the app.
 */
export function fieldWorkspaceAddress(input: {
  address: string;
  token: string | null;
  standalone: boolean;
  environment: InstallEnvironment;
}): string | null {
  const url = new URL(input.address, "http://field.local");
  const shown = url.searchParams.get(BOOTSTRAP_PARAM);
  const keep = showIosInstallGuide({
    environment: input.environment,
    standalone: input.standalone,
  });
  const wanted = keep ? validBootstrap(input.token) : null;
  if ((shown ?? null) === wanted) return null;
  // A tab with no hand-off of its own leaves whatever it was given alone.
  if (keep && !wanted) return null;
  return withBootstrapParam(input.address, wanted);
}

/**
 * Where a workspace page with no signed-in user goes.
 *
 * With a hand-off on its address (an app added from a workspace page, opening
 * for the first time with empty storage) it signs in with that, then comes
 * back to the same page without it. Otherwise: the PIN screen.
 */
export function fieldWorkspaceSignIn(address: string, standalone: boolean): string {
  const url = new URL(address, "http://field.local");
  const token = validBootstrap(url.searchParams.get(BOOTSTRAP_PARAM));
  const back = withBootstrapParam(address, null);
  // Only the installed app signs in with a link on its address alone. A
  // browser tab with one gets the PIN screen, and the PIN typed there signs
  // the tab in as one more place of that account.
  if (token && standalone) return fieldAppStartPath(token, back);
  if (token) return fieldJoinWithPinPath(token, back);
  return `/trace/field-login?next=${encodeURIComponent(back)}`;
}

/**
 * What the installed app's start page does with the link it opened on.
 *
 * - `keep-session`: this storage is already signed in (a relaunch, a reload):
 *   go straight in, never exchange the link again;
 * - `exchange`: empty storage (the first open): sign in with the link;
 * - `missing`: no link at all.
 */
export function fieldBootstrapStep(input: {
  token: string;
  hasSession: boolean;
  standalone: boolean;
}): "keep-session" | "exchange" | "tab-refused" | "missing" {
  if (input.hasSession) return "keep-session";
  if (!input.token) return "missing";
  // A browser tab never signs in from a link in its address alone (a copied
  // link would otherwise sign a stranger in): it is asked for the PIN.
  return input.standalone ? "exchange" : "tab-refused";
}

/** The PIN screen, carrying the app link that the PIN signs this page in with. */
export function fieldJoinWithPinPath(token: string, next?: string): string {
  return `/trace/field-login?${BOOTSTRAP_PARAM}=${encodeURIComponent(token)}${
    next ? `&next=${encodeURIComponent(next)}` : ""
  }`;
}
