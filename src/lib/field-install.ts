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
 * Whether to offer "add to Home Screen" help on the iPhone: Safari (or another
 * iOS browser) in a tab, never inside the installed app.
 */
export function showIosInstallGuide(input: {
  environment: InstallEnvironment;
  standalone: boolean;
}): boolean {
  return !input.standalone && isIosEnvironment(input.environment);
}

export const MANIFEST_TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

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
export function fieldManifestStartUrl(search: URLSearchParams): string {
  const bootstrap = search.get("bootstrap") ?? "";
  if (MANIFEST_TOKEN.test(bootstrap)) return fieldAppStartPath(bootstrap);
  const invitation = search.get("invitation") ?? "";
  if (MANIFEST_TOKEN.test(invitation)) return fieldActivatePath(invitation);
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
  // Only the installed app signs in with a link on its address. A browser tab
  // with one is most likely a copied workspace link: it gets the PIN screen
  // (which explains the way in) and the link comes off the address.
  if (token && standalone) return fieldAppStartPath(token, back);
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
  // A browser tab never signs in from a link in its address (a copied link
  // would otherwise sign a stranger in): the activation link is the way in.
  return input.standalone ? "exchange" : "tab-refused";
}

/** The PIN screen of the installed app, carrying its link to join with. */
export function fieldJoinWithPinPath(token: string, next?: string): string {
  return `/trace/field-login?${BOOTSTRAP_PARAM}=${encodeURIComponent(token)}${
    next ? `&next=${encodeURIComponent(next)}` : ""
  }`;
}
