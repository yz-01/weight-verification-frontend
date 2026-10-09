/**
 * Where a notification takes a field worker, if anywhere.
 *
 * The field app is a different set of routes from the office console, so an
 * href written for the office cannot be pushed at a phone. What this used to
 * do with one was send the worker to `/field-staff` - the home screen. The
 * customer's complaint was 「每个通知也是可以点进去看细节的」, and landing on the
 * home after tapping a notification about a specific delivery is the same
 * answer as landing nowhere, only more confusing: it looks like the app
 * decided to go there (F-273).
 *
 * So an office path now returns `null`, meaning "no destination on this app",
 * and the caller opens the notification where it stands instead of navigating.
 * Two things follow from that, and both are deliberate:
 *
 * - A worker always gets to read the whole message, which is what they needed
 *   from a notification with no screen behind it.
 * - The office path is no longer quietly swallowed, so the fix for a
 *   notification that *should* have a field destination belongs where the href
 *   is written - on the server, per notifier - rather than being guessed at
 *   here. Guessing would mean a table of office-to-field translations that
 *   nobody updates when a route moves.
 *
 * The hazard-thread branch is kept and is the one exception, because that
 * link's shape is the field app's own. See T-211 and F-317 for what it can and
 * cannot currently open.
 */
export function fieldNotificationHref(
  href: unknown,
  data?: Record<string, unknown>,
): string | null {
  // A safety-incident broadcast sent before it carried an href names the
  // incident but no page; the field app's own safety record opens it.
  if (
    (typeof href !== "string" || !href) &&
    data?.entity === "safety_incident" &&
    typeof data.id === "string" &&
    data.id
  ) {
    return `/field-staff?tab=records&record=safety&incident=${encodeURIComponent(data.id)}`;
  }
  if (typeof href !== "string" || !href.startsWith("/")) return null;

  const parsed = new URL(href, "https://field.mse-trace.local");
  const thread = parsed.searchParams.get("thread");
  if (thread) {
    return `/field-staff?tab=incidents&thread=${encodeURIComponent(thread)}`;
  }

  // Field paths pass through with their query intact; everything else has no
  // destination here. Returning the home screen was the bug.
  return parsed.pathname === "/field-staff"
    ? `${parsed.pathname}${parsed.search}`
    : null;
}

/** The field workspace's own way in: see `openFieldHref`. */
export const FIELD_OPEN_EVENT = "mse:field-open";

/**
 * Open a field link, on the screen already showing when it can be.
 *
 * `router.push` to `/field-staff?…` from `/field-staff` changes only the query,
 * and two things went wrong with that on a phone. A link to the address already
 * showing - the same task tapped twice, 「查看我的全部任务」 after coming back
 * from it - changed nothing, so the workspace had nothing to follow and the tap
 * did nothing. Every other tap waited for the server's copy of a page that was
 * already on screen, so on a site connection it looked dead until it arrived,
 * and people tapped again. The workspace listens for this event and switches
 * there and then; it cancels the event to say it has, and anything it does not
 * cover (another page, no workspace mounted) still goes through `push`.
 */
export function openFieldHref(href: string, push: (href: string) => void) {
  const target = new URL(href, window.location.origin);
  if (
    target.origin === window.location.origin &&
    target.pathname === "/field-staff" &&
    window.location.pathname === "/field-staff"
  ) {
    const event = new CustomEvent(FIELD_OPEN_EVENT, {
      detail: `${target.pathname}${target.search}`,
      cancelable: true,
    });
    if (!window.dispatchEvent(event)) return;
  }
  push(href);
}
