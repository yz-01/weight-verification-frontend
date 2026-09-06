/**
 * Recognising a browser that lives inside a chat app.
 *
 * A field phone is linked by an id kept in the browser storage where the
 * invitation link was opened. Chat apps open links in their own web view with
 * their own storage, so activating inside one links *that* view - and the same
 * phone, opened later in Safari or from the home screen, arrives as a
 * different device and is refused.
 *
 * This cannot be complete, and it is not treated as if it were. WhatsApp in
 * particular does not identify itself: on Android it hands links to a Chrome
 * Custom Tab, which shares Chrome storage and is fine, and on iOS it has used
 * both a shared Safari view and its own web view depending on the version.
 * There is no reliable signal for it.
 *
 * So the screen says the important sentence to everybody, and this only
 * decides whether to say it loudly. A detector that quietly did nothing for
 * the most common chat app in Malaysia would be worse than no detector: it
 * would look like the case was handled.
 */

/** Chat and social apps that identify their own web view. */
const KNOWN = [
  [/FBAN|FBAV|FB_IAB/, "Facebook"],
  [/Instagram/, "Instagram"],
  [/\bLine\//, "LINE"],
  [/MicroMessenger/, "WeChat"],
  [/musical_ly|Bytedance|TikTok/, "TikTok"],
  [/Twitter/, "X"],
] as const;

/** The app whose web view this is, or null when nothing says. */
export function inAppBrowserName(): string | null {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  for (const [pattern, name] of KNOWN) {
    if (pattern.test(ua)) return name;
  }
  return null;
}

/**
 * Whether the page is running as an installed app rather than in a browser tab.
 *
 * An installed app has its own storage and its own start URL, so it is neither
 * a chat web view nor the browser that activated it - which is exactly why
 * this is worth knowing separately.
 */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone;
  if (standalone === true) return true;
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches);
}
